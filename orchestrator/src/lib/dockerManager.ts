import Docker from "dockerode";
import systemConfig from "../config";

interface BotContainerOptions {
  url: string;
  botName: string;
  maxDurationMinutes: number | null;
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

  async spawnBot(options: BotContainerOptions): Promise<number> {
    const { url, botName, maxDurationMinutes } = options;

    const env = [
      `MEET_URL=${url}`,
      `BOT_NAME=${botName}`,
    ];

    if (maxDurationMinutes) {
      env.push(`MAX_DURATION_MINUTES=${maxDurationMinutes}`);
    }

    const container = await this.docker.createContainer({
      Image: systemConfig.BOT_IMAGE,
      Env: env,
      HostConfig: {
        ShmSize: 2 * 1024 * 1024 * 1024,
        Binds: [
          `${systemConfig.RECORDINGS_HOST_PATH}:/app/recordings`,
          `${systemConfig.SCREENSHOTS_HOST_PATH}:/app/screenshots`,
        ],
      },
    });

    const containerId = container.id;
    this.runningContainers.set(containerId, container);
    console.log(`[DockerManager] Starting container ${containerId.slice(0, 12)} for ${url}`);

    await container.start();

    const { StatusCode } = await container.wait();
    console.log(`[DockerManager] Container ${containerId.slice(0, 12)} exited with code ${StatusCode}`);

    this.runningContainers.delete(containerId);
    await container.remove();

    return StatusCode;
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
