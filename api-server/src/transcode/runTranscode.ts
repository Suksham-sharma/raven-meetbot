import path from "path";
import { statSync } from "fs";
import { posterFrame, probeDuration, toMp4 } from "./transcode";

// Backfill CLI over local files; the BullMQ worker runs the same lib against R2.
//
//   tsx src/transcode/runTranscode.ts <recording.webm>

async function main(): Promise<void> {
  const webm = process.argv[2];
  if (!webm) {
    console.error("usage: tsx src/transcode/runTranscode.ts <recording.webm>");
    process.exit(1);
  }

  const base = webm.replace(/\.webm$/, "");
  const mp4 = `${base}.mp4`;
  const jpg = `${base}.poster.jpg`;

  console.log(`source duration: ${(await probeDuration(webm)) ?? "N/A (unseekable)"}`);

  let last = -1;
  await toMp4(webm, mp4, (pct) => {
    if (pct >= last + 10) {
      last = pct;
      process.stdout.write(`\r  transcoding ${pct}%`);
    }
  });
  process.stdout.write("\r");

  const duration = await probeDuration(mp4);
  if (duration == null) {
    throw new Error(`${mp4} still has no duration — it would not be seekable`);
  }

  await posterFrame(mp4, jpg, Math.min(5, duration / 2));

  const mb = (p: string) => (statSync(p).size / 1e6).toFixed(1);
  console.log(`✓ ${path.basename(mp4)}  ${mb(mp4)}MB  ${duration.toFixed(1)}s`);
  console.log(`✓ ${path.basename(jpg)}  ${mb(jpg)}MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
