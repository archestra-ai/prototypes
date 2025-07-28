# GitHub Workflow Note

Due to permissions restrictions, I cannot directly create files in the `.github/workflows` directory. 

The workflow file `build-mcp-server-sandbox-docker-image.yml` has been created in the root directory and needs to be manually moved to `.github/workflows/`.

## Required Updates to Existing Workflows

### 1. Update `.github/workflows/linting-and-tests.yml`

Add a job to build the Docker image (without pushing):

```yaml
  build-mcp-server-sandbox:
    name: Build MCP Server Sandbox Image
    uses: ./.github/workflows/build-mcp-server-sandbox-docker-image.yml
    with:
      push_to_gcr: false
```

### 2. Create `.github/workflows/on-commits-to-main.yml`

This workflow should build and push the image to GCR:

```yaml
name: On Commits to Main

on:
  push:
    branches:
      - main

jobs:
  build-and-push-mcp-server-sandbox:
    name: Build and Push MCP Server Sandbox Image
    uses: ./.github/workflows/build-mcp-server-sandbox-docker-image.yml
    with:
      push_to_gcr: true
    secrets: inherit
```

## GCR Setup TODO

When GCR is configured:
1. Update the `GCR_REGISTRY` environment variable in the workflow
2. Add the `GCR_SERVICE_ACCOUNT_KEY` secret to the repository
3. Update the image URL in `desktop/src-tauri/src/sandbox/mod.rs` from `archestra/mcp-server-sandbox:latest` to the actual GCR URL