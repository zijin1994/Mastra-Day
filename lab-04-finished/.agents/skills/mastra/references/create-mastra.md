# Create Mastra Reference

Complete guide for creating new Mastra projects. Includes both quickstart CLI method and detailed manual installation.

**Official documentation: [mastra.ai/docs](https://mastra.ai/docs)**

## Getting Started

Ask: **"How would you like to create your Mastra project?"**

1. **Quick Setup**: Copy and run: `npm create mastra@latest`
2. **Guided Setup**: I walk you through each step, you approve commands
3. **Automatic Setup**: I create everything, just give me your API key

> **For AI agents:** The CLI is interactive. Use **Automatic Setup** to create files using the steps in "Automatic Setup / Manual Installation" below.

## Prerequisites

- An API key from a supported model provider (OpenAI, Anthropic, Google, etc.)

## Quick Setup (user runs CLI)

Create a new Mastra project with one command:

```bash
npm create mastra@latest
```

## Automatic setup / manual installation

**Use this for automatic setup** (AI creates all files) or when you prefer manual control.

### Step 1: Create project directory

```bash
mkdir my-first-agent && cd my-first-agent
npm init -y
```

### Step 2: Install dependencies

```bash
npm install -D typescript @types/node mastra@latest
npm install @mastra/core@latest zod@^4
```

### Step 3: Configure TypeScript

Create `tsconfig.json` with `"module": "ES2022"` and `"moduleResolution": "bundler"`.

### Step 4: Create environment file

Create `.env` with your API key.

### Step 5: Create agent and tools

See the main reference for full examples.

### Step 6: Launch development server

```bash
npm run dev
```

Access Studio at `http://localhost:4111`.

## Resources

- [Docs](https://mastra.ai/docs)
- [GitHub](https://github.com/mastra-ai/mastra)
