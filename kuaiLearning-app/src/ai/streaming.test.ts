import { describe, expect, it, vi } from 'vitest';
import { readChatCompletionStream } from './streaming';

function streamFrom(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      parts.forEach(part => controller.enqueue(encoder.encode(part)));
      controller.close();
    },
  });
}

describe('readChatCompletionStream', () => {
  it('rejects server errors rather than saving partial lessons', async () => {
    await expect(readChatCompletionStream(streamFrom([
      'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
      'data: {"error":{"message":"AI response reached the output limit"}}\n\n',
    ]), undefined, true)).rejects.toThrow('output limit');
  });

  it('requires a completion marker for server streams', async () => {
    await expect(readChatCompletionStream(streamFrom([
      'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
    ]), undefined, true)).rejects.toThrow('before completion');
  });
  it('preserves an SSE event split across network chunks', async () => {
    const onChunk = vi.fn();
    const stream = streamFrom([
      'data: {"choices":[{"delta":{"content":"hel',
      'lo"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    await expect(readChatCompletionStream(stream, onChunk)).resolves.toBe('hello world');
    expect(onChunk).toHaveBeenNthCalledWith(1, 'hello');
    expect(onChunk).toHaveBeenNthCalledWith(2, ' world');
  });

  it('supports CRLF and a final event without a newline', async () => {
    const stream = streamFrom([
      'event: message\r\ndata: {"choices":[{"delta":{"content":"A"}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"B"}}]}',
    ]);

    await expect(readChatCompletionStream(stream)).resolves.toBe('AB');
  });

  it('skips malformed events without losing later valid content', async () => {
    const stream = streamFrom([
      'data: not-json\n\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    ]);

    await expect(readChatCompletionStream(stream)).resolves.toBe('ok');
  });
});
