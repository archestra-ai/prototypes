# Binary Download Instructions

This directory contains platform-specific binaries required for Archestra to run properly.

## Required Binaries

### All Platforms
- `podman-remote-static-v5.5.2` - Container runtime
- `gvproxy` - Network proxy for podman
- `ollama` - Local LLM runtime

### macOS Only
- `vfkit` - Virtualization framework required for podman on macOS

## Downloading vfkit for macOS

The vfkit binaries are not included in the repository due to their size. You must download them manually:

### For macOS ARM64 (Apple Silicon):
```bash
curl -L -o resources/bin/mac/arm64/vfkit https://github.com/crc-org/vfkit/releases/download/v0.5.1/vfkit-arm64
chmod +x resources/bin/mac/arm64/vfkit
```

### For macOS x86_64 (Intel):
```bash
curl -L -o resources/bin/mac/x86_64/vfkit https://github.com/crc-org/vfkit/releases/download/v0.5.1/vfkit-amd64
chmod +x resources/bin/mac/x86_64/vfkit
```

## Verification

After downloading, verify the binaries are executable:
```bash
# For ARM64
file resources/bin/mac/arm64/vfkit
# Should output: Mach-O 64-bit executable arm64

# For x86_64
file resources/bin/mac/x86_64/vfkit  
# Should output: Mach-O 64-bit executable x86_64
```

## Notes

- Binary names must match exactly as expected by the code (e.g., `gvproxy` and `vfkit` without version suffixes)
- Windows binaries should have `.exe` extension
- All binaries must have executable permissions on Unix-like systems