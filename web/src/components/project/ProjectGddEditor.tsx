"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { patchProject } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ProjectGddEditor({
  projectId,
  initialMarkdown,
}: {
  projectId: string;
  initialMarkdown: string;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(initialMarkdown);
  const skipNextSave = useRef(true);
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setText(initialMarkdown);
    skipNextSave.current = true;
  }, [initialMarkdown]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          await patchProject(projectId, { designDocument: text });
          dirty.current = false;
          void qc.invalidateQueries({ queryKey: ["project", projectId] });
        } catch {
          /* ignore */
        }
      })();
    }, 750);
    return () => clearTimeout(t);
  }, [text, projectId, qc]);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border/60 bg-bg-base/50">
      <div className="shrink-0 border-b border-border/50 px-3 py-2">
        <h3 className="text-ui-mono text-xs uppercase tracking-wide text-text-muted">游戏设计文档</h3>
        <p className="text-ui-mono mt-0.5 text-xs leading-relaxed text-text-muted/85">
          Markdown。可与 AI 讨论同步整理；后续支持由 AI 直接更新本节。
        </p>
      </div>
      <textarea
        className={cn(
          "text-ui-mono gd-scrollbar min-h-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed text-text-primary",
          "placeholder:text-text-muted/50 focus:outline-none"
        )}
        placeholder="# 核心玩法&#10;&#10;- …"
        value={text}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
        }}
        spellCheck={false}
        aria-label="游戏设计文档 Markdown"
      />
    </div>
  );
}
