import { z } from 'zod';

import { imageExistsLibpod, imagePullLibpod } from '@backend/clients/libpod/gen';
import config from '@backend/config';

export const PodmanImageStatusSummarySchema = z.object({
  /**
   * pullPercentage is a number between 0 and 100 that represents the percentage of the base image pull that has been completed.
   */
  pullPercentage: z.number().min(0).max(100),
  /**
   * pullMessage is a string that gives a human-readable description of the current state of the base image pull.
   */
  pullMessage: z.string().nullable(),
  /**
   * pullError is a string that gives a human-readable description of the error that occurred during the base image pull (if one has)
   */
  pullError: z.string().nullable(),
});

type PodmanImageStatusSummary = z.infer<typeof PodmanImageStatusSummarySchema>;

export default class PodmanImage {
  private BASE_IMAGE_NAME = config.sandbox.baseDockerImage;

  private _pullPercentage = 0;
  private _pullMessage: string | null = null;
  private _pullError: string | null = null;

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

  /**
   * TODO: update _baseImagePullPercentage, _baseImagePullMessage, and _baseImagePullError
   * throughout the base image pull process
   */
  async pullBaseImage() {
    /**
     * ALWAYS pull to avoid false positives from corrupted storage
     * The exists API can return 204 even when the image doesn't actually exist
     *
     * See https://github.com/containers/podman/issues/14003
     */
    // const imageExists = await this.checkIfImageExists();
    // if (imageExists) {
    //   console.log(`Image ${this.BASE_IMAGE_NAME} already exists`);
    //   return;
    // }
    console.log(`Force pulling image ${this.BASE_IMAGE_NAME} to ensure it's available`);

    try {
      const pullResponse = await imagePullLibpod({
        query: {
          reference: this.BASE_IMAGE_NAME,
        },
      });

      // The pull endpoint streams JSON responses during the pull
      // We need to wait for the complete response
      if (pullResponse.response.status === 200) {
        console.log(`Image ${this.BASE_IMAGE_NAME} pull initiated...`);

        // The response contains streaming data - we should check if pull completed
        if (pullResponse.data) {
          console.log(`Image ${this.BASE_IMAGE_NAME} pulled successfully`);
          return;
        }
      } else {
        // Try to read the error body for more details
        let errorMessage = `Error pulling image ${this.BASE_IMAGE_NAME} - Status: ${pullResponse.response.status}`;
        try {
          const errorBody = await pullResponse.response.text();
          console.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, pullResponse.response.status, errorBody);
          errorMessage += ` - ${errorBody}`;
        } catch (e) {
          console.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, pullResponse.response);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, error);
      throw error;
    }
  }

  get statusSummary(): PodmanImageStatusSummary {
    return {
      pullPercentage: this._pullPercentage,
      pullMessage: this._pullMessage,
      pullError: this._pullError,
    };
  }
}
