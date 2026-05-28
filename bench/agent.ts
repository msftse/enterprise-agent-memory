// Minimal tool-calling agent loop driven by Azure OpenAI's chat completions API.
// Counts tokens via response.usage on each turn so the benchmark can produce
// honest "tokens to reach a useful answer" numbers per task.

export interface AgentOpts {
  openai: any; // an openai/AzureOpenAI client
  model: string;
  tools: Record<string, (args: any) => Promise<string>>;
  toolSchemas: any[];
  messages: any[];
  stopWhen: { containsAny: string[]; orAfterTurns: number };
}

export interface AgentResult {
  promptTokens: number;
  completionTokens: number;
  turns: number;
  finalMessage: string;
}

export async function runAgent(opts: AgentOpts): Promise<AgentResult> {
  const messages = [...opts.messages];
  let promptTokens = 0;
  let completionTokens = 0;
  let turns = 0;
  let finalMessage = '';

  while (turns < opts.stopWhen.orAfterTurns) {
    turns += 1;
    const res = await opts.openai.chat.completions.create({
      model: opts.model,
      messages,
      tools: opts.toolSchemas.length ? opts.toolSchemas : undefined,
      tool_choice: opts.toolSchemas.length ? 'auto' : undefined,
    });
    promptTokens += res.usage?.prompt_tokens ?? 0;
    completionTokens += res.usage?.completion_tokens ?? 0;

    const msg = res.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);

    const text = msg.content ?? '';
    if (text) finalMessage = text;

    if (text && opts.stopWhen.containsAny.some((s) => text.includes(s))) {
      break;
    }

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        const fn = opts.tools[tc.function.name];
        let toolResult: string;
        try {
          const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          toolResult = fn
            ? await fn(args)
            : `unknown tool: ${tc.function.name}`;
        } catch (e) {
          toolResult = `error: ${(e as Error).message}`;
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
      }
      continue;
    }
    // No tool calls and no stop string — let the loop run to orAfterTurns.
  }

  return { promptTokens, completionTokens, turns, finalMessage };
}
