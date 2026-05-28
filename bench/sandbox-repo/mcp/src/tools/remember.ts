import { z } from 'zod';
import type { ApiClient } from '../api.js';

const MEMORY_TYPES = ['pattern', 'preference', 'architecture', 'bug', 'workflow', 'fact'] as const;

export const RememberInput = z.object({
  content: z.string().min(1, 'content is required'),
  type: z.enum(MEMORY_TYPES).optional(),
  title: z.string().optional(),
  concepts: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
});

export type RememberArgs = z.infer<typeof RememberInput>;

export interface RememberResult {
  memoryId: string;
  title: string;
  createdAt: string;
}

function deriveTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length <= 80) return firstLine;
  return firstLine.slice(0, 77) + '...';
}

export function rememberTool(api: ApiClient) {
  return async (raw: unknown): Promise<RememberResult> => {
    const args = RememberInput.parse(raw);
    const body = {
      type: args.type ?? 'fact',
      title: args.title ?? deriveTitle(args.content),
      content: args.content,
      concepts: args.concepts,
      files: args.files,
    };
    const res = (await api.post('/api/v1/memories', body)) as {
      data: { id: string; title: string; createdAt: string };
    };
    return {
      memoryId: res.data.id,
      title: res.data.title,
      createdAt: res.data.createdAt,
    };
  };
}
