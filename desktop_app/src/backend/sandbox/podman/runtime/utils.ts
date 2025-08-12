export type PodmanMachineInstallationProgress = {
  percentage: number;
  message: string;
};

/**
 * Parses Podman machine installation output and returns progress percentage and message.
 *
 * Progress distribution:
 * - 0-5%: Looking up image and getting signatures
 * - 5-60%: Copying blob (main download phase)
 * - 60-65%: Copying config and writing manifest
 * - 65-75%: Extracting compressed file
 * - 75-85%: Machine init complete
 * - 85-95%: Starting machine
 * - 95-100%: Machine started successfully
 */
export const parsePodmanMachineInstallationProgress = (output: string): PodmanMachineInstallationProgress => {
  // Check for initial "Looking up" message
  if (output.includes('Looking up Podman Machine image')) {
    return {
      percentage: 0,
      message: 'Looking up Podman Machine image',
    };
  }

  // Check for "Getting image source signatures"
  if (output.includes('Getting image source signatures')) {
    return {
      percentage: 5,
      message: 'Getting image source signatures',
    };
  }

  // Parse "Copying blob" progress (5-60% of total progress)
  const copyingBlobMatch = output.match(/Copying blob \w+ \[([=>\-\s]+)\]\s*(\d+\.?\d*)MiB\s*\/\s*(\d+\.?\d*)MiB/);
  if (copyingBlobMatch) {
    const current = parseFloat(copyingBlobMatch[2]);
    const total = parseFloat(copyingBlobMatch[3]);
    const blobPercentage = (current / total) * 100;
    // Scale blob progress from 0-100% to 5-60% of total progress
    const scaledPercentage = Math.round(5 + blobPercentage * 0.55);

    return {
      percentage: Math.min(scaledPercentage, 60),
      message: `Copying machine image: ${current}MiB / ${total}MiB`,
    };
  }

  // Check for "Copying blob ... done"
  if (output.includes('Copying blob') && output.includes('done')) {
    return {
      percentage: 60,
      message: 'Copying machine image complete',
    };
  }

  // Check for "Copying config ... done"
  if (output.includes('Copying config') && output.includes('done')) {
    return {
      percentage: 62,
      message: 'Copying configuration',
    };
  }

  // Check for "Writing manifest"
  if (output.includes('Writing manifest to image destination')) {
    return {
      percentage: 65,
      message: 'Writing manifest',
    };
  }

  // Parse "Extracting compressed file" progress (65-75% of total progress)
  const extractionMatch = output.match(
    /Extracting compressed file:.*\[([=\s>\-]+)\]\s*(\d+\.?\d*)MiB\s*\/\s*(\d+\.?\d*)MiB/
  );
  if (extractionMatch) {
    const current = parseFloat(extractionMatch[2]);
    const total = parseFloat(extractionMatch[3]);
    const extractionPercentage = (current / total) * 100;
    // Scale extraction progress from 0-100% to 65-75% of total progress
    const scaledPercentage = Math.round(65 + extractionPercentage * 0.1);

    return {
      percentage: Math.min(scaledPercentage, 75),
      message: `Extracting machine image: ${current}MiB / ${total}MiB`,
    };
  }

  // Check for extraction done
  if (output.includes('Extracting compressed file:') && output.includes(': done')) {
    return {
      percentage: 75,
      message: 'Extraction complete',
    };
  }

  // Check for "Machine init complete"
  if (output.includes('Machine init complete')) {
    return {
      percentage: 85,
      message: 'Machine initialization complete',
    };
  }

  // Check for "Starting machine"
  if (output.includes('Starting machine')) {
    return {
      percentage: 90,
      message: 'Starting podman machine...',
    };
  }

  // Check for successful completion
  if (output.includes('started successfully')) {
    return {
      percentage: 100,
      message: 'Podman machine started successfully',
    };
  }

  // Default state
  return {
    percentage: 0,
    message: output.trim() || 'Waiting...',
  };
};
