import Docker from "dockerode";
import { PassThrough } from "stream";
import systemConfig from "../config";

interface BotContainerOptions {
  url: string;
  botName: string;
  maxDurationMinutes: number | null;
  jobId: string;
}

interface SpawnResult {
  stdout: PassThrough;
  wait: () => Promise<number>;
}

class DockerManager {
  private static instance: DockerManager;
  private docker: Docker;
  private runningContainers: Map<string, Docker.Container>;
  private jobToContainer: Map<string, string>;

  private constructor() {
    this.docker = new Docker();
    this.runningContainers = new Map();
    this.jobToContainer = new Map();
  }

  static getInstance(): DockerManager {
    if (!DockerManager.instance) {
      DockerManager.instance = new DockerManager();
    }
    return DockerManager.instance;
  }

  async spawnBot(options: BotContainerOptions): Promise<SpawnResult> {
    const { url, botName, maxDurationMinutes, jobId } = options;

    const env = [
      `MEET_URL=${url}`,
      `BOT_NAME=${botName}`,
    ];

    if (maxDurationMinutes) {
      env.push(`MAX_DURATION_MINUTES=${maxDurationMinutes}`);
    }

    if (systemConfig.R2_ENDPOINT) {
      env.push(
        `R2_ENDPOINT=${systemConfig.R2_ENDPOINT}`,
        `R2_ACCESS_KEY_ID=${systemConfig.R2_ACCESS_KEY_ID}`,
        `R2_SECRET_ACCESS_KEY=${systemConfig.R2_SECRET_ACCESS_KEY}`,
        `R2_BUCKET=${systemConfig.R2_BUCKET}`,
        `R2_REGION=${systemConfig.R2_REGION}`,
      );
    }

    if (systemConfig.DEEPGRAM_API_KEY) {
      env.push(`DEEPGRAM_API_KEY=${systemConfig.DEEPGRAM_API_KEY}`);
    }

    const binds = [`${systemConfig.SCREENSHOTS_HOST_PATH}:/app/screenshots`];

    // Signed-in Google session, read-only — avoids Meet's anonymous rate limit.
    if (systemConfig.AUTH_STATE_HOST_PATH) {
      binds.push(`${systemConfig.AUTH_STATE_HOST_PATH}:/app/.auth:ro`);
      env.push(`AUTH_STATE_PATH=/app/.auth/state.json`);
    }

    // Persist recordings past container removal when not using R2.
    if (systemConfig.RECORDINGS_HOST_PATH) {
      binds.push(`${systemConfig.RECORDINGS_HOST_PATH}:/app/recordings`);
    }

    const container = await this.docker.createContainer({
      Image: systemConfig.BOT_IMAGE,
      Env: env,
      Labels: { "com.meetbot.jobId": jobId },
      HostConfig: {
        ShmSize: 2 * 1024 * 1024 * 1024,
        Binds: binds,
      },
    });

    const containerId = container.id;
    this.runningContainers.set(containerId, container);
    this.jobToContainer.set(jobId, containerId);
    console.log(`[DockerManager] Starting container ${containerId.slice(0, 12)} for ${url} (job ${jobId})`);

    const stdout = new PassThrough();
    const rawStream = await container.attach({ stream: true, stdout: true, stderr: true });
    this.docker.modem.demuxStream(rawStream, stdout, stdout);

    await container.start();

    const wait = async (): Promise<number> => {
      const { StatusCode } = await container.wait();
      stdout.end();
      console.log(`[DockerManager] Container ${containerId.slice(0, 12)} exited with code ${StatusCode}`);
      this.runningContainers.delete(containerId);
      this.jobToContainer.delete(jobId);
      await container.remove().catch(() => {});
      return StatusCode;
    };

    return { stdout, wait };
  }

  async stopByJobId(jobId: string): Promise<boolean> {
    let containerId = this.jobToContainer.get(jobId);
    let container: Docker.Container | null = null;

    if (containerId) {
      container = this.runningContainers.get(containerId) ?? null;
    }

    if (!container) {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { label: [`com.meetbot.jobId=${jobId}`] },
      });
      if (containers.length === 0) return false;
      const foundId = containers[0].Id;
      container = this.docker.getContainer(foundId);
      containerId = foundId;
    }

    if (!container) return false;

    try {
      await container.stop({ t: 10 });
      console.log(`[DockerManager] Stopped container ${String(containerId).slice(0, 12)} for job ${jobId}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already stopped") || message.includes("is not running")) {
        return true;
      }
      console.error(`[DockerManager] Error stopping container for job ${jobId}:`, err);
      return false;
    }
  }

  async stopAll(): Promise<void> {
    console.log(`[DockerManager] Stopping ${this.runningContainers.size} running containers...`);

    const stopPromises = Array.from(this.runningContainers.entries()).map(
      async ([id, container]) => {
        try {
          await container.stop({ t: 10 });
          await container.remove().catch(() => {});
          console.log(`[DockerManager] Stopped container ${id.slice(0, 12)}`);
        } catch (err) {
          console.error(`[DockerManager] Error stopping container ${id.slice(0, 12)}:`, err);
        }
      }
    );

    await Promise.all(stopPromises);
    this.runningContainers.clear();
    this.jobToContainer.clear();
  }
}

const dockerManager = DockerManager.getInstance();
export default dockerManager;
