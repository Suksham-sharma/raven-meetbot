import { mkdir } from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const AUTH_DIR = path.resolve(process.cwd(), ".auth");
const PROFILE_DIR = path.join(AUTH_DIR, "profile");
const STATE_PATH = path.join(AUTH_DIR, "state.json");
const LOGIN_TIMEOUT_MS = 20 * 60_000;

const main = async () => {
  await mkdir(AUTH_DIR, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://accounts.google.com/");

  console.log("");
  console.log("Sign in with the BOT's Google account in the opened window.");
  console.log("The window closes by itself once the login is detected.");
  console.log("");

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let loggedIn = false;
  while (Date.now() < deadline) {
    const cookies = await ctx.cookies("https://google.com").catch(() => []);
    if (cookies.some((c) => c.name === "SID")) {
      loggedIn = true;
      break;
    }
    await page.waitForTimeout(3000).catch(() => undefined);
  }

  if (!loggedIn) {
    console.error("Timed out waiting for login (20 min). Re-run `pnpm auth`.");
    await ctx.close();
    process.exit(1);
  }

  await page.waitForTimeout(2000).catch(() => undefined);
  await ctx.storageState({ path: STATE_PATH });
  await ctx.close();

  console.log(`Login captured — session saved to ${STATE_PATH}`);
  console.log("The bot will now join meetings signed in as this account.");
};

main().catch((err) => {
  console.error("auth fatal:", err);
  process.exit(1);
});
