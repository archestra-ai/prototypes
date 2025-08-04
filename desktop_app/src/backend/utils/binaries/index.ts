/**
 * This file is used to get the path to the binaries for a list of supported binaries.
 *
 * See https://stackoverflow.com/questions/33152533/bundling-precompiled-binary-into-electron-app
 */
import { app } from 'electron';
import fs from 'fs';
import { arch, platform } from 'os';
import path from 'path';

type SupportedPlatform = 'linux' | 'mac' | 'win';
type SupportedArchitecture = 'arm64' | 'x86_64';

/**
 * NOTE: `gvproxy` MUST be named explicitly `gvproxy`. It cannot have the version appended to it, this is because
 * `podman` internally is looking specifically for that binary naming convention. As of this writing, the version
 * of `gvproxy` that we are using is [`v0.8.6`](https://github.com/containers/gvisor-tap-vsock/releases/tag/v0.8.6)
 */
type SupportedBinary = 'ollama-v0.9.6' | 'podman-remote-static-v5.5.2' | 'gvproxy';

const getPlatform = (): SupportedPlatform => {
  switch (platform()) {
    case 'aix':
    case 'freebsd':
    case 'linux':
    case 'openbsd':
    case 'android':
      return 'linux';
    case 'darwin':
    case 'sunos':
      return 'mac';
    case 'win32':
      return 'win';
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }
};

const getArchitecture = (): SupportedArchitecture => {
  switch (arch()) {
    // 32-bit ARM, different from aarch64
    // case 'arm':
    //   return 'arm';
    // case 'ia32':
    //   return 'x86';
    case 'arm64':
      return 'arm64';
    // this is the same as x86_64
    case 'x64':
      return 'x86_64';
    default:
      throw new Error(`Unsupported architecture: ${arch()}`);
  }
};

const PLATFORM = getPlatform();
const ARCHITECTURE = getArchitecture();

export const getBinariesDirectory = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(app.getAppPath(), 'resources', 'bin', PLATFORM, ARCHITECTURE);

export const getBinaryExecPath = (binaryName: SupportedBinary) => {
  const binaryPath = path.resolve(
    path.join(getBinariesDirectory(), `${binaryName}${PLATFORM === 'win' ? '.exe' : ''}`)
  );
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary ${binaryName} not found at ${binaryPath}`);
  }
  return binaryPath;
};
