import { chromium, Browser, BrowserContext, Page } from "playwright";
import botConfig from "../config";
import {
  CHROME_ARGS,
  MEET_SELECTORS,
  TIMEOUTS,
  VIEWPORT,
} from "../config/constants";

class MeetBot {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async start(): Promise<void> {
    try {
      await this.launchBrowser();
      await this.validateMeeting();
      await this.attemptJoin();
      await this.waitForAdmission();

      console.log("[Bot] Successfully joined meeting, ready for recording");

      // Part B: startRecording, monitorAndAutoExit
    } finally {
      await this.cleanup();
    }
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
    console.log("[Bot] Waiting for admission...");

    const deadline = Date.now() + TIMEOUTS.ADMISSION_TIMEOUT;

    while (Date.now() < deadline) {
      // Check if we're in the meeting
      for (const selector of MEET_SELECTORS.IN_MEETING_INDICATORS) {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log("[Bot] Admitted to meeting");
          return;
        }
      }

      // Check if entry was declined
      const bodyText = await page.textContent("body");
      if (bodyText?.includes(MEET_SELECTORS.DECLINE_TEXT)) {
        throw new Error("Entry was declined by the host");
      }

      // Log waiting status
      if (bodyText?.includes(MEET_SELECTORS.WAITING_TEXT)) {
        console.log("[Bot] Waiting for host to admit...");
      }

      await page.waitForTimeout(TIMEOUTS.ADMISSION_POLL_INTERVAL);
    }

    throw new Error("Admission timed out after 5 minutes");
  }

  // ── Cleanup (Part B will expand this) ───────────────────────────────

  private async cleanup(): Promise<void> {
    console.log("[Bot] Cleaning up...");

    // Part B: stop recording, leave call, save file

    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }

    console.log("[Bot] Cleanup complete");
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private getPage(): Page {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }
    return this.page;
  }
}

export default MeetBot;
