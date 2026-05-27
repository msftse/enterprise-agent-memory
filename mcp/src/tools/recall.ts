import { z } from 'zod';
import type { ApiClient } from '../api.js';

export const RecallInput = z.object({
  query: z.string().min(1, 'query is required'),
  k: z.number().int().positive().max(50).optional(),
});

export interface RecallHit {
  id: string;
  title: string;
  content: string;
  score: number;
}

export function recallTool(api: ApiClient) {
  return async (raw: unknown): Promise<RecallHit[]> => {
    const { query, k = 5 } = RecallInput.parse(raw);
    const res = (await api.post('/api/v1/search', {
      query,
      limit: k,
      scope: 'memories',
    })) as {
      data: { results: Array<{ id: string; title: string; content: string; score: number }> };
    };
    return res.data.results.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      score: r.score,
    }));
  };
}
