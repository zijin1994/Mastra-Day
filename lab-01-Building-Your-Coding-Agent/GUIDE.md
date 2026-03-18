# Lab 01: Building Your Coding Agent

In this lab, you'll build a coding assistant called CodeBuddy from scratch — starting with a basic agent, adding tools for task tracking and file reading, then wiring up memory for multi-turn conversations and semantic recall.

> **How to approach these labs:** You can't learn Mastra in one day, so focus on conceptually understanding what each new addition provides. There are questions throughout to help you think about use cases and what's happening behind the scenes. Don't worry about memorizing APIs — focus on the *why*.

## Prerequisites

- Node.js >= 22.13.0
- An OpenAI API key

## Setup

1. Copy `.env.example` to `.env` and add your OpenAI API key:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Start Mastra Studio:

```bash
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) to access Mastra Studio.

---

## Concepts

**Mastra** is a TypeScript framework for building AI agents. A Mastra project is organized under `src/mastra/` with directories for `agents/`, `tools/`, and `workflows/`. The entry point is `src/mastra/index.ts`, where you create a `Mastra` instance and register your agents.

**An agent** is an LLM with a persistent identity, instructions, and access to tools. You define agents using the `Agent` class with an `id`, `name`, `instructions` (system prompt), and `model`.

**Tools** are functions the agent can decide to call. Each tool has an `id`, `description`, `inputSchema`, `outputSchema` (defined with Zod), and an `execute` function. The agent reads the tool's description and schema to decide when and how to call it.

**Memory** enables agents to remember past conversations. Without memory, every call is stateless — the agent forgets everything between messages. Mastra provides three layers: message history (chat log), semantic recall (vector-based search across past conversations), and observational memory (automatic compression of long conversations).

---

## Part 1: Your First Agent

### Step 1: Create the Coding Agent

Create a new file `src/mastra/agents/coding-agent.ts`:

```typescript
import { Agent } from '@mastra/core/agent';

export const codingAgent = new Agent({
  id: 'coding-agent',
  name: 'CodeBuddy',
  instructions: `
    You are CodeBuddy, a helpful coding assistant for TypeScript and JavaScript projects.

    When responding:
    - Help users understand, debug, and improve their code
    - Suggest clear, idiomatic TypeScript solutions
    - Keep explanations concise but include the "why" behind suggestions
  `,
  model: 'openai/gpt-5-mini',
});
```

### Step 2: Register the Agent

Update `src/mastra/index.ts` to import and register the agent with persistent storage:

```typescript
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { codingAgent } from './agents/coding-agent';

export const mastra = new Mastra({
  agents: { codingAgent },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
});
```

LibSQL is a lightweight SQLite-compatible database that stores agent state locally. We set it up now so it's ready when we add memory later.

### Step 3: Test in Studio

Restart the dev server and open Mastra Studio. Select the **CodeBuddy** agent and try a conversation:

- "What's the difference between `let` and `const` in TypeScript?"
- "How do I type a function that takes an optional callback?"

The agent responds using its general knowledge — it can't access files or track tasks yet. That's what we'll fix next.

> **Think about it:** Right now, CodeBuddy has no tools. It can only answer from the LLM's training data. What kinds of coding tasks would require tools?

---

## Part 2: Adding a Task Tool

### Step 4: Create the Task Tool

Create a new file `src/mastra/tools/task-tool.ts`:

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const tasks = new Map<string, { id: string; title: string; completed: boolean }>();
let nextId = 1;

export const taskTool = createTool({
  id: 'manage-tasks',
  description: 'Manage coding tasks — add, list, complete, or remove tasks',
  inputSchema: z.object({
    action: z.enum(['add', 'list', 'complete', 'remove']).describe('The action to perform'),
    title: z.string().optional().describe('Task title (required for add)'),
    taskId: z.string().optional().describe('Task ID (required for complete/remove)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    tasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      completed: z.boolean(),
    })).optional(),
  }),
  execute: async ({ action, title, taskId }) => {
    switch (action) {
      case 'add': {
        if (!title) return { success: false, message: 'Title is required to add a task' };
        const id = String(nextId++);
        tasks.set(id, { id, title, completed: false });
        return { success: true, message: `Task #${id} added: "${title}"`, tasks: [...tasks.values()] };
      }
      case 'list': {
        const allTasks = [...tasks.values()];
        return {
          success: true,
          message: allTasks.length === 0 ? 'No tasks yet.' : `${allTasks.length} task(s)`,
          tasks: allTasks,
        };
      }
      case 'complete': {
        if (!taskId || !tasks.has(taskId)) return { success: false, message: `Task #${taskId} not found` };
        tasks.get(taskId)!.completed = true;
        return { success: true, message: `Task #${taskId} marked complete`, tasks: [...tasks.values()] };
      }
      case 'remove': {
        if (!taskId || !tasks.has(taskId)) return { success: false, message: `Task #${taskId} not found` };
        tasks.delete(taskId);
        return { success: true, message: `Task #${taskId} removed`, tasks: [...tasks.values()] };
      }
      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
  },
});
```

This tool uses an in-memory `Map` to store tasks. The `inputSchema` tells the LLM what parameters it can pass, and the `description` helps the LLM decide when to use this tool. Notice that the `action` field uses `z.enum()` — this constrains the LLM to only valid actions.

### Step 5: Wire the Tool into the Agent

Update `src/mastra/agents/coding-agent.ts` to import and register the tool:

```typescript
import { Agent } from '@mastra/core/agent';
import { taskTool } from '../tools/task-tool';

export const codingAgent = new Agent({
  id: 'coding-agent',
  name: 'CodeBuddy',
  instructions: `
    You are CodeBuddy, a helpful coding assistant for TypeScript and JavaScript projects.

    When responding:
    - Help users understand, debug, and improve their code
    - Track tasks when asked — use the task tool to add, list, complete, and remove tasks
    - Suggest clear, idiomatic TypeScript solutions
    - Keep explanations concise but include the "why" behind suggestions
  `,
  model: 'openai/gpt-5-mini',
  tools: { taskTool },
});
```

### Step 6: Test the Task Tool

Restart the dev server and try in Studio:

1. "Add a task: Fix the login bug"
2. "Add a task: Write unit tests for the auth module"
3. "List my tasks"
4. "Complete task #1"
5. "List my tasks" — task #1 should show as completed

Watch the tool calls in Studio's conversation view. You'll see the agent deciding to call `manage-tasks` with the appropriate action and parameters.

> **Think about it:** The task storage is in-memory using a `Map`. What happens when you restart the server? How would you make tasks persistent? (Hint: you could use the same LibSQL storage we set up for the Mastra instance.)

---

## Part 3: Adding a File Reader Tool

### Step 7: Create the File Reader Tool

Create a new file `src/mastra/tools/read-file-tool.ts`:

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve, normalize } from 'path';

const WORKSPACE_DIR = resolve(process.cwd(), '../../workspace');

export const readFileTool = createTool({
  id: 'read-file',
  description: 'Read a file from the workspace directory. Use this to examine code files.',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file relative to the workspace directory (e.g., "calculator.ts")'),
  }),
  outputSchema: z.object({
    content: z.string(),
    filePath: z.string(),
  }),
  execute: async ({ filePath }) => {
    const normalizedPath = normalize(filePath).replace(/^(\.\.[/\\])+/, '');
    const fullPath = resolve(WORKSPACE_DIR, normalizedPath);

    if (!fullPath.startsWith(WORKSPACE_DIR)) {
      throw new Error('Access denied: path is outside the workspace directory');
    }

    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(fullPath, 'utf-8');
    return { content, filePath: normalizedPath };
  },
});
```

Notice the security pattern here: we `normalize` the path to collapse any `../` sequences, then verify the resolved path still starts with `WORKSPACE_DIR`. This prevents path traversal attacks — a user can't trick the agent into reading `/etc/passwd` by passing `../../etc/passwd`.

The `WORKSPACE_DIR` resolves to `../../workspace` relative to `process.cwd()`. During `mastra dev`, the process runs from `.mastra/` inside your project, so `../../workspace` reaches the shared `workspace/` directory at the repo root.

### Step 8: Add the Tool to the Agent

Update `src/mastra/agents/coding-agent.ts`:

```typescript
import { Agent } from '@mastra/core/agent';
import { taskTool } from '../tools/task-tool';
import { readFileTool } from '../tools/read-file-tool';

export const codingAgent = new Agent({
  id: 'coding-agent',
  name: 'CodeBuddy',
  instructions: `
    You are CodeBuddy, a helpful coding assistant for TypeScript and JavaScript projects.

    When responding:
    - Help users understand, debug, and improve their code
    - When asked about files, use the read-file tool to examine them — never guess at file contents
    - Track tasks when asked — use the task tool to add, list, complete, and remove tasks
    - Suggest clear, idiomatic TypeScript solutions
    - Keep explanations concise but include the "why" behind suggestions
    - If you find a bug, explain what's wrong and provide a fix
  `,
  model: 'openai/gpt-5-mini',
  tools: { taskTool, readFileTool },
});
```

### Step 9: Test File Reading

Restart the dev server and try:

1. "Read the file calculator.ts" — the agent should call the `read-file` tool and show you the contents
2. "Read calculator.ts and check for any bugs" — the agent should read the file and identify the bug in the `subtract` function (it uses `a + b` instead of `a - b`)
3. "Read the test file calculator.test.ts" — the agent should show the test file

> **Think about it:** This tool can only *read* files. The agent can spot the bug in `subtract`, but it can't fix it. What would you need to add to make CodeBuddy a full coding assistant? (We'll solve this in Lab 02 with Workspaces.)

---

## Part 4: Adding Memory

### Step 10: Configure Memory

By default, agents are stateless — each call is independent. Try this: ask "Read calculator.ts" then follow up with "What was the bug you found?" The agent won't remember.

Update `src/mastra/agents/coding-agent.ts` to add memory with semantic recall and observational memory:

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLVector } from '@mastra/libsql';
import { taskTool } from '../tools/task-tool';
import { readFileTool } from '../tools/read-file-tool';

export const codingAgent = new Agent({
  id: 'coding-agent',
  name: 'CodeBuddy',
  instructions: `
    You are CodeBuddy, a helpful coding assistant for TypeScript and JavaScript projects.

    When responding:
    - Help users understand, debug, and improve their code
    - When asked about files, use the read-file tool to examine them — never guess at file contents
    - Track tasks when asked — use the task tool to add, list, complete, and remove tasks
    - Suggest clear, idiomatic TypeScript solutions
    - Keep explanations concise but include the "why" behind suggestions
    - If you find a bug, explain what's wrong and provide a fix
  `,
  model: 'openai/gpt-5-mini',
  tools: { taskTool, readFileTool },
  memory: new Memory({
    vector: new LibSQLVector({
      id: 'coding-agent-vector',
      url: 'file:./mastra.db',
    }),
    embedder: 'openai/text-embedding-3-small',
    options: {
      semanticRecall: {
        topK: 3,
        messageRange: 2,
        scope: 'resource',
      },
      observationalMemory: {
        model: 'openai/gpt-5-mini',
        observation: {
          messageTokens: 30_000,
        },
        reflection: {
          observationTokens: 40_000,
        },
      },
    },
  }),
});
```

Here's what each memory feature does:

- **Semantic Recall** (`semanticRecall`): Embeds messages as vectors and searches by meaning. `topK: 3` retrieves the 3 most relevant past messages, `messageRange: 2` includes surrounding context, and `scope: 'resource'` searches across all threads for the same user.
- **Observational Memory** (`observationalMemory`): Automatically compresses old messages into concise notes. The Observer creates summaries at 30,000 tokens, and the Reflector condenses those summaries at 40,000 tokens. This prevents "context rot" where too much raw history degrades performance.
- **LibSQLVector**: Provides the vector storage backend for semantic recall, using the same database file as our main storage.

### Step 11: Test Multi-Turn Conversations

Restart the dev server and try this conversation:

1. "Read calculator.ts and tell me about it"
2. "What bugs did you find?" — the agent should remember the previous exchange
3. "Add a task to fix the subtract function" — the agent should remember the bug context
4. Start a **new thread** but keep the same `resourceId` — ask "What do you know about the calculator module?" Semantic recall should surface information from the previous thread.

> **Think about it:** With `scope: 'resource'`, semantic recall searches across all threads for a given user. Imagine you discussed a project's architecture in one thread and now you're debugging a specific file in a new thread. Semantic recall can connect the dots. What kinds of cross-thread context would be valuable for a coding assistant?

---

## What You Built

- A coding agent (**CodeBuddy**) with a persistent identity and system instructions
- A **task tool** for tracking coding tasks with in-memory CRUD operations
- A **file reader tool** that safely reads files from the workspace with path validation
- **Memory** with semantic recall for meaning-based search and observational memory for context compression
- Everything running in **Mastra Studio** with visible tool calls and conversation history

In Lab 02, you'll replace the manual file reader tool with Mastra's **Workspace** feature — which gives your agent a full filesystem and sandboxed code execution out of the box.
