import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import systemConfig from "../config";

// R2 access for meeting artifacts ({meetingId}.webm, .speakers.jsonl,
// .named-transcript.jsonl) — same keys the bot's storage sink uploads.
// resolve() downloads to a temp file (ffmpeg + the jsonl loaders read paths,
// not streams); cleanup() unlinks it.

export interface ResolvedArtifact {
  path: string;
  cleanup: () => Promise<void>;
}

export interface ArtifactStore {
  resolve(key: string): Promise<ResolvedArtifact>;
  write(key: string, data: string | Buffer): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// Lets callers distinguish "artifact doesn't exist" (e.g. the memory worker's
// seed fallback) from a genuine read error.
export class ArtifactNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`artifact not found: ${key}`);
    this.name = "ArtifactNotFoundError";
  }
}

function contentType(key: string): string {
  return key.endsWith(".jsonl") ? "application/x-ndjson" : "video/webm";
}

class R2ArtifactStore implements ArtifactStore {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: systemConfig.R2_REGION,
      endpoint: systemConfig.R2_ENDPOINT,
      credentials: {
        accessKeyId: systemConfig.R2_ACCESS_KEY_ID,
        secretAccessKey: systemConfig.R2_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = systemConfig.R2_BUCKET;
  }

  async resolve(key: string): Promise<ResolvedArtifact> {
    let body: Readable;
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      body = res.Body as Readable;
    } catch (err) {
      if (err instanceof NoSuchKey || err instanceof NotFound) {
        throw new ArtifactNotFoundError(key);
      }
      throw err;
    }

    const tmp = path.join(os.tmpdir(), `artifact-${process.pid}-${key.replace(/[^\w.-]/g, "_")}`);
    await pipeline(body, createWriteStream(tmp));
    return {
      path: tmp,
      cleanup: () => unlink(tmp).catch(() => undefined),
    };
  }

  async write(key: string, data: string | Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType(key),
      })
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (err instanceof NotFound || err instanceof NoSuchKey) return false;
      throw err;
    }
  }
}

let store: ArtifactStore | null = null;

export function getArtifactStore(): ArtifactStore {
  if (store) return store;
  if (
    !systemConfig.R2_ENDPOINT ||
    !systemConfig.R2_ACCESS_KEY_ID ||
    !systemConfig.R2_SECRET_ACCESS_KEY
  ) {
    throw new Error("R2 not configured — set R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
  }
  store = new R2ArtifactStore();
  return store;
}
