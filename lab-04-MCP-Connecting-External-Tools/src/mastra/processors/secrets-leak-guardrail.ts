import type { Processor } from '@mastra/core/processors';

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/g,                          // AWS Access Key
  /(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]+/g, // Stripe keys
  /ghp_[a-zA-Z0-9]{36}/g,                        // GitHub PAT
  /sk-[a-zA-Z0-9]{20,}/g,                        // OpenAI keys
  /(?:postgresql|mysql|mongodb):\/\/[^\s]+/g,     // Connection strings
];

export class SecretsLeakGuardrail implements Processor {
  id = 'secrets-leak-guardrail';

  async processOutputStream({ part }: { part: { type: string; textDelta?: string; [key: string]: unknown } }) {
    if (part.type === 'text-delta' && part.textDelta) {
      let text = part.textDelta;
      let redacted = false;

      for (const pattern of SECRET_PATTERNS) {
        const newText = text.replace(pattern, '[REDACTED]');
        if (newText !== text) {
          text = newText;
          redacted = true;
        }
      }

      if (redacted) {
        console.warn('[SecretsLeakGuardrail] Redacted potential secrets from agent response');
        return { ...part, textDelta: text };
      }
    }
    return part;
  }
}

