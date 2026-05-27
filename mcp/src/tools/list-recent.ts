import { z } from 'zod';
import type { ApiClient } from '../api.js';

export const ListRecentInput = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

export interface RecentMemory {
  id: string;
  title: string;
  type: string;
  createdAt: string;
}

export function listRecentTool(api: ApiClient) {
  return async (raw: unknown): Promise<RecentMemory[]> => {
    const { limit = 10 } = ListRecentInput.parse(raw);
    const qs = `limit=${limit}&sortBy=createdAt&sortOrder=desc`;
    const res = (await api.get(`/api/v1/memories?${qs}`)) as {
      data: { items: Array<{ id: string; title: string; type: string; createdAt: string }> };
    };
    return res.data.items.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      createdAt: m.createdAt,
    }));
  };
}
