# Lab 04: MCP — Connecting External Tools

CodeBuddy already has local tools (task tracker), workspace tools (filesystem + sandbox), and guardrails. But everything so far is local. In this lab, you'll use **MCP** to connect CodeBuddy to an external system — Notion — so it can document findings, manage project notes, and pull context from outside the workspace.

> **How to approach these labs:** You can't learn Mastra in one day, so focus on conceptually understanding what each new addition provides. There are questions throughout to help you think about use cases and what's happening behind the scenes. Don't worry about memorizing APIs — focus on the *why*.

## Prerequisites

- Completed Lab 03 (your project should have a working coding agent with workspace, memory, and processors)
- Node.js >= 22.13.0
- An OpenAI API key in `.env`
- A Notion account (free tier works)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start Mastra Studio:

```bash
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) to access Mastra Studio.

---

## Concepts

**MCP (Model Context Protocol)** is an open standard for discovering and using AI tools across systems. Think of it as **decentralized npm for AI tools**: instead of writing tool code yourself, you connect to servers that already provide the tools you need.

An **MCP server** exposes tools, resources, and prompts over a standard protocol. An **MCP client** (Mastra's `MCPClient`) connects to one or more servers and makes their tools available to your agent.

**Why MCP matters:** Without MCP, connecting to Notion would mean writing API wrapper tools by hand — learning the Notion API, handling auth, defining schemas. With MCP, someone already built the server. You add a few lines of config and your agent gets full Notion access.

**The key insight:** Your agent can use local tools (that you wrote), workspace tools (from Mastra), and MCP tools (from external servers) all at the same time. The agent doesn't care where a tool comes from — it only cares about the tool's description and schema.

> **Think about it:** You might wonder why not just use workspace tools for everything. Workspace tools operate on the local filesystem. MCP tools can reach external APIs, SaaS products, databases — anything with an MCP server. That's the difference: local vs. external.

---

## Part 1: Setting Up MCP and Notion

### Step 1: Install the MCP package

Add `@mastra/mcp` to your project:

```bash
npm install @mastra/mcp
```

### Step 2: Set up a Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Name it something like "CodeBuddy MCP"
4. Copy the "Internal Integration Secret" (starts with `ntn_`)
5. Add the token to your `.env` file:

```bash
NOTION_TOKEN=ntn_your_token_here
```

6. In Notion, share a page with your integration (open a page → click "..." menu → "Add connections" → select your integration)

### Step 3: Create the MCP client

Create a new file `src/mastra/mcp/mcp-client.ts`:

```typescript
import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  servers: {
    notion: {
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: {
        NOTION_TOKEN: process.env.NOTION_TOKEN!,
      },
    },
  },
});

let mcpTools: Record<string, any> = {};

try {
  console.log('Initializing MCP servers...');
  mcpTools = await mcp.listTools();
  console.log(`MCP initialized with ${Object.keys(mcpTools).length} tools`);
  console.log('Available MCP tools:', Object.keys(mcpTools).join(', '));
} catch (error) {
  console.error('Failed to initialize MCP tools:', error);
  mcpTools = {};
}

export { mcp, mcpTools };
```

Key points:

- **`MCPClient`** manages connections to one or more MCP servers
- Each server runs as a subprocess via `npx` — it starts automatically when your agent starts
- **`NOTION_TOKEN`** is the env var the Notion MCP server expects. It passes your integration token to the Notion API automatically.
- **`listTools()`** discovers all available tools from all connected servers
- The **try/catch** is important: if the server fails to start, your agent still works — it just won't have Notion tools

### Step 4: Wire MCP tools into the agent

Update `src/mastra/agents/coding-agent.ts` to include MCP tools:

```typescript
import { mcpTools } from '../mcp/mcp-client';

// In the agent config, update tools and instructions:
  tools: { taskTool, ...mcpTools },
```

The `...mcpTools` spread adds all Notion tools into the agent's tool set alongside your local `taskTool`. The agent sees them all as equal options.

Also update the instructions to mention Notion:

```typescript
  instructions: `
    You are CodeBuddy, a helpful coding assistant for TypeScript and JavaScript projects.

    When responding:
    - Help users understand, debug, and improve their code
    - Use workspace tools to read, write, and edit files
    - Track tasks when asked — use the task tool to add, list, complete, and remove tasks
    - When asked to run code, use the execute_command tool
    - You have access to Notion via MCP — use it to document findings and manage project notes
    - Suggest clear, idiomatic TypeScript solutions
    - Keep explanations concise but include the "why" behind suggestions
    - If you find a bug, explain what's wrong, fix it, and verify by running tests
  `,
```

### Step 5: Update .env.example

Add the Notion key so future users know it's needed:

```bash
OPENAI_API_KEY=your-api-key
NOTION_TOKEN=ntn_your-notion-integration-token
```

---

## Part 2: Testing Notion Integration

### Step 6: Verify MCP startup

Restart the dev server. Check the terminal — you should see:

```
Initializing MCP servers...
MCP initialized with 15 tools
Available MCP tools: notion_search, notion_create_page, notion_retrieve_page, ...
```

The exact tool count depends on the Notion MCP server version, but you should see multiple Notion-specific tools.

### Step 7: Test Notion tools

In Studio, try:

- "What Notion pages do I have access to?" — the agent should use a Notion search/list tool
- "Create a new page in Notion titled 'Calculator Bug Report' with details about the subtract bug we found" — creates a real page in your Notion workspace
- "Search my Notion for anything about project setup"

Watch the tool calls in Studio — you'll see tools like `notion_create_page` or `notion_search` being called with the right parameters.

### Step 8: Combine local and external tools

Try a multi-step task that uses tools from different sources:

"Read calculator.ts, find the bug, add a task to fix it, and create a Notion page documenting the issue."

The agent should:
1. Use workspace `read_file` to read the code
2. Use local `manage-tasks` to add a task
3. Use Notion MCP tools to create a documentation page

Three tool sources, one conversation, zero custom integration code.

> **Think about it:** You just connected your agent to Notion without writing a single line of API wrapper code. The Notion MCP server handles auth, pagination, API versioning — all of it. What other external systems would benefit from MCP integration? Think about your team's tools: issue trackers, documentation, chat, CI/CD.

---

## Part 3: Understanding Tool Discovery

### Step 9: How tool discovery works

When `MCPClient` starts, it calls `listTools()` on each connected server. Each tool comes with:

- **name** — a unique identifier (e.g., `notion_create_page`)
- **description** — what the tool does (the agent reads this to decide when to use it)
- **inputSchema** — a JSON Schema defining what parameters the tool accepts

This is the same structure as your local tools created with `createTool()`. The agent treats all tools identically regardless of origin.

### Step 10: Adding more MCP servers

Adding another server is just a few lines — add a new entry to the `servers` object with a `command`, `args`, and any required `env` vars. The `MCPClient` connects to all servers at startup and merges their tools into one flat list.

You can find MCP servers for GitHub, Slack, Linear, and many other services.

> **Think about it:** Each MCP server you add gives the agent more tools. With many tools available, how does the agent choose? Tool descriptions are critical — they're instructions to the LLM about when to use each tool. Clear, specific descriptions lead to better tool selection.

---

## What You Built

- An **MCPClient** connecting to the Notion MCP server
- CodeBuddy with **local tools**, **workspace tools**, and **MCP tools** working together
- Understanding of how MCP tool discovery works and how agents select from multiple tool sources
- The ability to add any MCP server with just a few lines of configuration

In Lab 05, you'll add **evals and observability** — scorers to measure CodeBuddy's quality on a 0-1 scale, plus structured logging and tracing to see what's happening under the hood.
