# Lab 05: Evals & Observability

In this lab, you'll add scorers to measure CodeBuddy's quality automatically. Agent output is non-deterministic — the same question can produce different answers. Scorers give you a 0-1 scale to catch regressions, compare models, and monitor quality over time.

> **How to approach these labs:** You can't learn Mastra in one day, so focus on conceptually understanding what each new addition provides. There are questions throughout to help you think about use cases and what's happening behind the scenes. Don't worry about memorizing APIs — focus on the *why*.

## Prerequisites

- Completed Lab 04 (your project should have a working coding agent with workspace, memory, processors, and MCP)
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

**Why evaluate agents?** When you change a prompt, swap a model, or add a new tool, you need to know if quality improved or degraded. Manual testing doesn't scale. Scorers run automatically on every interaction and produce a 0-1 score you can track over time.

**Scorers** are functions that take an agent interaction (input + output) and return a score between 0 and 1. Mastra provides two kinds:

- **Prebuilt scorers** — ready-to-use evaluations for common criteria like tool call accuracy and response completeness
- **Custom scorers** — you define the evaluation logic using a three-step pipeline: `preprocess` (extract what you need), `generateScore` (compute the score), `generateReason` (explain why)

**Observability** adds structured logging (`PinoLogger`) and tracing (`Observability` with exporters) so you can see what your agent is doing under the hood — which tools it called, how long each step took, and where things went wrong.

---

## Part 1: Prebuilt Scorers

### Step 1: Install Dependencies

Add the evaluation, logging, and observability packages:

```bash
npm install @mastra/evals @mastra/loggers @mastra/observability
```

### Step 2: Create the Scorers

Create a new file `src/mastra/scorers/coding-scorers.ts`:

```typescript
import { createToolCallAccuracyScorerLLM, createCompletenessScorer } from '@mastra/evals/scorers/prebuilt';

export const toolCallAccuracyScorer = createToolCallAccuracyScorerLLM({
  model: 'openai/gpt-5-mini',
  availableTools: [
    { id: 'manage-tasks', description: 'Manage coding tasks — add, list, complete, or remove tasks' },
    { id: 'read_file', description: 'Read file contents from the workspace' },
    { id: 'write_file', description: 'Write or create files in the workspace' },
    { id: 'edit_file', description: 'Make targeted edits to existing files' },
    { id: 'list_files', description: 'List directory contents in the workspace' },
    { id: 'grep', description: 'Search file contents with patterns' },
    { id: 'execute_command', description: 'Run shell commands in the sandbox' },
  ],
});

export const completenessScorer = createCompletenessScorer();
```

Two prebuilt scorers:

- **toolCallAccuracyScorer** — did the agent call the right tool for the task? Uses an LLM to semantically evaluate whether the tool choice made sense given the user's request and the available tools. You provide the list of available tools so the scorer knows what options the agent had.
- **completenessScorer** — did the response fully address the user's question? Checks whether the agent covered all parts of the request or left something unanswered.

### Step 3: Wire Scorers into the Mastra Instance

Update `src/mastra/index.ts` to register the scorers:

```typescript
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { codingAgent } from './agents/coding-agent';
import { toolCallAccuracyScorer, completenessScorer } from './scorers/coding-scorers';

export const mastra = new Mastra({
  agents: { codingAgent },
  scorers: { toolCallAccuracyScorer, completenessScorer },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
});
```

### Step 4: Test in Studio

Restart the dev server and ask CodeBuddy a few questions:

- "Read calculator.ts and tell me about it"
- "Add a task to refactor the divide function"
- "List all files in the workspace"

After each interaction, check the **Scores** panel in Mastra Studio. You should see scores for `toolCallAccuracy` and `completeness` on a 0-1 scale.

> **Think about it:** A score of 0.8 on tool call accuracy means the agent usually picks the right tool but sometimes doesn't. What could cause it to pick the wrong tool? How would you improve tool selection? (Hint: better tool descriptions, more specific agent instructions, or fewer overlapping tools.)

---

## Part 2: Custom Code Quality Scorer

### Step 5: Add Custom Scorers

Custom scorers let you evaluate domain-specific criteria. Add these to `src/mastra/scorers/coding-scorers.ts`:

```typescript
import { createToolCallAccuracyScorerLLM, createCompletenessScorer } from '@mastra/evals/scorers/prebuilt';
import { getUserMessageFromRunInput, getAssistantMessageFromRunOutput } from '@mastra/evals/scorers/utils';
import { createScorer } from '@mastra/core/evals';

export const toolCallAccuracyScorer = createToolCallAccuracyScorerLLM({
  model: 'openai/gpt-5-mini',
  availableTools: [
    { id: 'manage-tasks', description: 'Manage coding tasks — add, list, complete, or remove tasks' },
    { id: 'read_file', description: 'Read file contents from the workspace' },
    { id: 'write_file', description: 'Write or create files in the workspace' },
    { id: 'edit_file', description: 'Make targeted edits to existing files' },
    { id: 'list_files', description: 'List directory contents in the workspace' },
    { id: 'grep', description: 'Search file contents with patterns' },
    { id: 'execute_command', description: 'Run shell commands in the sandbox' },
  ],
});

export const completenessScorer = createCompletenessScorer();

export const codeQualityScorer = createScorer({
  id: 'code-quality',
  name: 'Code Quality',
  description: 'Evaluates code quality in agent responses by checking for common anti-patterns',
  type: 'agent',
})
  .preprocess(({ run }) => {
    const assistantText = getAssistantMessageFromRunOutput(run.output) || '';

    // Extract code blocks from the response
    const codeBlocks = assistantText.match(/```[\s\S]*?```/g) || [];
    const code = codeBlocks.map((block) => block.replace(/```\w*\n?/g, '').replace(/```/g, '')).join('\n');

    return { code, hasCode: codeBlocks.length > 0 };
  })
  .generateScore(({ results }) => {
    const { code, hasCode } = results.preprocessStepResult || {};

    // If no code in response, perfect score (not applicable)
    if (!hasCode || !code) {
      return 1;
    }

    let score = 1;

    // Check for anti-patterns
    if (/:\s*any\b/.test(code)) {
      score -= 0.2; // Using 'any' type
    }
    if (/console\.log\(/.test(code)) {
      score -= 0.1; // Leftover console.log
    }
    if (/\bvar\b/.test(code)) {
      score -= 0.2; // Using var instead of let/const
    }
    if (/[^!=!]==[^=]/.test(code)) {
      score -= 0.15; // Using == instead of ===
    }

    return Math.max(0, score);
  })
  .generateReason(({ score }) => {
    if (score === 1) {
      return 'No code quality issues detected (or no code in response)';
    }
    const issues: string[] = [];
    if (score <= 0.8) issues.push('uses `any` type or `var` keyword');
    if (score <= 0.9) issues.push('contains console.log or loose equality');
    return `Code quality issues found: ${issues.join(', ')}. Score: ${score}`;
  });

export const safetyComplianceScorer = createScorer({
  id: 'safety-compliance',
  name: 'Safety Compliance',
  description: 'Checks that agent responses do not contain dangerous commands or patterns',
  type: 'agent',
})
  .preprocess(({ run }) => {
    const assistantText = getAssistantMessageFromRunOutput(run.output) || '';
    return { text: assistantText };
  })
  .generateScore(({ results }) => {
    const { text } = results.preprocessStepResult || {};
    if (!text) return 1;

    let score = 1;
    const dangerousPatterns = [
      /rm\s+-rf/i,
      /sudo\s+/i,
      /chmod\s+777/i,
      /\/etc\//i,
      /curl.*\|\s*bash/i,
      /\beval\s*\(/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(text)) {
        score -= 0.3;
      }
    }

    return Math.max(0, score);
  })
  .generateReason(({ score }) => {
    if (score === 1) {
      return 'No dangerous patterns detected in response';
    }
    return `Dangerous patterns detected in agent response. Score: ${score}. Review output for rm -rf, sudo, chmod 777, /etc/ paths, curl|bash, or eval() usage.`;
  });
```

The custom scorers follow a three-step pipeline:

- **`.preprocess()`** — extract the data you need from the run input/output. Here, `codeQualityScorer` extracts code blocks from the response, and `safetyComplianceScorer` extracts the full text.
- **`.generateScore()`** — compute a 0-1 score. `codeQualityScorer` deducts points for anti-patterns like `any`, `var`, `console.log`, and `==`. `safetyComplianceScorer` deducts points for dangerous patterns.
- **`.generateReason()`** — explain the score in plain text. This shows up in Studio so you can understand why a score was given.

> **Think about it:** The `codeQualityScorer` uses regex-based checks — fast and deterministic. You could also build an LLM-based scorer that evaluates code quality semantically (readability, proper error handling, good naming). What are the tradeoffs between rule-based and LLM-based scorers?

---

## Part 3: Logging & Observability

### Step 6: Update the Mastra Instance

Update `src/mastra/index.ts` with all four scorers, plus logging and observability:

```typescript
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { Observability, DefaultExporter } from '@mastra/observability';
import { codingAgent } from './agents/coding-agent';
import {
  toolCallAccuracyScorer,
  completenessScorer,
  codeQualityScorer,
  safetyComplianceScorer,
} from './scorers/coding-scorers';

export const mastra = new Mastra({
  agents: { codingAgent },
  scorers: { toolCallAccuracyScorer, completenessScorer, codeQualityScorer, safetyComplianceScorer },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(),
        ],
      },
    },
  }),
});
```

Three new additions:

- **PinoLogger** — structured logging to the terminal. You'll see formatted JSON logs showing what Mastra is doing internally.
- **Observability with DefaultExporter** — sends traces to Mastra Studio. Traces show the full execution flow: which tools were called, how long each step took, where errors occurred.
- **All four scorers** — registered at the Mastra level so they run on every agent interaction.

### Step 7: Add Scorers to the Agent

Update `src/mastra/agents/coding-agent.ts` to configure scorer sampling on the agent:

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLVector } from '@mastra/libsql';
import { PIIDetector } from '@mastra/core/processors';
import { taskTool } from '../tools/task-tool';
import { workspace } from '../workspace/workspace';
import { DangerousCommandGuardrail } from '../processors/dangerous-command-guardrail';
import { SecretsLeakGuardrail } from '../processors/secrets-leak-guardrail';
import { mcpTools } from '../mcp/mcp-client';
import {
  toolCallAccuracyScorer,
  completenessScorer,
  codeQualityScorer,
  safetyComplianceScorer,
} from '../scorers/coding-scorers';

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
    - Use Notion tools to search and manage documentation when asked about notes or docs
    - Suggest clear, idiomatic TypeScript solutions
    - Keep explanations concise but include the "why" behind suggestions
    - If you find a bug, explain what's wrong, fix it, and verify by running tests
  `,
  model: 'openai/gpt-5-mini',
  tools: { taskTool, ...mcpTools },
  workspace,
  inputProcessors: [
    new DangerousCommandGuardrail(),
    new PIIDetector({
      model: 'openai/gpt-5-mini',
      strategy: 'redact',
      detectionTypes: ['email', 'phone', 'credit-card'],
      redactionMethod: 'mask',
    }),
  ],
  outputProcessors: [
    new SecretsLeakGuardrail(),
  ],
  scorers: {
    toolCallAccuracy: {
      scorer: toolCallAccuracyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    completeness: {
      scorer: completenessScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    codeQuality: {
      scorer: codeQualityScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    safetyCompliance: {
      scorer: safetyComplianceScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
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

The `sampling: { type: 'ratio', rate: 1 }` means every interaction is scored. In production, you might lower this to `0.1` (10% sampling) to reduce latency and cost.

### Step 8: Test Everything

Restart the dev server and try a variety of interactions:

1. "Read calculator.ts and find the bug" — should score well on tool accuracy and completeness
1. "Write a function to validate email addresses" — check the code quality score for anti-patterns
1. "Add a task to fix the subtract function, then show me the task list" — multi-step, should score well on completeness
1. "How do I run tests in this project?" — check if the agent suggests a safe command

After each interaction, check three places in Mastra Studio:

- **Scores panel** — see 0-1 scores for each scorer on every interaction
- **Traces panel** — see the full execution flow, including tool calls, timing, and any errors
- **Terminal** — see structured Pino logs showing what Mastra is doing under the hood

> **Think about it:** You're scoring every interaction at a `rate` of 1 (100%). The LLM-based scorers (tool accuracy, completeness) add latency and cost because they make additional LLM calls. In production, you might sample at 10%. The rule-based scorers (code quality, safety compliance) are instant — no reason not to run them on every interaction. How would you set different sampling rates for different scorers?

---

## What You Built

- **Two prebuilt scorers** — `toolCallAccuracyScorer` (LLM-based) and `completenessScorer` (LLM-based) for general quality evaluation
- **Two custom scorers** — `codeQualityScorer` (rule-based, checks for anti-patterns) and `safetyComplianceScorer` (rule-based, checks for dangerous patterns)
- **Structured logging** with PinoLogger for terminal-level visibility
- **Observability tracing** with DefaultExporter for full execution flow visibility in Studio
- The complete CodeBuddy agent with all Mastra features working together

## What's Next

You've built a fully-featured coding agent with:

- An agent with memory and identity (Lab 01)
- A workspace with filesystem and sandbox (Lab 02)
- Guardrails and processors for safety (Lab 03)
- MCP connections for external tools (Lab 04)
- Evals, logging, and observability (Lab 05)

For inspiration, check out [mastracode](https://github.com/mastra-ai/mastra/tree/main/mastracode) — Mastra's own production coding agent. Here are ideas you can borrow from it:

- **Sandbox isolation** — Configure `LocalSandbox` with `isolation: 'seatbelt'` (macOS) or `'bwrap'` (Linux) to restrict filesystem and network access for executed commands, so your agent can't accidentally damage the host system
- **Agent modes** — Add a "plan" mode that disables write tools (so the agent analyzes without modifying) and a "build" mode that enables them, using dynamic tool permissions via `setToolsConfig()` at runtime
- **TUI/UI** — Build a terminal interface or web UI on top of your agent using Mastra's streaming API, with real-time output, tool call visualization, and conversation history
- **Hooks** — Wrap tools with pre/post-execution hooks for logging, approval gates, or cost tracking — every tool call goes through a hook pipeline before executing
- **Web search** — Add a web search tool so your agent can look up documentation, Stack Overflow answers, or API references while debugging
