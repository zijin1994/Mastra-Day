import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLVector } from '@mastra/libsql';
import { PIIDetector } from '@mastra/core/processors';
import { taskTool } from '../tools/task-tool';
import { workspace } from '../workspace/workspace';
import { DangerousCommandGuardrail } from '../processors/dangerous-command-guardrail';
import { SecretsLeakGuardrail } from '../processors/secrets-leak-guardrail';

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
  inputProcessors: [
    new DangerousCommandGuardrail(),
    new PIIDetector({
      model: 'openai/gpt-5-mini',
      strategy: 'redact',
      detectionTypes: ['email', 'phone', 'credit-card'],
      redactionMethod: 'mask',
    }),
  ],
  outputProcessors: [new SecretsLeakGuardrail()],
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
