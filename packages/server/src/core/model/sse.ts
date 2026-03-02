const normalizeLineEndings = (raw: string): string => raw.replace(/\r\n?/g, "\n");

const extractSseData = (rawEvent: string): string | undefined => {
  if (!rawEvent.trim()) {
    return undefined;
  }

  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return undefined;
  }

  return dataLines.join("\n");
};

export async function* streamSseData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = normalizeLineEndings(buffer);

      let eventBoundary = buffer.indexOf("\n\n");
      while (eventBoundary !== -1) {
        const rawEvent = buffer.slice(0, eventBoundary);
        buffer = buffer.slice(eventBoundary + 2);

        const data = extractSseData(rawEvent);
        if (typeof data === "string") {
          yield data;
        }

        eventBoundary = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode();
    buffer = normalizeLineEndings(buffer);
    const trailingData = extractSseData(buffer);
    if (typeof trailingData === "string") {
      yield trailingData;
    }
  } finally {
    reader.releaseLock();
  }
}
