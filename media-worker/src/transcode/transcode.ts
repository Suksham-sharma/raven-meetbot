import ffmpeg from "fluent-ffmpeg";

// MediaRecorder writes a live WebM with no duration and no cues, so the raw
// capture probes as duration=N/A and a browser cannot seek it. Every citation
// is a #t= link, so the recording has to be remuxed before it is playable.

export function toMp4(
  webmPath: string,
  outMp4Path: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(webmPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .audioBitrate("128k")
      .audioChannels(1)
      .outputOptions([
        "-preset veryfast",
        "-crf 26",
        "-pix_fmt yuv420p", // Safari refuses anything else
        "-movflags +faststart", // moov to the front, else unseekable until fully buffered
      ])
      .on("progress", (p) => onProgress?.(Math.round(p.percent ?? 0)))
      .on("error", reject)
      .on("end", () => resolve())
      .save(outMp4Path);
  });
}

export function posterFrame(
  mp4Path: string,
  outJpgPath: string,
  atS = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(mp4Path)
      .seekInput(atS)
      .frames(1)
      .outputOptions(["-q:v 4", "-vf scale=640:-2"])
      .on("error", reject)
      .on("end", () => resolve())
      .save(outJpgPath);
  });
}

export function probeDuration(path: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, data) => {
      if (err) return reject(err);
      const n = Number(data.format?.duration);
      resolve(Number.isFinite(n) && n > 0 ? n : null);
    });
  });
}
