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

  private pullPercentage = 0;
  private pullMessage: string | null = null;
  private pullError: string | null = null;

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
    this.pullPercentage = 0;
    this.pullMessage = `Preparing to pull image ${this.BASE_IMAGE_NAME}`;
    this.pullError = null;

    try {
      // Update state before making the API call
      this.pullPercentage = 5;
      this.pullMessage = `Connecting to registry for ${this.BASE_IMAGE_NAME}`;

      const pullResponse = await imagePullLibpod({
        query: {
          reference: this.BASE_IMAGE_NAME,
        },
      });

      // The pull endpoint streams JSON responses during the pull
      // We need to parse the streaming response for progress
      if (pullResponse.response.status === 200) {
        log.info(`Image ${this.BASE_IMAGE_NAME} pull initiated...`);

        // Parse the response body as text to handle streaming JSON
        const responseText = await pullResponse.response.text();
        const lines = responseText.split('\n').filter((line) => line.trim());

        // Track download progress
        let totalSize = 0;
        let downloadedSize = 0;
        const layerProgress = new Map<string, { current: number; total: number }>();

        // Parse each line as a JSON event
        for (const line of lines) {
          try {
            const event = JSON.parse(line);

            // Handle different event types from Docker registry pull
            if (event.stream) {
              const streamMessage = event.stream.trim();

              // Parse layer download progress
              if (streamMessage.includes('Downloading')) {
                const match = streamMessage.match(
                  /(\w+):\s*Downloading\s*\[(=|>|\s)+\]\s*(\d+\.?\d*)\s*(\w+)\s*\/\s*(\d+\.?\d*)\s*(\w+)/
                );
                if (match) {
                  const layerId = match[1];
                  const current = this.parseSize(parseFloat(match[3]), match[4]);
                  const total = this.parseSize(parseFloat(match[5]), match[6]);

                  layerProgress.set(layerId, { current, total });

                  // Calculate overall progress
                  downloadedSize = 0;
                  totalSize = 0;
                  for (const [_, progress] of layerProgress) {
                    downloadedSize += progress.current;
                    totalSize += progress.total;
                  }

                  const percentage = Math.round((downloadedSize / totalSize) * 100);
                  this.pullPercentage = Math.min(95, Math.max(10, percentage)); // Keep between 10-95%
                  this.pullMessage = `Downloading layers: ${this.formatBytes(downloadedSize)} / ${this.formatBytes(totalSize)}`;
                }
              } else if (streamMessage.includes('Pull complete')) {
                // Layer completed
                this.pullMessage = `Extracting layers...`;
                this.pullPercentage = Math.min(98, this.pullPercentage + 2);
              } else if (streamMessage.includes('Already exists')) {
                // Layer already cached
                this.pullPercentage = Math.min(95, this.pullPercentage + 5);
              }
            }

            // Check for completion
            if (event.id && !event.stream && !event.status) {
              // This typically indicates the final image ID
              log.info(`Image ${this.BASE_IMAGE_NAME} pulled successfully with ID: ${event.id}`);
            }
          } catch (e) {
            // Skip malformed JSON lines
            log.debug(`Skipping malformed JSON line: ${line}`);
          }
        }

        // Update state on success
        this.pullPercentage = 100;
        this.pullMessage = `Successfully pulled ${this.BASE_IMAGE_NAME}`;
        this.pullError = null;

        return;
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
        this.pullPercentage = 0;
        this.pullMessage = null;
        this.pullError = errorMessage;

        throw new Error(errorMessage);
      }
    } catch (error) {
      log.error(`Error pulling image ${this.BASE_IMAGE_NAME}`, error);

      // Update state on catch block error
      this.pullPercentage = 0;
      this.pullMessage = null;
      this.pullError = error instanceof Error ? error.message : `Unknown error pulling image ${this.BASE_IMAGE_NAME}`;

      throw error;
    }
  }

  /**
   * Parse size from different units to bytes
   */
  private parseSize(value: number, unit: string): number {
    const units: Record<string, number> = {
      B: 1,
      kB: 1024,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };
    return value * (units[unit] || 1);
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  get statusSummary(): PodmanImageStatusSummary {
    return {
      pullPercentage: this.pullPercentage,
      pullMessage: this.pullMessage,
      pullError: this.pullError,
    };
  }
}
