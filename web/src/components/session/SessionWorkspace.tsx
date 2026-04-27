"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { getSession, postChatStream, exportDraftsToLibrary } from "@/lib/api";
import { createStreamParser } from "@/lib/stream-jsonl";
import type { SessionDetail, StreamEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AssetCard } from "../asset/AssetCard";
import { motion } from "framer-motion";

export function SessionWorkspace({ id, initial }: { id: string; initial: SessionDetail }) {
  const qc = useQueryClient();
  const { data: session = initial, refetch } = useQuery({
    queryKey: ["session", id],
    queryFn: () => getSession(id) as Promise<SessionDetail | null>,
    initialData: initial,
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lineBuf, setLineBuf] = useState<Record<string, { name: string; desc: string }>>({});
  const [textBuf, setTextBuf] = useState("");
  const streamRef = useRef("");

  const onEvent = useCallback(
    (ev: StreamEvent) => {
      if (ev.type === "text") {
        setTextBuf((t) => t + ev.delta);
        return;
      }
      if (ev.type === "asset_start") {
        setLineBuf((b) => ({ ...b, [ev.id]: { name: "", desc: "" } }));
        return;
      }
      if (ev.type === "asset_field") {
        setLineBuf((b) => {
          const cur = b[ev.id] || { name: "", desc: "" };
          if (ev.field === "name") {
            return { ...b, [ev.id]: { ...cur, name: cur.name + ev.delta } };
          }
          return { ...b, [ev.id]: { ...cur, desc: cur.desc + ev.delta } };
        });
        return;
      }
      if (ev.type === "asset_end") {
        return;
      }
    },
    [setLineBuf, setTextBuf]
  );

  if (!session) return <p className="p-6 text-text-muted">未找到会话</p>;

  return (
    <div className="grid h-[calc(100vh-0px)] grid-cols-1 gap-0 lg:grid-cols-[58%_42%]">
      <div className="flex min-h-0 flex-col border-r border-divider">
        <p className="text-ui-mono shrink-0 p-2 text-center text-[11px] text-text-muted/70">{session.title}</p>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2 [scrollbar-width:thin]">
          {session.messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                m.role === "user" ? "ml-auto max-w-[70%] rounded bg-white/[0.04] p-2 text-right text-sm" : "max-w-[85%] text-left text-sm text-text-primary/95"
              )}
            >
              {m.role === "user" ? (
                <p className="text-inter text-[14px]">{m.content}</p>
              ) : (
                <p className="text-ui-mono text-[14px] leading-[1.8]">{m.content}</p>
              )}
            </div>
          ))}
          {streaming && (
            <div className="text-ui-mono max-w-[85%] text-left text-sm leading-[1.8] text-text-primary/80">
              {textBuf}
            </div>
          )}
          {Object.entries(lineBuf).map(([k, v]) => (
            <motion.div
              key={k}
              initial={{ x: -8, opacity: 0.8 }}
              animate={{ x: 0, opacity: 1 }}
              className="max-w-[80%] border border-border/60 bg-surface/80 p-2"
            >
              <p className="font-display text-base text-text-primary">{v.name || "…"}</p>
              <p className="text-[12px] text-text-muted">{v.desc || "…"}</p>
            </motion.div>
          ))}
        </div>
        <div className="h-20 border-t border-border px-3 py-2">
          <form
            className="flex h-full items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!input.trim() || streaming) return;
              setStreaming(true);
              setTextBuf("");
              setLineBuf({});
              try {
                const res = await postChatStream(id, input);
                if (!res.ok) throw new Error("chat");
                const reader = res.body?.getReader();
                if (!reader) return;
                const dec = new TextDecoder();
                const feed = createStreamParser(onEvent);
                for (;;) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  feed(dec.decode(value, { stream: true }));
                }
                setInput("");
                void refetch();
                await qc.invalidateQueries({ queryKey: ["session", id] });
              } catch {
                // ignore
              } finally {
                setStreaming(false);
                setTextBuf("");
                setLineBuf({});
                streamRef.current = "";
                void refetch();
              }
            }}
          >
            <textarea
              className="text-ui-mono h-14 min-h-0 flex-1 resize-none border-b border-accent/40 bg-transparent text-sm text-text-primary outline-none focus:border-accent"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="描述你想要的素材，例如：赛博朋克风格废弃加油站"
            />
            <button
              type="submit"
              className="text-ui-mono mb-0.5 rounded border border-border px-3 py-1 text-sm hover:border-accent/40"
              disabled={streaming}
            >
              发送
            </button>
          </form>
        </div>
      </div>
      <aside className="min-h-0 border-l border-divider p-3 lg:border-l-0">
        <div className="flex items-center justify-between">
          <h2 className="text-ui-mono text-[11px] uppercase text-text-muted">暂存</h2>
          <button
            type="button"
            className="text-ui-mono text-[11px] text-accent"
            onClick={async () => {
              await exportDraftsToLibrary(session.draftAssets);
              void qc.invalidateQueries({ queryKey: ["assets"] });
            }}
          >
            全部导出
          </button>
        </div>
        {session.draftAssets.length > 0 && (
            <motion.ul className="mt-3 space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {session.draftAssets.map((d) => (
                <li key={d.tempId}>
                  <AssetCard
                    variant="compact"
                    href="#"
                    asset={{
                      id: d.tempId,
                      name: d.name,
                      description: d.description,
                      annotation: null,
                      authorId: "user-1",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      visibility: "private",
                      forkedFromId: null,
                      forkCount: 0,
                      images: [],
                      coverImageId: null,
                      deletedAt: null,
                    }}
                  />
                </li>
              ))}
            </motion.ul>
          )}
        {session.draftAssets.length === 0 && (
          <p className="text-ui-mono mt-4 text-center text-[12px] text-text-muted">与 AI 对话后，素材会出现在这里</p>
        )}
      </aside>
    </div>
  );
}
