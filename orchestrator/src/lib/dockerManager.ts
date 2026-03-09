import Docker from "dockerode";
import { PassThrough } from "stream";
import systemConfig from "../config";

interface BotContainerOptions {
  url: string;
  botName: string;
  maxDurationMinutes: number | null;
}

interface SpawnResult {
  stdout: PassThrough;
  wait: () => Promise<number>;
}

class DockerManager {
  private static instance: DockerManager;
  private docker: Docker;
  private runningContainers: Map<string, Docker.Container>;

  private constructor() {
    this.docker = new Docker();
    this.runningContainers = new Map();
  }

  static getInstance(): DockerManager {
    if (!DockerManager.instance) {
      DockerManager.instance = new DockerManager();
    }
    return DockerManager.instance;
  }

  async spawnBot(options: BotContainerOptions): Promise<SpawnResult> {
    const { url, botName, maxDurationMinutes } = options;

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

    const container = await this.docker.createContainer({
      Image: systemConfig.BOT_IMAGE,
      Env: env,
      HostConfig: {
        ShmSize: 2 * 1024 * 1024 * 1024,
        Binds: [
          `${systemConfig.SCREENSHOTS_HOST_PATH}:/app/screenshots`,
        ],
      },
    });

    const containerId = container.id;
    this.runningContainers.set(containerId, container);
    console.log(`[DockerManager] Starting container ${containerId.slice(0, 12)} for ${url}`);

    const stdout = new PassThrough();
    const rawStream = await container.attach({ stream: true, stdout: true, stderr: true });
    this.docker.modem.demuxStream(rawStream, stdout, stdout);

    await container.start();

    const wait = async (): Promise<number> => {
      const { StatusCode } = await container.wait();
      stdout.end();
      console.log(`[DockerManager] Container ${containerId.slice(0, 12)} exited with code ${StatusCode}`);
      this.runningContainers.delete(containerId);
      await container.remove();
      return StatusCode;
    };

    return { stdout, wait };
  }

  async stopAll(): Promise<void> {
    console.log(`[DockerManager] Stopping ${this.runningContainers.size} running containers...`);

    const stopPromises = Array.from(this.runningContainers.entries()).map(
      async ([id, container]) => {
        try {
          await container.stop({ t: 10 });
          await container.remove();
          console.log(`[DockerManager] Stopped container ${id.slice(0, 12)}`);
        } catch (err) {
          console.error(`[DockerManager] Error stopping container ${id.slice(0, 12)}:`, err);
        }
      }
    );

    await Promise.all(stopPromises);
    this.runningContainers.clear();
  }
}

const dockerManager = DockerManager.getInstance();
export default dockerManager;
