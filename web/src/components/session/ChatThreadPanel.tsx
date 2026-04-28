"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { patchSession, postChatStream } from "@/lib/api";
import { createStreamParser } from "@/lib/stream-jsonl";
import type { SessionDetail, StreamEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ThemeSelect } from "@/components/ui/ThemeSelect";
import { WorkspaceVerticalSplit } from "@/components/shell/WorkspaceVerticalSplit";
import { Settings2 } from "lucide-react";

type Props = {
  sessionId: string;
  session: SessionDetail;
  refetch: () => Promise<unknown>;
  showStagingGroupMenu: boolean;
  stagingGroups: { id: string; name: string }[];
  composerPlaceholder: string;
  /** Additional TanStack Query keys to invalidate after chat (e.g. project sessions list). */
  invalidateExtra?: { queryKey: readonly unknown[] }[];
  /** Parent can track streaming (e.g. empty-session discard guard). */
  onStreamingChange?: (streaming: boolean) => void;
};

export function ChatThreadPanel({
  sessionId,
  session: s,
  refetch,
  showStagingGroupMenu,
  stagingGroups,
  composerPlaceholder,
  invalidateExtra,
  onStreamingChange,
}: Props) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [textBuf, setTextBuf] = useState("");
  const [groupSelectBusy, setGroupSelectBusy] = useState(false);

  const onEvent = useCallback((ev: StreamEvent) => {
    if (ev.type === "text") {
      setTextBuf((t) => t + ev.delta);
    }
  }, []);

  const messages = s.messages ?? [];

  const runInvalidate = useCallback(async () => {
    await refetch();
    void qc.invalidateQueries({ queryKey: ["session", sessionId] });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    for (const x of invalidateExtra ?? []) {
      void qc.invalidateQueries(x);
    }
  }, [invalidateExtra, qc, refetch, sessionId]);

  const sessionChatSplit = (
    <WorkspaceVerticalSplit
      storageKey={`layout:chat-composer:${sessionId}`}
      topDefaultSize={68}
      bottomDefaultSize={32}
      topMinSize={28}
      bottomMinSize={18}
      className="min-h-0 min-w-0 flex-1"
      topClassName="min-h-0 min-w-0"
      bottomClassName="min-h-0 min-w-0"
      top={
        <div className="flex h-full min-h-0 flex-col">
          <div className="gd-scrollbar min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white/[0.02] to-transparent">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-3 sm:px-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("flex w-full", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[min(90%,20rem)] shadow-md sm:max-w-md",
                      "rounded-2xl px-3.5 py-2.5 text-[14px] leading-[1.65] [word-break:break-word] whitespace-pre-wrap",
                      m.role === "user"
                        ? "rounded-tr-md border border-accent/35 bg-gradient-to-br from-accent/20 to-accent/[0.08] text-text-primary"
                        : "rounded-tl-md border border-border/80 bg-surface/90 text-text-primary/95 shadow-black/5 backdrop-blur-sm"
                    )}
                  >
                    {m.role === "assistant" && (
                      <p className="text-ui-mono mb-1 text-[9px] uppercase tracking-widest text-text-muted/80">
                        AI
                      </p>
                    )}
                    <p className={cn(m.role === "user" ? "text-inter" : "text-ui-mono")}>{m.content}</p>
                  </div>
                </div>
              ))}
              {streaming && (
                <div className="flex w-full justify-start">
                  <div className="max-w-[min(90%,20rem)] rounded-2xl rounded-tl-md border border-dashed border-accent/25 bg-surface/60 px-3.5 py-2.5 text-[14px] leading-[1.65] text-text-primary/90 shadow-md backdrop-blur-sm sm:max-w-md">
                    <p className="text-ui-mono mb-1 text-[9px] uppercase tracking-widest text-text-muted/70">
                      AI
                    </p>
                    <p className="text-ui-mono [word-break:break-word] whitespace-pre-wrap">
                      {textBuf}
                      <span
                        className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-accent align-middle"
                        aria-hidden
                      />
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      }
      bottom={
        <div className="box-border flex h-full min-h-0 flex-col border-t border-border/60 bg-bg-base/40 px-3 py-2">
          <form
            className="flex min-h-[3.25rem] flex-1 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!input.trim() || streaming) return;
              setStreaming(true);
              onStreamingChange?.(true);
              setTextBuf("");
              try {
                const res = await postChatStream(sessionId, input);
                if (!res.ok) throw new Error("chat");
                const reader = res.body?.getReader();
                if (!reader) {
                  await runInvalidate();
                  return;
                }
                const dec = new TextDecoder();
                const feed = createStreamParser(onEvent);
                for (;;) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  feed(dec.decode(value, { stream: true }));
                }
                setInput("");
                await runInvalidate();
              } catch {
                void refetch();
              } finally {
                setStreaming(false);
                onStreamingChange?.(false);
                setTextBuf("");
                void qc.invalidateQueries({ queryKey: ["sessions"] });
              }
            }}
          >
            <textarea
              className="text-ui-mono box-border max-h-none min-h-12 w-0 min-w-0 flex-1 resize-none overflow-y-auto border-b border-accent/40 bg-transparent text-sm text-text-primary outline-none focus:border-accent"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={composerPlaceholder}
              rows={1}
              aria-label="聊天输入"
            />
            <button
              type="submit"
              className="gd-btn-dataflow text-ui-mono shrink-0 self-end rounded border border-border px-3 py-1 text-sm hover:border-accent/40"
              disabled={streaming}
            >
              发送
            </button>
          </form>
        </div>
      }
    />
  );

  return (
    <div className="relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 px-2 pb-1 pt-2">
        <div className="flex items-center justify-center gap-1.5">
          <p className="text-ui-mono min-w-0 flex-1 text-center text-[11px] text-text-muted/70">{s.title}</p>
          {showStagingGroupMenu && (
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="text-ui-mono shrink-0 rounded border border-border/50 bg-surface/40 p-1 text-text-muted hover:border-accent/30 hover:text-text-primary"
                  title="侧栏分组归类"
                  aria-label="侧栏分组归类"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="text-ui-mono z-[100] min-w-[14rem] rounded-md border border-border bg-bg-base p-3 shadow-lg"
                  sideOffset={6}
                  align="end"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">所属分组</p>
                  <ThemeSelect
                    id={`sg-${sessionId}`}
                    aria-label="会话分组"
                    className="mt-1.5 max-w-none text-[12px]"
                    disabled={groupSelectBusy}
                    value={s.stagingGroup?.id ?? ""}
                    options={[
                      { value: "", label: s.stagingGroup ? "无（移出分组）" : "无" },
                      ...stagingGroups.map((g) => ({ value: g.id, label: g.name })),
                    ]}
                    onValueChange={async (v) => {
                      setGroupSelectBusy(true);
                      try {
                        await patchSession(sessionId, { stagingGroupId: v === "" ? null : v });
                        await runInvalidate();
                        void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                        void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts"] });
                      } catch {
                        // ignore
                      } finally {
                        setGroupSelectBusy(false);
                      }
                    }}
                  />
                  <p className="mt-2 text-[10px] leading-relaxed text-text-muted/80">
                    {s.stagingGroup
                      ? "仅影响侧栏列表位置。分组的名称与暂存模式请从侧栏进入该分组页管理。"
                      : "未分组时，右侧暂存仅含本会话。加入分组不改变聊天与暂存操作方式。"}
                  </p>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </div>
      {sessionChatSplit}
    </div>
  );
}
