import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type {
  RawObservation,
  CompressedObservation,
  ObservationType,
} from '../types/models.js';

const COMPRESSION_PROMPT = `You are an expert at compressing agent observations into structured, searchable memory entries.
Given a raw observation from an AI coding agent, extract:
1. A concise title (max 80 chars)
2. An optional subtitle with more detail
3. Key facts as an array of strings
4. A brief narrative (2-3 sentences)
5. Relevant concepts (programming concepts, libraries, patterns)
6. Files mentioned or affected
7. Importance score (0-10, where 10 is critical)
8. The observation type

Respond in JSON format:
{
  "title": "...",
  "subtitle": "...",
  "facts": ["..."],
  "narrative": "...",
  "concepts": ["..."],
  "files": ["..."],
  "importance": 7,
  "type": "file_read"
}`;

export async function compressObservation(
  raw: RawObservation,
  openai: AzureOpenAIAdapter,
): Promise<Omit<CompressedObservation, 'embedding'>> {
  const userContent = JSON.stringify({
    hookType: raw.hookType,
    toolName: raw.toolName,
    toolInput: raw.toolInput,
    toolOutput:
      typeof raw.toolOutput === 'string'
        ? raw.toolOutput.slice(0, 4000)
        : raw.toolOutput,
    userPrompt: raw.userPrompt,
    assistantResponse: raw.assistantResponse?.slice(0, 2000),
  });

  const result = await openai.compress(COMPRESSION_PROMPT, userContent);

  let parsed: any;
  try {
    parsed = JSON.parse(result);
  } catch {
    // Fallback if LLM doesn't return valid JSON
    parsed = {
      title: `${raw.hookType}: ${raw.toolName ?? 'unknown'}`,
      facts: [],
      narrative: result.slice(0, 500),
      concepts: [],
      files: [],
      importance: 5,
      type: 'other',
    };
  }

  return {
    id: raw.id,
    tenantId: raw.tenantId,
    sessionId: raw.sessionId,
    timestamp: raw.timestamp,
    type: (parsed.type as ObservationType) ?? 'other',
    title: parsed.title ?? '',
    subtitle: parsed.subtitle,
    facts: parsed.facts ?? [],
    narrative: parsed.narrative ?? '',
    concepts: parsed.concepts ?? [],
    files: parsed.files ?? [],
    importance: Math.min(10, Math.max(0, parsed.importance ?? 5)),
    confidence: parsed.confidence,
  };
}
