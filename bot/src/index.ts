import botConfig from "./config";
import MeetBot from "./services/meetBot";

const main = async () => {
  if (!botConfig.MEET_URL) {
    console.error("[Bot] MEET_URL is required");
    process.exit(1);
  }

  console.log(`[Bot] Starting for ${botConfig.MEET_URL}`);
  console.log(`[Bot] Name: ${botConfig.BOT_NAME}`);

  if (botConfig.MAX_DURATION_MINUTES) {
    console.log(`[Bot] Max duration: ${botConfig.MAX_DURATION_MINUTES} min`);
  }

  const bot = new MeetBot();
  await bot.start();
};

main()
  .then(() => {
    console.log("[Bot] Finished successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Bot] Fatal error:", err.message);
    process.exit(1);
  });
