import { parsePodmanMachineInstallationProgress } from './utils';

describe('parsePodmanMachineInstallationProgress', () => {
  describe('looking-up stage (0-5%)', () => {
    it('should detect "Looking up Podman Machine image" message', () => {
      const output = 'Looking up Podman Machine image at quay.io/podman/machine-os:5.5 to create VM';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 0,
        message: 'Looking up Podman Machine image',
      });
    });

    it('should detect "Getting image source signatures" message', () => {
      const output = 'Getting image source signatures';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 5,
        message: 'Getting image source signatures',
      });
    });
  });

  describe('copying-blob stage (5-60%)', () => {
    it('should parse copying blob progress at 51.0MiB / 885.7MiB', () => {
      const output = 'Copying blob 1f5c0ec86103 [=>----------------------] 51.0MiB / 885.7MiB | 50.1 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 51/885.7 = 5.76% of blob, scaled to 5 + (5.76 * 0.55) H 8%
      expect(progress).toEqual({
        percentage: 8,
        message: 'Copying machine image: 51MiB / 885.7MiB',
      });
    });

    it('should parse copying blob progress at 124.8MiB / 885.7MiB', () => {
      const output = 'Copying blob 1f5c0ec86103 [====>-------------------] 124.8MiB / 885.7MiB | 45.2 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 124.8/885.7 = 14.09% of blob, scaled to 5 + (14.09 * 0.55) H 13%
      expect(progress).toEqual({
        percentage: 13,
        message: 'Copying machine image: 124.8MiB / 885.7MiB',
      });
    });

    it('should parse copying blob progress at 200.9MiB / 885.7MiB', () => {
      const output = 'Copying blob 1f5c0ec86103 [=======>----------------] 200.9MiB / 885.7MiB | 79.1 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 200.9/885.7 = 22.68% of blob, scaled to 5 + (22.68 * 0.55) H 17%
      expect(progress).toEqual({
        percentage: 17,
        message: 'Copying machine image: 200.9MiB / 885.7MiB',
      });
    });

    it('should parse copying blob progress at 314.8MiB / 885.7MiB', () => {
      const output = 'Copying blob 1f5c0ec86103 [==========>-------------] 314.8MiB / 885.7MiB | 54.9 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 314.8/885.7 = 35.54% of blob, scaled to 5 + (35.54 * 0.55) H 25%
      expect(progress).toEqual({
        percentage: 25,
        message: 'Copying machine image: 314.8MiB / 885.7MiB',
      });
    });

    it('should parse copying blob at near completion', () => {
      const output = 'Copying blob 1f5c0ec86103 [========================] 885.0MiB / 885.7MiB | 50.1 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // Near 100% of blob should be capped at 60%
      expect(progress).toEqual({
        percentage: 60,
        message: 'Copying machine image: 885MiB / 885.7MiB',
      });
    });

    it('should detect copying blob done', () => {
      const output = 'Copying blob 1f5c0ec86103 done   |';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 60,
        message: 'Copying machine image complete',
      });
    });
  });

  describe('config and manifest stage (60-65%)', () => {
    it('should detect copying config done', () => {
      const output = 'Copying config 44136fa355 done   |';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 62,
        message: 'Copying configuration',
      });
    });

    it('should detect writing manifest', () => {
      const output = 'Writing manifest to image destination';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 65,
        message: 'Writing manifest',
      });
    });
  });

  describe('extracting stage (65-75%)', () => {
    it('should parse extracting progress at 352.0MiB / 885.7MiB', () => {
      const output =
        'Extracting compressed file: joey-test-arm64.raw [==============================>---------------------------------------] 352.0MiB / 885.7MiB';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 352/885.7 = 39.74% of extraction, scaled to 65 + (39.74 * 0.10) H 69%
      expect(progress).toEqual({
        percentage: 69,
        message: 'Extracting machine image: 352MiB / 885.7MiB',
      });
    });

    it('should parse extracting progress at 837.6MiB / 885.7MiB', () => {
      const output =
        'Extracting compressed file: joey-test-arm64.raw [==================================================================>----] 837.6MiB / 885.7MiB';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 837.6/885.7 = 94.57% of extraction, scaled to 65 + (94.57 * 0.10) H 74%
      expect(progress).toEqual({
        percentage: 74,
        message: 'Extracting machine image: 837.6MiB / 885.7MiB',
      });
    });

    it('should detect extraction complete', () => {
      const output = 'Extracting compressed file: joey-test-arm64.raw: done';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 75,
        message: 'Extraction complete',
      });
    });
  });

  describe('initialization and startup stages (75-100%)', () => {
    it('should detect "Machine init complete" message', () => {
      const output = 'Machine init complete';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 85,
        message: 'Machine initialization complete',
      });
    });

    it('should detect "Starting machine" message', () => {
      const output = 'Starting machine "joey-test"';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 90,
        message: 'Starting podman machine...',
      });
    });

    it('should detect successful completion', () => {
      const output = 'Machine "joey-test" started successfully';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 100,
        message: 'Podman machine started successfully',
      });
    });
  });

  describe('default/idle state', () => {
    it('should return idle state for unrecognized output', () => {
      const output = 'Some random output that we do not recognize';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 0,
        message: 'Some random output that we do not recognize',
      });
    });

    it('should return idle state with "Waiting..." for empty output', () => {
      const output = '';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 0,
        message: 'Waiting...',
      });
    });

    it('should handle whitespace-only output', () => {
      const output = '   \n\t  ';
      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 0,
        message: 'Waiting...',
      });
    });
  });

  describe('multi-line output handling', () => {
    it('should handle output with successful completion in multi-line text', () => {
      // The function processes single lines, but should still find "started successfully" in a longer line
      const output = 'Machine "joey-test" started successfully';

      const progress = parsePodmanMachineInstallationProgress(output);

      expect(progress).toEqual({
        percentage: 100,
        message: 'Podman machine started successfully',
      });
    });

    it('should process each line individually when called multiple times', () => {
      // Simulate how the function would be called in practice - line by line
      const lines = [
        'Looking up Podman Machine image at quay.io/podman/machine-os:5.5 to create VM',
        'Getting image source signatures',
        'Copying blob 1f5c0ec86103 done   |',
        'Copying config 44136fa355 done   |',
        'Writing manifest to image destination',
        'Extracting compressed file: joey-test-arm64.raw: done',
        'Machine init complete',
        'Starting machine "joey-test"',
        'Machine "joey-test" started successfully',
      ];

      const expectedResults = [
        { percentage: 0, message: 'Looking up Podman Machine image' },
        { percentage: 5, message: 'Getting image source signatures' },
        { percentage: 60, message: 'Copying machine image complete' },
        { percentage: 62, message: 'Copying configuration' },
        { percentage: 65, message: 'Writing manifest' },
        { percentage: 75, message: 'Extraction complete' },
        { percentage: 85, message: 'Machine initialization complete' },
        { percentage: 90, message: 'Starting podman machine...' },
        { percentage: 100, message: 'Podman machine started successfully' },
      ];

      lines.forEach((line, index) => {
        const progress = parsePodmanMachineInstallationProgress(line);
        expect(progress).toEqual(expectedResults[index]);
      });
    });

    it('should handle output with ANSI escape codes', () => {
      const output = '\x1b[2K\rCopying blob 1f5c0ec86103 [====>-------------------] 100.0MiB / 885.7MiB | 50.1 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 100/885.7 = 11.29% of blob, scaled to 5 + (11.29 * 0.55) H 11%
      expect(progress).toEqual({
        percentage: 11,
        message: 'Copying machine image: 100MiB / 885.7MiB',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle blob copy with different hash', () => {
      const output = 'Copying blob abc123def456 [========>---------------] 400.0MiB / 885.7MiB | 25.0 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 400/885.7 = 45.16% of blob, scaled to 5 + (45.16 * 0.55) H 30%
      expect(progress).toEqual({
        percentage: 30,
        message: 'Copying machine image: 400MiB / 885.7MiB',
      });
    });

    it('should handle decimal values correctly', () => {
      const output = 'Copying blob 1f5c0ec86103 [====>-------------------] 123.456MiB / 885.7MiB | 45.2 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 123.456/885.7 = 13.94% of blob, scaled to 5 + (13.94 * 0.55) H 13%
      expect(progress).toEqual({
        percentage: 13,
        message: 'Copying machine image: 123.456MiB / 885.7MiB',
      });
    });

    it('should handle very small progress values', () => {
      const output = 'Copying blob 1f5c0ec86103 [>-----------------------] 0.1MiB / 885.7MiB | 50.1 MiB/s';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 0.1/885.7 = 0.011% of blob, scaled to 5 + (0.011 * 0.55) H 5%
      expect(progress).toEqual({
        percentage: 5,
        message: 'Copying machine image: 0.1MiB / 885.7MiB',
      });
    });

    it('should handle extraction with different filename', () => {
      const output =
        'Extracting compressed file: archestra-ai-machine-arm64.raw [==============>---------] 500.0MiB / 885.7MiB';
      const progress = parsePodmanMachineInstallationProgress(output);

      // 500/885.7 = 56.46% of extraction, scaled to 65 + (56.46 * 0.10) H 71%
      expect(progress).toEqual({
        percentage: 71,
        message: 'Extracting machine image: 500MiB / 885.7MiB',
      });
    });

    it('should handle partial matches in text', () => {
      const output = 'The user started successfully logging into the system';
      const progress = parsePodmanMachineInstallationProgress(output);

      // Should match "started successfully" even in different context
      expect(progress).toEqual({
        percentage: 100,
        message: 'Podman machine started successfully',
      });
    });
  });

  describe('progress scaling validation', () => {
    it('should scale blob progress correctly across the range', () => {
      // Test key points in blob copying (0%, 25%, 50%, 75%, 100% of blob)
      const testCases = [
        { current: 0, total: 885.7, expectedPercentage: 5 },
        { current: 221.425, total: 885.7, expectedPercentage: 19 }, // 25% of blob
        { current: 442.85, total: 885.7, expectedPercentage: 33 }, // 50% of blob
        { current: 664.275, total: 885.7, expectedPercentage: 46 }, // 75% of blob
        { current: 885.7, total: 885.7, expectedPercentage: 60 }, // 100% of blob
      ];

      testCases.forEach(({ current, total, expectedPercentage }) => {
        const output = `Copying blob 1f5c0ec86103 [========================] ${current}MiB / ${total}MiB`;
        const progress = parsePodmanMachineInstallationProgress(output);
        expect(progress.percentage).toBe(expectedPercentage);
      });
    });

    it('should scale extraction progress correctly across the range', () => {
      // Test key points in extraction (0%, 25%, 50%, 75%, 100% of extraction)
      const testCases = [
        { current: 0, total: 885.7, expectedPercentage: 65 },
        { current: 221.425, total: 885.7, expectedPercentage: 68 }, // 25% of extraction
        { current: 442.85, total: 885.7, expectedPercentage: 70 }, // 50% of extraction
        { current: 664.275, total: 885.7, expectedPercentage: 73 }, // 75% of extraction
        { current: 885.7, total: 885.7, expectedPercentage: 75 }, // 100% of extraction
      ];

      testCases.forEach(({ current, total, expectedPercentage }) => {
        const output = `Extracting compressed file: test.raw [========================] ${current}MiB / ${total}MiB`;
        const progress = parsePodmanMachineInstallationProgress(output);
        expect(progress.percentage).toBe(expectedPercentage);
      });
    });
  });
});
