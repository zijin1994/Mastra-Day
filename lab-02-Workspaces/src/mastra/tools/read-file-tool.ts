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
