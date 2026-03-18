# Lab 02: Workspaces

In this lab, you'll replace the manual `readFileTool` from Lab 01 with Mastra's Workspace feature — giving your agent a full filesystem and sandboxed code execution with zero custom tool code.

> **How to approach these labs:** You can't learn Mastra in one day, so focus on conceptually understanding what each new addition provides. There are questions throughout to help you think about use cases and what's happening behind the scenes. Don't worry about memorizing APIs — focus on the *why*.

## Prerequisites

- Completed Lab 01 (your project should have a working coding agent with task tool, file reader tool, and memory)
- Node.js >= 22.13.0
- An OpenAI API key in `.env`

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

**Workspace** (from `@mastra/core/workspace`) gives an agent a persistent environment with filesystem access and command execution. Instead of manually building file tools one at a time, a Workspace provides a full suite automatically.

**LocalFilesystem** provides 8 tools out of the box:
- `read_file` — read file contents
- `write_file` — create or overwrite files
- `edit_file` — make targeted edits to existing files
- `list_files` — list directory contents
- `delete` — remove files
- `file_stat` — get file metadata (size, dates)
- `mkdir` — create directories
- `grep` — search file contents with patterns

**LocalSandbox** provides 3 tools for running code:
- `execute_command` — run shell commands
- `get_process_output` — check output from running processes
- `kill_process` — stop a running process

Compare this to Lab 01, where you wrote a single `readFileTool` by hand. Workspace gives you **11 tools for free** — including the ability to *write* and *execute* code, not just read it.

---

## Part 1: Adding a Workspace

### Step 1: Create the Workspace

Create a new file `src/mastra/workspace/workspace.ts`:

```typescript
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || './workspace';

export const workspace = new Workspace({
  id: 'codebuddy-workspace',
  filesystem: new LocalFilesystem({
    basePath: WORKSPACE_PATH,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: WORKSPACE_PATH,
  }),
});
```

The `WORKSPACE_PATH` defaults to `./workspace` relative to where the process runs. During `mastra dev`, this resolves correctly to the `workspace/` directory in your project. You can override it with a `WORKSPACE_PATH` environment variable if needed.

> **Note:** Path resolution differs between `mastra dev` (development) and `mastra start` (production). The `process.env.WORKSPACE_PATH` override lets you handle both cases without changing code.

### Step 2: Wire the Workspace into the Agent

Update `src/mastra/agents/coding-agent.ts` to use the workspace instead of the manual `readFileTool`:

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLVector } from '@mastra/libsql';
import { taskTool } from '../tools/task-tool';
import { workspace } from '../workspace/workspace';

export const codingAgent = new Agent({
  id: 'coding-agent',
  name: 'CodeBuddy',
  instructions: `
    You are CodeBuddy, a helpful coding assistant for TypeScript and JavaScript projects.

    When responding:
    - Help users understand, debug, and improve their code
    - Use workspace tools to read, write, and edit files
    - Track tasks when asked — use the task tool to add, list, complete, and remove tasks
    - When asked to run code, use the execute_command tool
    - Suggest clear, idiomatic TypeScript solutions
    - Keep explanations concise but include the "why" behind suggestions
    - If you find a bug, explain what's wrong, fix it, and verify by running tests
  `,
  model: 'openai/gpt-5-mini',
  tools: { taskTool },
  workspace,
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

Notice what changed:
- Removed the `readFileTool` import entirely
- Added `workspace` as a top-level property on the agent
- Updated instructions to reference workspace tools (`read_file`, `write_file`, `edit_file`, `execute_command`)
- The `taskTool` stays in `tools` — workspace tools and manual tools coexist

### Step 3: Delete the Old File Reader Tool

You no longer need the manual file reader. Delete `src/mastra/tools/read-file-tool.ts`.

### Step 4: Test Filesystem Tools

Restart the dev server and try these in Studio:

1. "Read calculator.ts" — uses the workspace `read_file` tool
1. "List all files in the workspace" — uses `list_files`
1. "Search for the word 'bug' in all files" — uses `grep`
1. "Create a new file called notes.txt with the content 'TODO: fix subtract'" — uses `write_file`

Watch the tool calls in Studio. You should see tools like `read_file`, `list_files`, `grep`, and `write_file` — all provided automatically by the Workspace.

> **Think about it:** In Lab 01, you wrote ~30 lines of code for a single read-only file tool with manual path validation. The Workspace gives you 8 filesystem tools with built-in sandboxing. What's the tradeoff? When might you still want a custom tool instead of Workspace?

---

## Part 2: Sandboxed Code Execution

### Step 5: Test Command Execution

The `LocalSandbox` lets CodeBuddy run shell commands. Try these:

1. "Run the calculator tests" — the agent should use `execute_command` to run `npx tsx calculator.test.ts`
1. "Write a new function called `power(base, exponent)` in calculator.ts and test it" — the agent should write code and then run it

Watch the tool calls — you'll see `execute_command` being called with the shell commands the agent decides to run.

### Step 6: Understand Sandbox Isolation

`LocalSandbox` runs commands directly on your machine — fine for development, but not for production. In production, you'd use:

- **E2BSandbox** — runs commands in isolated cloud VMs
- **DaytonaSandbox** — runs commands in isolated containers

On macOS, `LocalSandbox` uses Apple's `seatbelt` sandboxing to restrict what commands can access, adding a layer of protection even in development.

> **Think about it:** If your agent can execute arbitrary commands, what could go wrong? Think about `rm -rf /`, `curl malicious-url | bash`, or accessing environment variables with secrets. We'll add guardrails in Lab 03 to prevent these.

---

## Part 3: Skills — Reusable Agent Instructions

Workspaces support **skills** — reusable instruction packages that teach agents how to perform specific tasks. A skill is a folder with a `SKILL.md` file and optional `references/`, `scripts/`, and `assets/` directories. Skills follow the open [Agent Skills specification](https://agentskills.io).

When skills are configured on a workspace, the agent automatically gets three new tools:

- **`skill`** — loads a skill's full instructions into the conversation
- **`skill_read`** — reads files from a skill's `references/`, `scripts/`, or `assets/` directory
- **`skill_search`** — searches across all skill content

This is stateless — if skill instructions leave the context window, the agent can reload them by calling `skill` again.

### Step 7: Add skills to the workspace

The `workspace/` directory already includes a `skills/mastra/` folder containing the official Mastra framework skill. Take a look at the structure:

```plaintext
workspace/
  skills/
    mastra/
      SKILL.md              — Main instructions
      references/
        common-errors.md    — Error resolution guide
        create-mastra.md    — Project setup guide
        embedded-docs.md    — How to find docs in node_modules
        migration-guide.md  — Version upgrade workflows
        remote-docs.md      — How to fetch docs from mastra.ai
```

The `SKILL.md` file uses YAML frontmatter for metadata, followed by the instructions:

```markdown
---
name: mastra
description: "Comprehensive Mastra framework guide..."
version: "2.0.0"
---

# Mastra Framework Guide

Build AI applications with Mastra. This skill teaches you
how to find current documentation and build agents and workflows.
...
```

Update `src/mastra/workspace/workspace.ts` to enable skill discovery:

```typescript
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || './workspace';

export const workspace = new Workspace({
  id: 'codebuddy-workspace',
  filesystem: new LocalFilesystem({
    basePath: WORKSPACE_PATH,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: WORKSPACE_PATH,
  }),
  skills: ['/skills'],
});
```

The `skills: ['/skills']` tells the workspace to look for skill folders inside `workspace/skills/`. Each subfolder with a `SKILL.md` becomes an available skill.

### Step 8: Test skills

Restart the dev server and try in Studio:

- "What skills do you have available?" — the agent should list the Mastra skill
- "Load the mastra skill" — the agent calls the `skill` tool to load the full instructions
- "How do I create a Mastra agent? Use your skill to find the current API" — the agent uses the skill's guidance to look up embedded docs
- "Read the common-errors reference from the mastra skill" — the agent calls `skill_read`

> **Think about it:** Skills are like documentation that lives *inside* the agent's workspace. How is this different from just adding instructions to the agent's system prompt? Think about context window limits, on-demand loading, and reusability across agents.

### Where to find more skills

The [skills.sh](https://skills.sh) registry has thousands of community skills. Skills can be installed by copying the skill folder into your workspace's skills directory. Browse popular ones like `frontend-design`, `react-best-practices`, or `code-review`.

---

## Part 4: The Full Loop

### Step 9: End-to-End Coding Task

Now test the complete read-diagnose-fix-verify loop. Ask CodeBuddy:

"Read calculator.ts, find any bugs, fix them, and run the tests to verify."

The agent should:

1. Call `read_file` to read `calculator.ts`
1. Identify the bug in the `subtract` function (`a + b` instead of `a - b`)
1. Call `edit_file` or `write_file` to fix the bug
1. Call `execute_command` to run `npx tsx calculator.test.ts`
1. Report that all tests pass

This is the coding agent loop: **read** the code, **understand** the problem, **fix** it, **verify** the fix. Before Workspaces, you could only do step 1. Now CodeBuddy can do the full cycle.

> **Think about it:** The agent chose which tools to call and in what order — you didn't script it. What happens if the fix introduces a new bug? Would the agent notice from the test output and try again?

---

## What You Built

- A **Workspace** with `LocalFilesystem` (8 tools) and `LocalSandbox` (3 tools)
- Replaced a single manual `readFileTool` with a full filesystem and execution environment
- Added **Skills** — the Mastra skill gives CodeBuddy on-demand access to framework documentation via `skill`, `skill_read`, and `skill_search` tools
- CodeBuddy can now **read**, **write**, **edit**, **search**, **execute**, and **learn from skills**
- Completed the full coding loop: read → diagnose → fix → verify

In Lab 03, you'll add **guardrails and processors** to protect against dangerous commands, PII exposure, and secret leaks — because an agent that can execute commands needs safety rails.
