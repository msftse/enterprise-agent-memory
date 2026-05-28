import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';

const MEMORY_TYPES = ['pattern', 'preference', 'architecture', 'bug', 'workflow', 'fact'] as const;
type MemoryType = (typeof MEMORY_TYPES)[number];

const EXTRACTION_PROMPT = `You are a memory extractor for an AI coding agent.
Given raw text from the agent (a fact, decision, or context to remember), produce a structured memory.

Extract:
- title (max 80 chars, summarizing the memory)
- content (a normalized rephrasing of the raw text, keeping the key facts intact)
- concepts (programming or domain concepts mentioned; empty array if none)
- files (file paths mentioned; empty array if none)
- type (one of: pattern, preference, architecture, bug, workflow, fact)

Respond with valid JSON only, no markdown:
{ "title": "...", "content": "...", "concepts": [...], "files": [...], "type": "fact" }`;

export interface MemoryCompressionResult {
  title: string;
  content: string;
  concepts: string[];
  files: string[];
  type: MemoryType;
  sourceTokens: number;
  compressedTokens: number;
}

function isMemoryType(v: unknown): v is MemoryType {
  return typeof v === 'string' && (MEMORY_TYPES as readonly string[]).includes(v);
}

export async function compressMemoryInput(
  rawText: string,
  openai: AzureOpenAIAdapter,
): Promise<MemoryCompressionResult> {
  const { content, promptTokens, completionTokens } = await openai.compressWithUsage(
    EXTRACTION_PROMPT,
    rawText,
  );

  let parsed: any = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      title: rawText.split('\n')[0].slice(0, 80),
      content: rawText,
      concepts: [],
      files: [],
      type: 'fact',
      sourceTokens: promptTokens,
      compressedTokens: completionTokens,
    };
  }

  return {
    title: typeof parsed.title === 'string' && parsed.title ? parsed.title.slice(0, 80) : rawText.slice(0, 80),
    content: typeof parsed.content === 'string' && parsed.content ? parsed.content : rawText,
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts.filter((c: unknown) => typeof c === 'string') : [],
    files: Array.isArray(parsed.files) ? parsed.files.filter((f: unknown) => typeof f === 'string') : [],
    type: isMemoryType(parsed.type) ? parsed.type : 'fact',
    sourceTokens: promptTokens,
    compressedTokens: completionTokens,
  };
}
