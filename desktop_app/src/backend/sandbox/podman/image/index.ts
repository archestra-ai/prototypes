import { z } from 'zod';

import { imageExistsLibpod, imagePullLibpod } from '@backend/clients/libpod/gen';
import config from '@backend/config';
import log from '@backend/utils/logger';

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
    log.info(`Checking if image ${this.BASE_IMAGE_NAME} exists`);

    try {
      const { response } = await imageExistsLibpod({
        path: {
          name: this.BASE_IMAGE_NAME,
        },
      });

      if (response.status === 204) {
        log.info(`Image ${this.BASE_IMAGE_NAME} exists`);
        return true;
      } else {
        log.info(`Image ${this.BASE_IMAGE_NAME} does not exist`);
        return false;
      }
    } catch (error) {
      log.error(`Error checking if image ${this.BASE_IMAGE_NAME} exists`, error);
      return false;
    }
  }

  async pullBaseImage() {
    /**
     * ALWAYS pull to avoid false positives from corrupted storage
     * The exists API can return 204 even when the image doesn't actually exist
     *
     * See https://github.com/containers/podman/issues/14003
     */
    log.info(`Force pulling image ${this.BASE_IMAGE_NAME} to ensure it's available`);

    // Reset state at the beginning
    this._pullPercentage = 0;
    this._pullMessage = `Preparing to pull image ${this.BASE_IMAGE_NAME}`;
    this._pullError = null;

    try {
      // Update state before making the API call
      this._pullPercentage = 10;
      this._pullMessage = `Initiating pull for ${this.BASE_IMAGE_NAME}`;

      const pullResponse = await imagePullLibpod({
        query: {
          reference: this.BASE_IMAGE_NAME,
        },
      });

      // The pull endpoint streams JSON responses during the pull
      // We need to wait for the complete response
      if (pullResponse.response.status === 200) {
        log.info(`Image ${this.BASE_IMAGE_NAME} pull initiated...`);

        // Update progress during pull
        this._pullPercentage = 50;
        this._pullMessage = `Downloading ${this.BASE_IMAGE_NAME}`;

        // The response contains streaming data - we should check if pull completed
        if (pullResponse.data) {
          log.info(`Image ${this.BASE_IMAGE_NAME} pulled successfully`);

          // Update state on success
          this._pullPercentage = 100;
          this._pullMessage = `Successfully pulled ${this.BASE_IMAGE_NAME}`;
          this._pullError = null;

          return;
        }
      } else {
        // Try to read the error body for more details
        let errorMessage = `Error pulling image ${this.BASE_IMAGE_NAME} - Status: ${pullResponse.response.status}`;
        try {
          const errorBody = await pullResponse.response.text();
          log.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, pullResponse.response.status, errorBody);
          errorMessage += ` - ${errorBody}`;
        } catch (e) {
          log.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, pullResponse.response);
        }

        // Update state on error
        this._pullPercentage = 0;
        this._pullMessage = null;
        this._pullError = errorMessage;

        throw new Error(errorMessage);
      }
    } catch (error) {
      log.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, error);

      // Update state on catch block error
      this._pullPercentage = 0;
      this._pullMessage = null;
      this._pullError = error instanceof Error ? error.message : `Unknown error pulling image ${this.BASE_IMAGE_NAME}`;

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
