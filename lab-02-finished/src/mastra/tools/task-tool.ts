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
