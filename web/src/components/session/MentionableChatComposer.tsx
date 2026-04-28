"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProjectLinkedAsset } from "@/lib/types";
import {
  formatAssetMentionToken,
  expandAssetMentionsForApi,
  getActiveMentionQuery,
} from "@/lib/chatMentions";

type Props = {
  disabled: boolean;
  placeholder: string;
  mentionAssets: ProjectLinkedAsset[];
  onSend: (messageForApi: string) => Promise<void>;
};

export function MentionableChatComposer({ disabled, placeholder, mentionAssets, onSend }: Props) {
  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  const filtered = mentionAssets.filter((a) => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    );
  });

  const syncPickerFromInput = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? 0;
    const mq = getActiveMentionQuery(input, caret);
    if (mq) {
      setMentionStart(mq.start);
      setMentionQuery(mq.query);
      setPickerOpen(true);
      setHighlight(0);
      const r = ta.getBoundingClientRect();
      setPickerPos({
        top: r.bottom + 4,
        left: r.left,
        width: Math.min(320, Math.max(r.width, 240)),
      });
    } else {
      setPickerOpen(false);
      setMentionStart(null);
      setMentionQuery("");
    }
  }, [input]);

  const insertMention = useCallback(
    (asset: ProjectLinkedAsset) => {
      const ta = taRef.current;
      if (!ta || mentionStart === null) return;
      const caret = ta.selectionStart ?? input.length;
      const token = formatAssetMentionToken(asset);
      const next = input.slice(0, mentionStart) + token + input.slice(caret);
      setInput(next);
      setPickerOpen(false);
      setMentionStart(null);
      setMentionQuery("");
      const pos = mentionStart + token.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [input, mentionStart]
  );

  useEffect(() => {
    if (!pickerOpen || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, pickerOpen, filtered.length]);

  return (
    <>
      <form
        className="flex min-h-[3.25rem] flex-1 gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const raw = input.trim();
          if (!raw || disabled) return;
          const forApi = expandAssetMentionsForApi(raw, mentionAssets);
          await onSend(forApi);
          setInput("");
        }}
      >
        <textarea
          ref={taRef}
          className="text-ui-mono box-border max-h-none min-h-12 w-0 min-w-0 flex-1 resize-none overflow-y-auto border-b border-accent/40 bg-transparent text-sm text-text-primary outline-none focus:border-accent"
          value={input}
          disabled={disabled}
          onChange={(e) => {
            setInput(e.target.value);
            requestAnimationFrame(() => syncPickerFromInput());
          }}
          onKeyDown={(e) => {
            if (pickerOpen && mentionAssets.length > 0 && filtered.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                insertMention(filtered[highlight]!);
                return;
              }
            }
            if (e.key === "Escape" && pickerOpen) {
              e.preventDefault();
              setPickerOpen(false);
              return;
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          onClick={syncPickerFromInput}
          onSelect={syncPickerFromInput}
          placeholder={placeholder}
          rows={1}
          aria-label="聊天输入"
        />
        <button
          type="submit"
          className="gd-btn-dataflow text-ui-mono shrink-0 self-end rounded border border-border px-3 py-1 text-sm hover:border-accent/40"
          disabled={disabled}
        >
          发送
        </button>
      </form>

      {pickerOpen && pickerPos ? (
        <ul
          ref={listRef}
          id="gd-chat-mention-list"
          role="listbox"
          aria-label="引用素材"
          className={cn(
            "text-ui-mono fixed z-[300] max-h-52 overflow-y-auto rounded-lg border border-border bg-bg-base py-1 shadow-xl",
            "gd-scrollbar"
          )}
          style={{
            top: pickerPos.top,
            left: pickerPos.left,
            width: pickerPos.width,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {mentionAssets.length === 0 ? (
            <li className="px-3 py-2 text-xs leading-relaxed text-text-muted">
              暂无引用素材。请先到左侧「引用素材」标签从「我的库」添加。
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-text-muted">没有匹配的素材</li>
          ) : (
            filtered.map((a, idx) => {
              const ch = [...a.name.trim()][0] ?? "?";
              return (
                <li key={a.id} role="option" aria-selected={idx === highlight}>
                  <button
                    type="button"
                    data-idx={idx}
                    className={cn(
                      "flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs outline-none",
                      idx === highlight ? "bg-accent/15 text-text-primary" : "text-text-primary/90"
                    )}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => insertMention(a)}
                  >
                    {a.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.coverImageUrl}
                        alt=""
                        className="mt-0.5 h-8 w-8 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent/15 text-[11px] font-medium text-accent">
                        {ch}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 font-medium">{a.name}</span>
                      {a.description.trim() ? (
                        <span className="mt-0.5 line-clamp-1 text-[11px] text-text-muted">
                          {a.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </>
  );
}
