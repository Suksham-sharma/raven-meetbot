import { chromium, Browser, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs";
import botConfig from "../config";
import {
  CHROME_ARGS,
  MEET_SELECTORS,
  TIMEOUTS,
  VIEWPORT,
} from "../config/constants";

type BotState =
  | "joining_meeting"
  | "waiting_admission"
  | "admitted"
  | "recording"
  | "alone_detected"
  | "ended"
  | "kicked"
  | "error"
  | "timeout";

class MeetBot {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isRecording = false;
  private recordingPath: string | null = null;
  private writeStream: fs.WriteStream | null = null;
  private startTime: number = 0;
  private shouldStop = false;

  private reportStatus(state: BotState, extra?: Record<string, unknown>): void {
    const payload = { state, timestamp: new Date().toISOString(), ...extra };
    console.log(`[BOT_STATUS] ${JSON.stringify(payload)}`);
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

    this.context = await this.browser.newContext({
      permissions: ["camera", "microphone"],
      viewport: VIEWPORT,
    });

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
      // Check if we're in the meeting
      for (const selector of MEET_SELECTORS.IN_MEETING_INDICATORS) {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
          this.reportStatus("admitted");
          return;
        }
      }

      // Check if entry was declined
      const bodyText = await page.textContent("body");
      if (bodyText?.includes(MEET_SELECTORS.DECLINE_TEXT)) {
        throw new Error("Entry was declined by the host");
      }

      await page.waitForTimeout(TIMEOUTS.ADMISSION_POLL_INTERVAL);
    }

    throw new Error("Admission timed out after 5 minutes");
  }


  private async startRecording(): Promise<void> {
    const page = this.getPage();

    const meetingId =
      (botConfig.MEET_URL.split("/").pop() || "recording").split("?")[0];
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
    const filename = `${meetingId}_${timestamp}.webm`;

    const recordingsDir = path.resolve("/app/recordings");
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }
    this.recordingPath = path.join(recordingsDir, filename);
    this.writeStream = fs.createWriteStream(this.recordingPath);

    console.log(`[Bot] Starting recording → ${filename}`);

    // Expose chunk callback — receives base64 string from browser
    await page.exposeFunction("__saveChunk", (base64Data: string) => {
      const buffer = Buffer.from(base64Data, "base64");
      this.writeStream?.write(buffer);
    });

    await page.exposeFunction("__finishRecording", () => {
      return new Promise<void>((resolve) => {
        if (this.writeStream) {
          this.writeStream.end(resolve);
        } else {
          resolve();
        }
      });
    });

    // Wait for media elements to load, then trigger user gesture for MediaRecorder
    await page.waitForTimeout(5000);
    try {
      await page.click("body", { force: true });
    } catch {
      // Gesture may fail, non-critical
    }

    try {
      await page.evaluate(async () => {
        console.log("Browser: Starting composite stream capture...");

        // 1. Tab capture for video only — no audio device in Docker (Xvfb only)
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "browser" },
          preferCurrentTab: true,
          audio: false,
        });

        const videoTrack = displayStream.getVideoTracks()[0];
        if (!videoTrack) throw new Error("No video track from tab capture");
        console.log("Browser: Got video track:", videoTrack.label);

        // 2. AudioContext to capture WebRTC audio from page media elements
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

        // 3. Composite stream: video from tab capture + audio from AudioContext
        const compositeStream = new MediaStream([videoTrack]);
        const audioTracks = destination.stream.getAudioTracks();
        if (audioTracks[0]) {
          compositeStream.addTrack(audioTracks[0]);
          console.log("Browser: Added AudioContext audio track");
        }

        window._audioScanTimer = audioScanTimer as unknown as number;
        window._audioCtx = audioCtx;

        // 4. MediaRecorder with sequential write queue to prevent out-of-order chunks
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
          console.log("Browser: MediaRecorder stopped");
          if (window._audioScanTimer) clearInterval(window._audioScanTimer);
          if (window._audioCtx) window._audioCtx.close();
        };

        recorder.start(1000);
        console.log("Browser: MediaRecorder started");

        window._mediaRecorder = recorder;
        window._recordingStream = compositeStream;
      });

      this.isRecording = true;
      this.startTime = Date.now();
      this.reportStatus("recording");
    } catch (err) {
      // Close the write stream if recording setup fails
      this.writeStream.end();
      this.writeStream = null;
      throw err;
    }
  }


  private async monitorAndAutoExit(): Promise<void> {
    const page = this.getPage();

    let aloneStartTime: number | null = null;
    let gracePeriodPassed = false;

    while (!this.shouldStop) {
      // Duration cap
      if (botConfig.MAX_DURATION_MINUTES) {
        const elapsed = (Date.now() - this.startTime) / 60_000;
        if (elapsed >= botConfig.MAX_DURATION_MINUTES) {
          this.reportStatus("timeout");
          return;
        }
      }

      // Kick detection
      if (await this.isKicked(page)) {
        this.reportStatus("kicked");
        return;
      }

      // URL-based kick detection
      if (page.url().includes("/bye")) {
        this.reportStatus("ended");
        return;
      }

      // Participant count
      const count = await this.getParticipantCount(page);
      if (count !== null) {
        console.log(`[Bot] Participants: ${count}`);
      }

      // Alone detection
      if (count !== null && count <= 1) {
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
          this.reportStatus("ended", { reason: "alone_too_long" });
          return;
        }
      } else {
        aloneStartTime = null;
        gracePeriodPassed = false;
      }

      await page.waitForTimeout(TIMEOUTS.MONITOR_INTERVAL);
    }
  }

  private async isKicked(page: Page): Promise<boolean> {
    const bodyText = await page.textContent("body").catch(() => "");
    if (!bodyText) return false;

    return MEET_SELECTORS.KICK_INDICATORS.some((text) =>
      bodyText.includes(text)
    );
  }

  private async getParticipantCount(page: Page): Promise<number | null> {
    return page.evaluate(() => {
      // Strategy 1: data-participant-id elements
      const participantEls = document.querySelectorAll(
        "[data-participant-id]"
      );
      if (participantEls.length > 0) return participantEls.length;

      // Strategy 2: button text that's a plain number (people panel button)
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || "";
        if (/^\d+$/.test(text)) {
          const num = parseInt(text, 10);
          if (num > 0 && num < 500) return num;
        }
      }

      // Strategy 3: aria-label patterns
      const allElements = document.querySelectorAll("[aria-label]");
      for (const el of allElements) {
        const label = el.getAttribute("aria-label") || "";
        const patterns = [
          /\((\d+)\)/,
          /(\d+)\s*participant/i,
          /(\d+)\s*person/i,
          /(\d+)\s*people/i,
        ];
        for (const pattern of patterns) {
          const match = label.match(pattern);
          if (match) return parseInt(match[1], 10);
        }
      }

      return null;
    });
  }


  private async cleanup(): Promise<void> {
    console.log("[Bot] Cleaning up...");

    // Stop browser-side recording
    if (this.isRecording && this.page) {
      try {
        await this.page.evaluate(async (stopWait: number) => {
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

    // Always flush and close the write stream from Node side — even if page.evaluate failed
    if (this.writeStream) {
      await new Promise<void>((resolve) => this.writeStream!.end(resolve));
      this.writeStream = null;
      console.log(`[Bot] Recording saved → ${this.recordingPath}`);
    }

    // Leave the call
    if (this.page) {
      try {
        const leaveBtn = this.page.locator(MEET_SELECTORS.LEAVE_BUTTON).first();
        if (await leaveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await leaveBtn.click();
          await this.page.waitForTimeout(1000);
          console.log("[Bot] Left the call");
        }
      } catch {
        // Page may already be closed
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
