import { describe, it, expect, vi } from 'vitest';
import { runAgent } from '../agent.js';

describe('benchmark agent loop', () => {
  it('accumulates prompt + completion tokens across turns', async () => {
    let call = 0;
    const fakeOpenAI = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            call += 1;
            if (call === 1) {
              return {
                choices: [
                  {
                    message: {
                      content: null,
                      tool_calls: [
                        {
                          id: 't1',
                          type: 'function',
                          function: { name: 'read', arguments: '{"path":"x"}' },
                        },
                      ],
                    },
                  },
                ],
                usage: { prompt_tokens: 100, completion_tokens: 20 },
              };
            }
            return {
              choices: [{ message: { content: 'I am done — STOP-NOW' } }],
              usage: { prompt_tokens: 150, completion_tokens: 10 },
            };
          }),
        },
      },
    };

    const readFn = vi.fn(async () => 'file contents');
    const result = await runAgent({
      openai: fakeOpenAI as any,
      model: 'gpt-4o',
      tools: { read: readFn },
      toolSchemas: [
        {
          type: 'function',
          function: {
            name: 'read',
            description: 'r',
            parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
          },
        },
      ],
      messages: [{ role: 'user', content: 'do the thing' }],
      stopWhen: { containsAny: ['STOP-NOW'], orAfterTurns: 5 },
    });

    expect(result.promptTokens).toBe(250);
    expect(result.completionTokens).toBe(30);
    expect(result.turns).toBe(2);
    expect(readFn).toHaveBeenCalled();
  });

  it('stops after orAfterTurns even without stop string', async () => {
    const fakeOpenAI = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: 'still thinking...' } }],
            usage: { prompt_tokens: 50, completion_tokens: 10 },
          })),
        },
      },
    };
    const result = await runAgent({
      openai: fakeOpenAI as any,
      model: 'gpt-4o',
      tools: {},
      toolSchemas: [],
      messages: [{ role: 'user', content: 'go' }],
      stopWhen: { containsAny: ['NEVER'], orAfterTurns: 3 },
    });
    expect(result.turns).toBe(3);
  });

  it('handles unknown tool names without crashing', async () => {
    let call = 0;
    const fakeOpenAI = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            call += 1;
            if (call === 1) {
              return {
                choices: [
                  {
                    message: {
                      content: null,
                      tool_calls: [
                        { id: 'x', type: 'function', function: { name: 'nope', arguments: '{}' } },
                      ],
                    },
                  },
                ],
                usage: { prompt_tokens: 30, completion_tokens: 5 },
              };
            }
            return {
              choices: [{ message: { content: 'DONE' } }],
              usage: { prompt_tokens: 40, completion_tokens: 5 },
            };
          }),
        },
      },
    };
    const result = await runAgent({
      openai: fakeOpenAI as any,
      model: 'gpt-4o',
      tools: {},
      toolSchemas: [],
      messages: [{ role: 'user', content: 'go' }],
      stopWhen: { containsAny: ['DONE'], orAfterTurns: 5 },
    });
    expect(result.turns).toBeGreaterThanOrEqual(2);
    expect(result.promptTokens).toBe(70);
  });

  it('passes tool result back to the agent on next turn', async () => {
    let call = 0;
    const fakeOpenAI = {
      chat: {
        completions: {
          create: vi.fn(async (req: any) => {
            call += 1;
            if (call === 1) {
              return {
                choices: [
                  {
                    message: {
                      content: null,
                      tool_calls: [
                        { id: 't1', type: 'function', function: { name: 'echo', arguments: '{"v":"hi"}' } },
                      ],
                    },
                  },
                ],
                usage: { prompt_tokens: 50, completion_tokens: 10 },
              };
            }
            // The previous tool's result should be in the messages
            const lastMsg = req.messages[req.messages.length - 1];
            expect(lastMsg.role).toBe('tool');
            expect(lastMsg.content).toContain('hi');
            return {
              choices: [{ message: { content: 'got hi STOP' } }],
              usage: { prompt_tokens: 60, completion_tokens: 5 },
            };
          }),
        },
      },
    };
    const echoFn = vi.fn(async (args: { v: string }) => `echoed: ${args.v}`);
    await runAgent({
      openai: fakeOpenAI as any,
      model: 'gpt-4o',
      tools: { echo: echoFn },
      toolSchemas: [],
      messages: [{ role: 'user', content: 'go' }],
      stopWhen: { containsAny: ['STOP'], orAfterTurns: 5 },
    });
    expect(echoFn).toHaveBeenCalledWith({ v: 'hi' });
  });
});
