import { existsSync } from "fs";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import botConfig from "../config";
import {
  CHROME_ARGS,
  MEET_SELECTORS,
  TIMEOUTS,
  VIEWPORT,
} from "../config/constants";
import { createStorageSink, StorageSink } from "./storageSink";
import Transcriber from "./transcriber";
import SpeakerTimeline from "./speakerTimeline";
import { installPcTap } from "../browser/pcTap";

type BotState =
  | "joining_meeting"
  | "waiting_admission"
  | "admitted"
  | "recording"
  | "alone_detected"
  | "ended"
  | "kicked"
  | "error"
  | "timeout"
  | "finalizing_upload"
  | "complete";

class MeetBot {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isRecording = false;
  private startTime: number = 0;
  private shouldStop = false;
  private meetingId: string;
  private meetingCode: string | null;
  private recordingSink: StorageSink | null = null;
  private transcriber: Transcriber | null = null;
  private speakerTimeline: SpeakerTimeline | null = null;
  private hadOtherParticipants = false;

  constructor() {
    const rawCode = (botConfig.MEET_URL.split("/").pop() || "recording").split("?")[0];
    this.meetingCode = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(rawCode) ? rawCode : null;
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
    this.meetingId = `${rawCode}_${timestamp}`;
  }

  private reportStatus(state: BotState, extra?: Record<string, unknown>): void {
    const payload = { state, timestamp: new Date().toISOString(), ...extra };
    console.log(`[BOT_STATUS] ${JSON.stringify(payload)}`);
  }

  private reportMetrics(metrics: {
    deepgramSeconds: number;
    r2BytesStored: number;
  }): void {
    console.log(`[BOT_METRICS] ${JSON.stringify(metrics)}`);
  }

  async start(): Promise<void> {
    try {
      this.reportStatus("joining_meeting");
      await this.launchBrowser();
      await this.validateMeeting();
      await this.attemptJoin();
      await this.waitForAdmission();

      await this.startRecording();
      await this.monitorAndAutoExit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.reportStatus("error", { reason: message });
      throw err;
    } finally {
      await this.cleanup();
    }
  }

  stop(): void {
    this.shouldStop = true;
  }

  private async launchBrowser(): Promise<void> {
    console.log("[Bot] Launching browser...");

    this.browser = await chromium.launch({
      headless: botConfig.HEADLESS,
      args: CHROME_ARGS,
    });

    const hasAuthState =
      botConfig.AUTH_STATE_PATH && existsSync(botConfig.AUTH_STATE_PATH);
    if (hasAuthState) {
      console.log(`[Bot] Using Google session from ${botConfig.AUTH_STATE_PATH}`);
    } else {
      console.log("[Bot] No auth state found — joining anonymously");
    }

    this.context = await this.browser.newContext({
      permissions: ["camera", "microphone"],
      viewport: VIEWPORT,
      ...(hasAuthState ? { storageState: botConfig.AUTH_STATE_PATH } : {}),
    });

    await installPcTap(this.context);

    this.page = await this.context.newPage();
    console.log("[Bot] Browser launched");
  }

  private async validateMeeting(): Promise<void> {
    const page = this.getPage();
    console.log(`[Bot] Navigating to ${botConfig.MEET_URL}`);

    const response = await page.goto(botConfig.MEET_URL, {
      waitUntil: "networkidle",
      timeout: TIMEOUTS.NAVIGATION_TIMEOUT,
    });

    if (response && response.status() === 404) {
      throw new Error("Meeting not found (404)");
    }

    await page.waitForTimeout(TIMEOUTS.VALIDATION_WAIT);

    const bodyText = await page.textContent("body");
    if (!bodyText) return;

    for (const errorText of MEET_SELECTORS.ERROR_TEXTS) {
      if (bodyText.includes(errorText)) {
        throw new Error(`Invalid meeting: "${errorText}"`);
      }
    }

    console.log("[Bot] Meeting URL validated");
  }

  private async attemptJoin(): Promise<void> {
    const page = this.getPage();
    console.log("[Bot] Attempting to join meeting...");

    for (let attempt = 1; attempt <= TIMEOUTS.MAX_JOIN_ATTEMPTS; attempt++) {
      await this.dismissOverlays(page);
      await this.muteMediaControls(page);
      await this.fillNameInput(page);

      const joined = await this.clickJoinButton(page);
      if (joined) {
        console.log(`[Bot] Join button clicked on attempt ${attempt}`);
        return;
      }

      await page.waitForTimeout(TIMEOUTS.JOIN_ATTEMPT_INTERVAL);
    }

    throw new Error(
      `Failed to join after ${TIMEOUTS.MAX_JOIN_ATTEMPTS} attempts`
    );
  }

  private async dismissOverlays(page: Page): Promise<void> {
    for (const label of MEET_SELECTORS.DISMISS_BUTTONS) {
      const button = page.getByRole("button", { name: label });
      if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
        await button.click();
        console.log(`[Bot] Dismissed overlay: "${label}"`);
      }
    }
  }

  private async muteMediaControls(page: Page): Promise<void> {
    for (const selector of [
      MEET_SELECTORS.MIC_BUTTON,
      MEET_SELECTORS.CAMERA_BUTTON,
    ]) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
        const label = (await button.getAttribute("aria-label")) || "";
        const isOn =
          label.toLowerCase().includes("turn off") ||
          (await button.getAttribute("data-is-muted")) === "false";

        if (isOn) {
          await button.click();
          console.log(`[Bot] Muted: ${selector}`);
        }
      }
    }
  }

  private async fillNameInput(page: Page): Promise<void> {
    const input = page.locator(MEET_SELECTORS.NAME_INPUT);
    if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
      const currentValue = await input.inputValue();
      if (!currentValue) {
        await input.fill(botConfig.BOT_NAME);
        console.log(`[Bot] Entered name: "${botConfig.BOT_NAME}"`);
      }
    }
  }

  private async clickJoinButton(page: Page): Promise<boolean> {
    for (const label of MEET_SELECTORS.JOIN_BUTTONS) {
      const button = page.getByRole("button", { name: label, exact: true });
      if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
        await button.click();
        return true;
      }
    }
    return false;
  }

  private async waitForAdmission(): Promise<void> {
    const page = this.getPage();
    this.reportStatus("waiting_admission");

    const deadline = Date.now() + TIMEOUTS.ADMISSION_TIMEOUT;

    while (Date.now() < deadline) {
      for (const selector of MEET_SELECTORS.IN_MEETING_INDICATORS) {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
          this.reportStatus("admitted");
          return;
        }
      }

      const bodyText = await page.textContent("body");
      for (const text of MEET_SELECTORS.DECLINE_TEXTS) {
        if (bodyText?.includes(text)) {
          throw new Error(`Join request rejected: "${text}"`);
        }
      }

      await page.waitForTimeout(TIMEOUTS.ADMISSION_POLL_INTERVAL);
    }

    throw new Error("Admission timed out after 5 minutes");
  }

  private async startRecording(): Promise<void> {
    const page = this.getPage();

    console.log(`[Bot] Starting recording → ${this.meetingId}`);

    this.recordingSink = createStorageSink(`${this.meetingId}.webm`);
    await this.recordingSink.init();

    const useTranscription = Boolean(botConfig.DEEPGRAM_API_KEY);
    if (useTranscription) {
      this.transcriber = new Transcriber(this.meetingId);
      await this.transcriber.start();
    }

    await page.exposeFunction("__saveChunk", async (base64Data: string) => {
      const buffer = Buffer.from(base64Data, "base64");
      if (this.recordingSink) {
        await this.recordingSink.addChunk(buffer);
      }
    });

    await page.exposeFunction("__sendAudioChunk", (base64Data: string) => {
      if (this.transcriber) {
        const buffer = Buffer.from(base64Data, "base64");
        this.transcriber.sendAudio(buffer);
      }
    });

    await page.exposeFunction("__finishRecording", () => {
      return Promise.resolve();
    });

    await page.waitForTimeout(5000);
    try {
      await page.click("body", { force: true });
    } catch {
    }

    const hasTranscription = useTranscription;

    try {
      await page.evaluate(async (enableTranscription: boolean) => {
        console.log("Browser: Starting composite stream capture...");

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "browser" },
          preferCurrentTab: true,
          audio: false,
        });

        const videoTrack = displayStream.getVideoTracks()[0];
        if (!videoTrack) throw new Error("No video track from tab capture");
        console.log("Browser: Got video track:", videoTrack.label);

        const audioCtx = new AudioContext();
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        const destination = audioCtx.createMediaStreamDestination();
        const connectedElements = new WeakSet<HTMLMediaElement>();

        const connectElements = () => {
          const mediaElements: HTMLMediaElement[] = [
            ...Array.from(document.querySelectorAll<HTMLVideoElement>("video")),
            ...Array.from(document.querySelectorAll<HTMLAudioElement>("audio")),
          ];

          mediaElements.forEach((el) => {
            if (connectedElements.has(el)) return;

            try {
              const stream = el.srcObject;
              if (!(stream instanceof MediaStream)) return;

              const audioTracks = stream.getAudioTracks();
              if (audioTracks.length === 0) return;

              const source = audioCtx.createMediaStreamSource(stream);
              source.connect(destination);
              connectedElements.add(el);
              console.log("Browser: Connected audio from <" + el.tagName + ">");
            } catch (e) {
              console.warn("Browser: Failed to connect source:", e);
            }
          });
        };

        connectElements();
        const audioScanTimer = setInterval(connectElements, 3000);

        const compositeStream = new MediaStream([videoTrack]);
        const audioTracks = destination.stream.getAudioTracks();
        if (audioTracks[0]) {
          compositeStream.addTrack(audioTracks[0]);
          console.log("Browser: Added AudioContext audio track");
        }

        window._audioScanTimer = audioScanTimer as unknown as number;
        window._audioCtx = audioCtx;

        const recorder = new MediaRecorder(compositeStream, {
          mimeType: "video/webm",
        });

        let writeChain = Promise.resolve();

        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data.size > 0) {
            writeChain = writeChain.then(async () => {
              const buffer = await e.data.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              window.__saveChunk(btoa(binary));
            });
          }
        };

        recorder.onstop = () => {
          console.log("Browser: Video MediaRecorder stopped");
          if (window._audioScanTimer) clearInterval(window._audioScanTimer);
          if (window._audioCtx) window._audioCtx.close();
        };

        recorder.start(1000);
        console.log("Browser: Video MediaRecorder started");

        window._mediaRecorder = recorder;
        window._recordingStream = compositeStream;

        if (enableTranscription && destination.stream.getAudioTracks().length > 0) {
          const audioRecorder = new MediaRecorder(destination.stream, {
            mimeType: "audio/webm;codecs=opus",
          });

          let audioWriteChain = Promise.resolve();

          audioRecorder.ondataavailable = (e: BlobEvent) => {
            if (e.data.size > 0) {
              audioWriteChain = audioWriteChain.then(async () => {
                const buffer = await e.data.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let i = 0; i < bytes.length; i++) {
                  binary += String.fromCharCode(bytes[i]);
                }
                window.__sendAudioChunk(btoa(binary));
              });
            }
          };

          audioRecorder.onstop = () => {
            console.log("Browser: Audio MediaRecorder stopped");
          };

          audioRecorder.start(250);
          console.log("Browser: Audio MediaRecorder started (for transcription)");

          window._audioRecorder = audioRecorder;
        }
      }, hasTranscription);

      this.isRecording = true;
      this.startTime = Date.now();

      // timeline failure must never take the recording down
      if (botConfig.SPEAKER_TIMELINE) {
        try {
          this.speakerTimeline = new SpeakerTimeline(this.meetingId);
          await this.speakerTimeline.start(page, this.startTime);
        } catch (err) {
          console.error(
            "[Speakers] Tracker failed to start (recording continues):",
            err
          );
          if (this.speakerTimeline) {
            await this.speakerTimeline.abort().catch(() => {});
            this.speakerTimeline = null;
          }
        }
      }

      this.reportStatus("recording");
    } catch (err) {
      if (this.recordingSink) {
        await this.recordingSink.abort();
        this.recordingSink = null;
      }
      if (this.transcriber) {
        await this.transcriber.stop();
        this.transcriber = null;
      }
      throw err;
    }
  }

  private async monitorAndAutoExit(): Promise<void> {
    const page = this.getPage();

    let aloneStartTime: number | null = null;
    let gracePeriodPassed = false;
    let callGoneStartTime: number | null = null;
    let unreadableStartTime: number | null = null;

    while (!this.shouldStop) {
      if (botConfig.MAX_DURATION_MINUTES) {
        const elapsed = (Date.now() - this.startTime) / 60_000;
        if (elapsed >= botConfig.MAX_DURATION_MINUTES) {
          this.reportStatus("timeout", {
            hadOtherParticipants: this.hadOtherParticipants,
          });
          return;
        }
      }

      // Leaving is driven by the call view itself, not by the participant
      // count. When a call ends the tiles are torn down first, so a counter
      // that reads them is at its least trustworthy exactly when the exit
      // decision is being made.
      if (!(await this.isInCall(page))) {
        if (!callGoneStartTime) {
          callGoneStartTime = Date.now();
          console.log("[Bot] Call controls gone, confirming...");
        } else if (
          Date.now() - callGoneStartTime >= TIMEOUTS.CALL_GONE_CONFIRM_MS
        ) {
          await this.reportCallGone(page);
          return;
        }
        await page.waitForTimeout(TIMEOUTS.MONITOR_INTERVAL);
        continue;
      }
      callGoneStartTime = null;

      const count = await this.getParticipantCount(page);
      if (count !== null) {
        console.log(`[Bot] Participants: ${count}`);
      }

      if (count !== null && count > 1) {
        this.hadOtherParticipants = true;
      }

      const aloneCheckNotBefore = botConfig.SCHEDULED_START_MS
        ? botConfig.SCHEDULED_START_MS + botConfig.SCHEDULED_ALONE_DELAY_MS
        : null;

      if (aloneCheckNotBefore && Date.now() < aloneCheckNotBefore) {
        aloneStartTime = null;
        gracePeriodPassed = false;
        unreadableStartTime = null;
        await page.waitForTimeout(TIMEOUTS.MONITOR_INTERVAL);
        continue;
      }

      if (count === null) {
        // In the call view but unable to read it. Never exit on one bad read,
        // but do not sit here forever either: this is the state the bot used to
        // idle in for the rest of the meeting.
        if (!unreadableStartTime) {
          unreadableStartTime = Date.now();
          console.log("[Bot] Participant count unreadable, holding...");
        } else if (
          Date.now() - unreadableStartTime >= TIMEOUTS.UNREADABLE_EXIT_DELAY
        ) {
          this.reportStatus("ended", {
            reason: "state_unreadable",
            hadOtherParticipants: this.hadOtherParticipants,
          });
          return;
        }
        await page.waitForTimeout(TIMEOUTS.MONITOR_INTERVAL);
        continue;
      }
      unreadableStartTime = null;

      if (count <= 1) {
        if (!aloneStartTime) {
          aloneStartTime = Date.now();
          this.reportStatus("alone_detected");
        } else if (!gracePeriodPassed) {
          if (Date.now() - aloneStartTime >= TIMEOUTS.ALONE_GRACE_PERIOD) {
            gracePeriodPassed = true;
            console.log("[Bot] Grace period passed, waiting for others...");
          }
        } else if (
          Date.now() - aloneStartTime >=
          TIMEOUTS.ALONE_GRACE_PERIOD + TIMEOUTS.ALONE_EXIT_DELAY
        ) {
          this.reportStatus("ended", {
            reason: "alone_too_long",
            hadOtherParticipants: this.hadOtherParticipants,
          });
          return;
        }
      } else {
        // Announce the way back too. Without this the last reported state stays
        // "alone_detected" for the rest of the call, and every consumer treats
        // the last state as the current condition.
        if (aloneStartTime) this.reportStatus("recording");
        aloneStartTime = null;
        gracePeriodPassed = false;
      }

      await page.waitForTimeout(TIMEOUTS.MONITOR_INTERVAL);
    }
  }

  private async isInCall(page: Page): Promise<boolean> {
    if (this.meetingCode && !page.url().includes(this.meetingCode)) {
      return false;
    }

    return page.evaluate((selectors: string[]) => {
      return selectors.some((selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    }, [MEET_SELECTORS.LEAVE_BUTTON, ...MEET_SELECTORS.IN_MEETING_INDICATORS]);
  }

  private async reportCallGone(page: Page): Promise<void> {
    // innerText, not textContent: Meet keeps a lot of offscreen copy in the DOM
    // and matching against all of it turns any hidden menu string into an exit.
    const bodyText = await page.innerText("body").catch(() => "");

    if (MEET_SELECTORS.KICK_INDICATORS.some((t) => bodyText.includes(t))) {
      this.reportStatus("kicked", {
        hadOtherParticipants: this.hadOtherParticipants,
      });
      return;
    }

    const matched = MEET_SELECTORS.CALL_ENDED_TEXTS.find((t) =>
      bodyText.includes(t)
    );
    this.reportStatus("ended", {
      reason: matched ? "call_ended" : "call_view_gone",
      hadOtherParticipants: this.hadOtherParticipants,
    });
  }

  private async getParticipantCount(page: Page): Promise<number | null> {
    // Tiles only. Every other number on the page (the people badge, the clock)
    // is chrome that outlives what it describes, and reading one of those as a
    // participant count is what kept the bot in an ended call.
    return page.evaluate(() => {
      const tiles = document.querySelectorAll("[data-participant-id]");
      return tiles.length > 0 ? tiles.length : null;
    });
  }

  private async cleanup(): Promise<void> {
    console.log("[Bot] Cleaning up...");

    if (this.isRecording && this.page) {
      try {
        await this.page.evaluate(async (stopWait: number) => {
          const audioRecorder = window._audioRecorder;
          if (audioRecorder && audioRecorder.state !== "inactive") {
            audioRecorder.stop();
          }

          const recorder = window._mediaRecorder;
          if (recorder && recorder.state !== "inactive") {
            recorder.stop();
            await new Promise((r) => setTimeout(r, stopWait));
          }

          const stream = window._recordingStream;
          stream?.getTracks().forEach((t) => t.stop());
        }, TIMEOUTS.RECORDING_STOP_WAIT);
      } catch (err) {
        console.error("[Bot] Error stopping browser recording:", err);
      }
    }

    if (this.isRecording || this.recordingSink) {
      this.reportStatus("finalizing_upload");

      let speakersKey: string | null = null;
      if (this.speakerTimeline) {
        speakersKey = await this.speakerTimeline
          .stop(this.page)
          .catch(() => null);
        this.speakerTimeline = null;
      }

      let deepgramSeconds = 0;
      if (this.transcriber) {
        try {
          const segments = await this.transcriber.stop();
          deepgramSeconds = this.transcriber.getProcessedSeconds();
          console.log(`[Bot] Transcription complete: ${segments.length} segments`);
        } catch (err) {
          console.error("[Bot] Error stopping transcriber:", err);
        }
        this.transcriber = null;
      }

      let recordingKey: string | null = null;
      let r2BytesStored = 0;
      if (this.recordingSink) {
        try {
          recordingKey = await this.recordingSink.complete();
          r2BytesStored = this.recordingSink.getTotalBytes();
          console.log(
            `[Bot] Recording stored: ${recordingKey} (${r2BytesStored} bytes)`
          );
        } catch (err) {
          console.error("[Bot] Error completing recording:", err);
        }
        this.recordingSink = null;
      }

      this.reportMetrics({ deepgramSeconds, r2BytesStored });

      this.reportStatus("complete", {
        ...(recordingKey ? { recording: recordingKey } : {}),
        ...(speakersKey ? { speakers: speakersKey } : {}),
      });
    }

    if (this.page) {
      try {
        const leaveBtn = this.page.locator(MEET_SELECTORS.LEAVE_BUTTON).first();
        if (await leaveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await leaveBtn.click();
          await this.page.waitForTimeout(1000);
          console.log("[Bot] Left the call");
        }
      } catch {
      }
    }

    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }

    console.log("[Bot] Cleanup complete");
  }

  private getPage(): Page {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }
    return this.page;
  }
}

export default MeetBot;
