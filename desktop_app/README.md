# AI Chat Electron App

An Electron application with React that uses Vercel AI SDK to chat with OpenAI.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

3. Add your OpenAI API key to the `.env` file:

```
OPENAI_API_KEY=your-actual-api-key-here
```

## Running the app

```bash
pnpm start
```

## Database Studio

```bash
npx drizzle-kit studio
```

## Features

- Electron desktop application
- React frontend with useChat hook from Vercel AI SDK
- Express backend server integrated with Electron
- Streaming chat responses from OpenAI
- Clean, responsive UI

## Tech Stack

- Electron
- React
- TypeScript
- Express.js
- Vercel AI SDK
- OpenAI API
