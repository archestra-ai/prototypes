# Release Please Refactor

## Changes Made

### 1. Updated `.github/release-please/release-please-config.json`

Added the `extra-files` configuration to the desktop package to automatically update version numbers in:
- `desktop/package.json`
- `desktop/src-tauri/Cargo.toml` 
- `desktop/src-tauri/tauri.conf.json`

### 2. Workflow Changes Required

Due to GitHub App permissions, I cannot directly modify workflow files. You'll need to manually remove the "Update version from release-please tag" step from `.github/workflows/release-please.yml` (lines 78-93).

The patch file `release-please-workflow.patch` shows exactly what needs to be removed.

## How It Works

With the `extra-files` configuration, release-please will now:
1. Automatically detect when a new release is created
2. Update the version in all specified files as part of the release PR
3. Commit these changes to the release PR

This eliminates the need for manual version updates using jq/sed commands in the workflow.

## Benefits

- Cleaner workflow file
- Version updates happen as part of the release PR, not during the build
- More maintainable and follows release-please best practices
- All version bumping logic is centralized in the release-please configuration