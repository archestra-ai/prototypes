import { imageExistsLibpod, imagePullLibpod } from '@backend/clients/libpod/gen';
import config from '@backend/config';

export default class PodmanImage {
  private BASE_IMAGE_NAME = config.sandbox.baseDockerImage;

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/images/operation/ImageExistsLibpod
   */
  private async checkIfImageExists() {
    console.log(`Checking if image ${this.BASE_IMAGE_NAME} exists`);

    try {
      const { response } = await imageExistsLibpod({
        path: {
          name: this.BASE_IMAGE_NAME,
        },
      });

      if (response.status === 204) {
        console.log(`Image ${this.BASE_IMAGE_NAME} exists`);
        return true;
      } else {
        console.log(`Image ${this.BASE_IMAGE_NAME} does not exist`);
        return false;
      }
    } catch (error) {
      console.error(`Error checking if image ${this.BASE_IMAGE_NAME} exists`, error);
      return false;
    }
  }

  async pullBaseImage() {
    const imageExists = await this.checkIfImageExists();
    if (imageExists) {
      console.log(`Image ${this.BASE_IMAGE_NAME} already exists`);
      return;
    }

    console.log(`Pulling image ${this.BASE_IMAGE_NAME}`);
    try {
      const { response } = await imagePullLibpod({
        query: {
          reference: this.BASE_IMAGE_NAME,
        },
      });

      if (response.status === 200) {
        console.log(`Image ${this.BASE_IMAGE_NAME} pulled successfully`);
        return;
      } else {
        // Try to read the error body for more details
        let errorMessage = `Error pulling image ${this.BASE_IMAGE_NAME} - Status: ${response.status}`;
        try {
          const errorBody = await response.text();
          console.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, response.status, errorBody);
          errorMessage += ` - ${errorBody}`;
        } catch (e) {
          console.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, response);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, error);
      throw error;
    }
  }
}
