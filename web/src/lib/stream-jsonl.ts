import type { StreamEvent } from "./types";

/**
 * Parses newline-delimited JSON events from SSE chunks.
 * Handles split UTF-8 across chunks by buffering incomplete lines.
 */
export function createStreamParser(onEvent: (ev: StreamEvent) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      if (!json) continue;
      try {
        const ev = JSON.parse(json) as StreamEvent;
        if (ev && typeof ev === "object" && "type" in ev) {
          onEvent(ev);
        }
      } catch {
        // ignore malformed
      }
    }
  };
}

export function flushStreamParser(parser: (chunk: string) => void) {
  parser("\n");
}
