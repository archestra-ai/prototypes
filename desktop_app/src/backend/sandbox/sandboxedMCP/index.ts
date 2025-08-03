import { PodmanContainer, PodmanImage } from '@backend/sandbox/podman';

export default class SandboxedMCP {
  private imageName: string;
  private containerPort: number;
  private envVars: Record<string, string>;
  private hostPort: number | null = null;

  constructor(imageName: string, containerPort: number, hostPort: number, envVars: Record<string, string>) {
    this.imageName = imageName;
    this.containerPort = containerPort;
    this.envVars = envVars;
    this.hostPort = hostPort;
  }

  async start() {
    console.log(`Starting MCP server ${this.imageName}, exposed on port ${this.hostPort}`);

    const image = new PodmanImage(this.imageName);
    await image.pullImage();

    const container = new PodmanContainer(this.imageName, this.containerPort, this.hostPort, this.envVars);
    await container.startOrCreateContainer();
  }
}
