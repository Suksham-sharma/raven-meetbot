import { createWriteStream, WriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import botConfig from "../config";
import R2Uploader from "./r2Uploader";

export interface StorageSink {
  init(): Promise<void>;
  addChunk(data: Buffer): Promise<void>;
  complete(): Promise<string>;
  abort(): Promise<void>;
  getTotalBytes(): number;
}

const RECORDINGS_DIR = path.resolve(process.cwd(), "recordings");

// Local-disk fallback with the same surface as R2Uploader.
class LocalFileSink implements StorageSink {
  private filePath: string;
  private stream: WriteStream | null = null;
  private totalBytes = 0;
  private completed = false;
  private writeChain: Promise<void> = Promise.resolve();
  private key: string;

  constructor(key: string) {
    this.key = key;
    this.filePath = path.join(RECORDINGS_DIR, key);
  }

  async init(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    this.stream = createWriteStream(this.filePath);
    console.log(`[Local] Writing to ${this.filePath}`);
  }

  async addChunk(data: Buffer): Promise<void> {
    if (this.completed || !this.stream) return;
    const stream = this.stream;
    this.writeChain = this.writeChain.then(
      () =>
        new Promise<void>((resolve, reject) => {
          stream.write(data, (err) => {
            if (err) {
              reject(err);
              return;
            }
            this.totalBytes += data.length;
            resolve();
          });
        })
    );
    return this.writeChain;
  }

  // Returns the key (not the absolute path) to stay substitutable with R2Uploader.
  async complete(): Promise<string> {
    if (this.completed) return this.key;
    this.completed = true;
    await this.writeChain.catch(() => undefined);
    await new Promise<void>((resolve) => {
      if (this.stream) this.stream.end(() => resolve());
      else resolve();
    });
    console.log(
      `[Local] File complete: ${this.filePath} (${this.totalBytes} bytes)`
    );
    return this.key;
  }

  async abort(): Promise<void> {
    this.completed = true;
    await new Promise<void>((resolve) => {
      if (this.stream) this.stream.end(() => resolve());
      else resolve();
    });
  }

  getTotalBytes(): number {
    return this.totalBytes;
  }
}

// R2 when configured, local disk otherwise.
export function createStorageSink(key: string): StorageSink {
  const hasR2 = Boolean(
    botConfig.R2_ENDPOINT &&
      botConfig.R2_ACCESS_KEY_ID &&
      botConfig.R2_SECRET_ACCESS_KEY
  );
  return hasR2 ? new R2Uploader(key) : new LocalFileSink(key);
}
