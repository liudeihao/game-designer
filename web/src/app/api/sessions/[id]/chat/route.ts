import type { NextRequest } from "next/server";
import { appendMessage, getSession, setDrafts } from "@/server/mock-store";
import type { DraftAsset, StreamEvent } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function encodeSse(obj: StreamEvent) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(request: NextRequest, context: Ctx) {
  const { id: sessionId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  if (!getSession(sessionId) || !body.message?.trim()) {
    return new Response("Bad request", { status: 400 });
  }

  const userMsg = {
    id: "m-" + Math.random().toString(36).slice(2, 8),
    role: "user" as const,
    content: body.message,
    createdAt: new Date().toISOString(),
  };
  appendMessage(sessionId, userMsg);

  const events: StreamEvent[] = [
    { type: "text", delta: "正在提炼你的素材，" },
    { type: "text", delta: "请稍等。\n" },
    { type: "asset_start", id: "temp_stream_1" },
    { type: "asset_field", id: "temp_stream_1", field: "name", delta: "NEO-JUNK " },
    { type: "asset_field", id: "temp_stream_1", field: "name", delta: "PIECE" },
    {
      type: "asset_field",
      id: "temp_stream_1",
      field: "description",
      delta: "一块来自对话流的 junk 资产，",
    },
    { type: "asset_field", id: "temp_stream_1", field: "description", delta: "表面有像素灼痕。" },
    { type: "asset_end", id: "temp_stream_1" },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      for (const ev of events) {
        controller.enqueue(enc.encode(encodeSse(ev)));
        await new Promise((r) => setTimeout(r, 40));
      }
      const s = getSession(sessionId);
      if (s) {
        const draft: DraftAsset = {
          tempId: "temp_stream_1",
          name: "NEO-JUNK PIECE",
          description: "一块来自对话流的 junk 资产，表面有像素灼痕。",
          done: true,
        };
        setDrafts(sessionId, [...s.draftAssets.filter((d) => d.tempId !== draft.tempId), draft]);
        appendMessage(sessionId, {
          id: "m-a-" + Math.random().toString(36).slice(2, 6),
          role: "assistant",
          content: "已生成一条素材，可在右侧暂存区导出。",
          createdAt: new Date().toISOString(),
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
