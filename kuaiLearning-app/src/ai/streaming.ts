type StreamCallback = (chunk: string) => void;

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

// Network chunks do not necessarily align with SSE lines, so unfinished lines
// must be retained until the next read instead of being discarded.
export async function readChatCompletionStream(
  stream: ReadableStream<Uint8Array>,
  onChunk?: StreamCallback,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let fullContent = '';

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trimStart();
    if (!data || data === '[DONE]') return;

    try {
      const parsed = JSON.parse(data) as ChatCompletionChunk;
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) {
        fullContent += content;
        onChunk?.(content);
      }
    } catch {
      // Ignore malformed events while continuing to consume the stream.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    lines.forEach(processLine);
  }

  pending += decoder.decode();
  if (pending) processLine(pending);
  return fullContent;
}
