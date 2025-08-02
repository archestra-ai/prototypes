# Podman Binaries Setup

This directory contains the Podman binaries needed for MCP server sandboxing.

## Required Binaries

You need to download the Podman v5.5.2 binaries from the official releases:
https://github.com/containers/podman/releases/tag/v5.5.2

### macOS (Darwin)

1. Download the macOS release package
2. Extract and rename the podman binary to `podman-v5.5.2-x86_64-apple-darwin`
3. For ARM64 Macs, also add `podman-v5.5.2-aarch64-apple-darwin`

### Linux

1. Download the appropriate Linux binary for your architecture
2. Rename to `podman-v5.5.2-x86_64-unknown-linux-gnu`

### Windows

1. Download the Windows release
2. Rename to `podman-v5.5.2-x86_64-pc-windows-msvc.exe`

## File Structure

After setup, this directory should contain:

```
binaries/
├── ollama-v0.9.6-*  (existing Ollama binaries)
├── podman-v5.5.2-x86_64-apple-darwin
├── podman-v5.5.2-aarch64-apple-darwin
├── podman-v5.5.2-x86_64-unknown-linux-gnu
├── podman-v5.5.2-x86_64-pc-windows-msvc.exe
└── README.md (this file)
```

## Permissions

Ensure all podman binaries have execute permissions:

```bash
chmod +x podman-v5.5.2-*
```

## Note

The Tauri build process will automatically bundle the correct binary for each platform based on the target architecture.
