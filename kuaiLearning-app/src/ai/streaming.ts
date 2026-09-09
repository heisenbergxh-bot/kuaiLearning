type StreamCallback = (chunk: string) => void;

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string } }>;
  error?: { message?: string };
}

// Network chunks do not necessarily align with SSE lines, so unfinished lines
// must be retained until the next read instead of being discarded.
export async function readChatCompletionStream(
  stream: ReadableStream<Uint8Array>,
  onChunk?: StreamCallback,
  requireDone = false,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let fullContent = '';
  let completed = false;

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trimStart();
    if (!data) return;
    if (data === '[DONE]') { completed = true; return; }

    let parsed: ChatCompletionChunk;
    try {
      parsed = JSON.parse(data) as ChatCompletionChunk;
    } catch {
      // Ignore malformed events while continuing to consume the stream.
      return;
    }
    if (parsed.error) throw new Error(parsed.error.message || 'AI generation failed');
    const content = parsed.choices?.[0]?.delta?.content;
    if (content) {
      fullContent += content;
      onChunk?.(content);
    }
  };

  try {
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
    if (requireDone && !completed) throw new Error('AI response stream ended before completion');
    return fullContent;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
