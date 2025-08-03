import { imageExistsLibpod, imagePullLibpod } from '@backend/lib/clients/libpod/gen/sdk.gen';

export default class PodmanImage {
  private imageName: string;

  constructor(imageName: string) {
    this.imageName = imageName;
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/images/operation/ImageExistsLibpod
   */
  private async checkIfImageExists() {
    console.log(`Checking if image ${this.imageName} exists`);

    try {
      const { response } = await imageExistsLibpod({
        path: {
          name: this.imageName,
        },
      });

      if (response.status === 204) {
        console.log(`Image ${this.imageName} exists`);
        return true;
      } else {
        console.log(`Image ${this.imageName} does not exist`);
        return false;
      }
    } catch (error) {
      console.error(`Error checking if image ${this.imageName} exists`, error);
      return false;
    }
  }

  async pullImage() {
    const imageExists = await this.checkIfImageExists();
    if (imageExists) {
      console.log(`Image ${this.imageName} already exists`);
      return;
    }

    console.log(`Pulling image ${this.imageName}`);
    try {
      const { response } = await imagePullLibpod({
        query: {
          reference: this.imageName,
        },
      });

      if (response.status === 200) {
        console.log(`Image ${this.imageName} pulled successfully`);
        return;
      } else {
        console.error(`Error pulling image ${this.imageName}`, response);
        throw new Error(`Error pulling image ${this.imageName}`);
      }
    } catch (error) {
      console.error(`Error pulling image ${this.imageName}`, error);
      throw error;
    }
  }
}
