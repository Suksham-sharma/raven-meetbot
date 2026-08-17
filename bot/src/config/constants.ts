export const CHROME_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--auto-select-tab-capture-source-by-title=Meet",
  "--allow-running-insecure-content",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-infobars",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

export const MEET_SELECTORS = {
  ERROR_TEXTS: [
    "Check your meeting code",
    "Invalid meeting code",
    "Return to home screen",
    "This meeting doesn't exist",
  ],

  DISMISS_BUTTONS: ["Dismiss", "Got it", "OK", "Close"],

  MIC_BUTTON: '[aria-label*="microphone" i]',
  CAMERA_BUTTON: '[aria-label*="camera" i]',

  NAME_INPUT: 'input[aria-label="Your name"]',

  JOIN_BUTTONS: ["Join now", "Ask to join"],

  IN_MEETING_INDICATORS: [
    'button[aria-label*="Chat with everyone" i]',
    'button[aria-label*="Show everyone" i]',
    'button[aria-label*="Meeting details" i]',
  ],

  DECLINE_TEXTS: [
    "denied your request to join",
    "You can't join this video call",
    "No one responded to your request",
  ],

  WAITING_TEXT: "Please wait until a meeting host brings you into the call",

  KICK_INDICATORS: [
    "Return to home screen",
    "You've been removed from the meeting",
    "The meeting has ended",
  ],

  LEAVE_BUTTON: '[aria-label="Leave call"]',
};

export const TIMEOUTS = {
  NAVIGATION_TIMEOUT: 30_000,
  VALIDATION_WAIT: 5_000,
  JOIN_ATTEMPT_INTERVAL: 2_000,
  MAX_JOIN_ATTEMPTS: 30,
  ADMISSION_TIMEOUT: 5 * 60_000,
  ADMISSION_POLL_INTERVAL: 2_000,
  MONITOR_INTERVAL: 20_000,
  ALONE_GRACE_PERIOD: 20_000,
  ALONE_EXIT_DELAY: 40_000,
  RECORDING_STOP_WAIT: 2_000,
};

export const VIEWPORT = { width: 1280, height: 720 };
