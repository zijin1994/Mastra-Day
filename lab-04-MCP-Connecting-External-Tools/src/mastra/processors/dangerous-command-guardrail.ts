import type { Processor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

const classifierSchema = z.object({
  isDangerous: z.boolean().describe('true if the user is asking the agent to do something destructive or unsafe'),
  dangerType: z.enum([
    'destructive-command',
    'path-traversal',
    'system-modification',
    'network-download',
    'safe',
  ]).describe('The type of danger detected'),
});

const classifierAgent = new Agent({
  id: 'danger-classifier',
  name: 'Danger Classifier',
  model: 'openai/gpt-5-mini',
  instructions: `You analyze user messages for a coding assistant that has filesystem access and command execution.
Determine if the message asks the agent to do something dangerous:
- destructive-command: rm -rf, drop tables, format disk, kill processes, force-push
- path-traversal: accessing files outside the workspace (../../etc/passwd, /root, /etc)
- system-modification: changing system configs, installing global packages, modifying PATH
- network-download: curl/wget executables, downloading and running scripts from the internet
- safe: normal coding tasks, reading/writing workspace files, running tests`,
});

export class DangerousCommandGuardrail implements Processor {
  id = 'dangerous-command-guardrail';

  async processInput({ messages, abort }: ProcessInputArgs): Promise<ProcessInputResult> {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return messages;
    }

    const text = lastMessage.content.parts
      ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ');

    if (!text) {
      return messages;
    }

    const response = await classifierAgent.generate(text, {
      structuredOutput: { schema: classifierSchema },
    });

    if (response.object?.isDangerous && response.object?.dangerType !== 'safe') {
      abort(`Request blocked: detected ${response.object.dangerType}. CodeBuddy cannot perform destructive operations, access files outside the workspace, modify system configurations, or download executables.`);
    }

    return messages;
  }
}
