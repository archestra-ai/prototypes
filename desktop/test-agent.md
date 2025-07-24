# Agent Testing Guide

## Prerequisites

1. Ensure Ollama is running: `ollama serve`
2. Ensure you have a model installed: `ollama pull llama2:7b` or `ollama pull mistral`
3. Start the Archestra desktop app

## Test Commands

### Basic Test (No Tools)

```
/agent tell me about the weather today
```

Expected: Agent should provide general information about checking weather without using tools.

### File Listing Test

```
/agent list files in my current user directory
```

Expected: Agent should provide instructions on how to list files since it can't execute commands directly.

### Planning Test

```
/agent help me organize my desktop files into folders
```

Expected: Agent should create a step-by-step plan for organizing files.

## Debugging

If you see a 404 error:

1. Check if Ollama is running
2. Check if the model is installed
3. Check the console logs for API calls

If the agent doesn't respond:

1. Check the browser console for errors
2. Look for "🚀 [ArchestraAgent]" logs
3. Look for "🌐 [FETCH Debug]" logs to see API calls

## Expected Behavior

For models without tool support (most Ollama models):

- Agent will provide detailed instructions instead of executing actions
- Agent will break down tasks into steps
- Agent will explain what the user should do

For models with tool support:

- Agent will attempt to use MCP tools
- Agent will show tool execution results
- Agent will complete tasks autonomously
