export type SupportedPlatform = 'linux' | 'mac' | 'win';
export type SupportedArchitecture = 'arm64' | 'x86_64';

/**
 * NOTE: `gvproxy` MUST be named explicitly `gvproxy`. It cannot have the version appended to it, this is because
 * `podman` internally is looking specifically for that binary naming convention. As of this writing, the version
 * of `gvproxy` that we are using is [`v0.8.6`](https://github.com/containers/gvisor-tap-vsock/releases/tag/v0.8.6)
 */
export type SupportedBinary = 'ollama-v0.9.6' | 'podman-remote-static-v5.5.2' | 'gvproxy';
