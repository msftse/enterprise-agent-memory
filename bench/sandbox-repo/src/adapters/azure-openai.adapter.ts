import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import '@azure/openai';
import { getConfig } from '../config/azure.config.js';

export class AzureOpenAIAdapter {
  private client: AzureOpenAI | null = null;
  private available = true;

  private getClient(): AzureOpenAI {
    if (!this.client) {
      const config = getConfig();

      if (!config.AZURE_OPENAI_ENDPOINT && !config.AZURE_OPENAI_API_KEY) {
        this.available = false;
        throw new Error('Azure OpenAI not configured — set AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY');
      }

      if (config.AZURE_OPENAI_API_KEY) {
        this.client = new AzureOpenAI({
          endpoint: config.AZURE_OPENAI_ENDPOINT ?? '',
          apiKey: config.AZURE_OPENAI_API_KEY,
          apiVersion: config.AZURE_OPENAI_API_VERSION,
        });
      } else {
        const credential = new DefaultAzureCredential();
        const scope = 'https://cognitiveservices.azure.com/.default';
        const tokenProvider = getBearerTokenProvider(credential, scope);
        this.client = new AzureOpenAI({
          endpoint: config.AZURE_OPENAI_ENDPOINT!,
          azureADTokenProvider: tokenProvider,
          apiVersion: config.AZURE_OPENAI_API_VERSION,
        });
      }
    }
    return this.client;
  }

  get isAvailable(): boolean {
    if (this.available) {
      const config = getConfig();
      this.available = !!(config.AZURE_OPENAI_ENDPOINT || config.AZURE_OPENAI_API_KEY);
    }
    return this.available;
  }

  async embed(text: string): Promise<number[]> {
    const config = getConfig();
    const client = this.getClient();
    const response = await client.embeddings.create({
      model: config.AZURE_OPENAI_DEPLOYMENT_EMBEDDING,
      input: [text],
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const config = getConfig();
    const client = this.getClient();

    // Azure OpenAI has input limits per request; chunk into batches of 16
    const batchSize = 16;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await client.embeddings.create({
        model: config.AZURE_OPENAI_DEPLOYMENT_EMBEDDING,
        input: batch,
      });
      for (const item of response.data) {
        allEmbeddings.push(item.embedding);
      }
    }

    return allEmbeddings;
  }

  async compress(systemPrompt: string, userContent: string): Promise<string> {
    const config = getConfig();
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: config.AZURE_OPENAI_DEPLOYMENT_CHAT,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  // Phase 2: like compress(), but returns usage tokens for savings instrumentation.
  // Uses JSON response_format so the result is parseable upstream.
  async compressWithUsage(
    systemPrompt: string,
    userContent: string,
  ): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
    const config = getConfig();
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: config.AZURE_OPENAI_DEPLOYMENT_CHAT,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    });
    return {
      content: response.choices[0]?.message?.content ?? '',
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    };
  }

  async summarize(systemPrompt: string, content: string): Promise<string> {
    const config = getConfig();
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: config.AZURE_OPENAI_DEPLOYMENT_CHAT,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: content },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async extractGraphEntities(
    text: string,
  ): Promise<{
    nodes: Array<{ type: string; name: string }>;
    edges: Array<{ type: string; source: string; target: string }>;
  }> {
    const config = getConfig();
    const client = this.getClient();

    const systemPrompt = `You are a knowledge graph extraction engine for a coding agent's memory system.
Given a text about coding activity, extract entities (nodes) and relationships (edges).
Return a JSON object with this exact structure:
{
  "nodes": [{ "type": "<entity_type>", "name": "<entity_name>" }],
  "edges": [{ "type": "<relationship_type>", "source": "<source_name>", "target": "<target_name>" }]
}
Entity types: file, function, concept, error, decision, pattern, library, person, project, preference, location, organization, event.
Relationship types: uses, imports, modifies, causes, fixes, depends_on, related_to, works_at, prefers, blocked_by, caused_by, optimizes_for, rejected, avoids, located_in, succeeded_by.
- Use the exact names above. If uncertain about type, use "concept" for nodes and "related_to" for edges.
- For files, include the full path as the name.
- For functions, include just the function name.
- Extract only clearly mentioned entities — do not infer speculative ones.
Return ONLY valid JSON with no markdown or extra text.`;

    const response = await client.chat.completions.create({
      model: config.AZURE_OPENAI_DEPLOYMENT_CHAT,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{"nodes":[],"edges":[]}';
    try {
      return JSON.parse(raw) as {
        nodes: Array<{ type: string; name: string }>;
        edges: Array<{ type: string; source: string; target: string }>;
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  async healthCheck(): Promise<{ status: string; model: string }> {
    const config = getConfig();
    try {
      const client = this.getClient();
      await client.chat.completions.create({
        model: config.AZURE_OPENAI_DEPLOYMENT_CHAT,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return { status: 'healthy', model: config.AZURE_OPENAI_DEPLOYMENT_CHAT };
    } catch {
      return { status: 'unhealthy', model: config.AZURE_OPENAI_DEPLOYMENT_CHAT };
    }
  }
}
