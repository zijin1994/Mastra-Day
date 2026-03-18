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
