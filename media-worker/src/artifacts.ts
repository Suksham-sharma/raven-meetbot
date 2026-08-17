import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "fs";
import { access, copyFile, mkdir, stat, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import config from "./config";

export interface ResolvedArtifact {
  path: string;
  cleanup: () => Promise<void>;
}

export interface ArtifactStore {
  resolve(key: string): Promise<ResolvedArtifact>;
  write(key: string, data: string | Buffer): Promise<void>;
  writeFile(key: string, localPath: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class ArtifactNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`artifact not found: ${key}`);
    this.name = "ArtifactNotFoundError";
  }
}

function contentType(key: string): string {
  if (key.endsWith(".jsonl")) return "application/x-ndjson";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".jpg")) return "image/jpeg";
  return "video/webm";
}

class R2ArtifactStore implements ArtifactStore {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: config.R2_REGION,
      endpoint: config.R2_ENDPOINT,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = config.R2_BUCKET;
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
    return { path: tmp, cleanup: () => unlink(tmp).catch(() => undefined) };
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

  // ContentLength is required because a stream has no inherent length and the
  // SDK will not buffer it to find one.
  async writeFile(key: string, localPath: string): Promise<void> {
    const { size } = await stat(localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(localPath),
        ContentLength: size,
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

class LocalArtifactStore implements ArtifactStore {
  private dir = config.RECORDINGS_DIR;

  async resolve(key: string): Promise<ResolvedArtifact> {
    const full = path.join(this.dir, key);
    if (!(await this.exists(key))) throw new ArtifactNotFoundError(key);
    return { path: full, cleanup: async () => undefined };
  }

  async write(key: string, data: string | Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, key), data);
  }

  // copyFile, not rename: the source is a temp file the caller still owns and
  // may sit on a different device, where rename() fails with EXDEV.
  async writeFile(key: string, localPath: string): Promise<void> {
    const dest = path.join(this.dir, key);
    if (path.resolve(dest) === path.resolve(localPath)) return;
    await mkdir(this.dir, { recursive: true });
    await copyFile(localPath, dest);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(path.join(this.dir, key));
      return true;
    } catch {
      return false;
    }
  }
}

let store: ArtifactStore | null = null;

export function getArtifactStore(): ArtifactStore {
  if (store) return store;
  // Must mirror api-server and the bot: all three have to agree on which store
  // is live, or they read and write in different places.
  const hasR2 = config.R2_ENDPOINT && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY;
  store = hasR2 ? new R2ArtifactStore() : new LocalArtifactStore();
  return store;
}
