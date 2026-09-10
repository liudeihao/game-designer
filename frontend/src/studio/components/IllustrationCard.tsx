import { useState } from "react";
import { api, formatApiError } from "../../api";
import type { IllustrationHome, IllustrationRecord } from "../../types/illustration";
import { illustrationImageUrl } from "../../types/illustration";
import { notifyIllustrationsChanged } from "../lib/illustrationEvents";
import { IllustrationHomeSelect } from "./IllustrationHomeSelect";

export function IllustrationCard({
  projectId,
  record,
  docPaths,
  onOpenFile,
  onChanged,
}: {
  projectId: string;
  record: IllustrationRecord;
  docPaths: string[];
  onOpenFile?: (path: string) => void;
  onChanged?: (next: IllustrationRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(record);

  const place = async (home: IllustrationHome, linkedDoc: string | null) => {
    setBusy(true);
    setError("");
    try {
      const next = await api.placeIllustration(projectId, current.id, {
        home,
        linked_doc: home === "doc" ? linkedDoc : null,
      });
      setCurrent(next);
      onChanged?.(next);
      notifyIllustrationsChanged();
    } catch (err) {
      setError(formatApiError(err, "无法改挂载"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl bg-muted/40 ring-1 ring-border/60">
      <img
        src={illustrationImageUrl(projectId, current.id)}
        alt=""
        className="max-h-72 w-full bg-muted object-contain"
      />
      <div className="space-y-2 px-3 py-2.5">
        {current.stale && (
          <p className="text-[12px] text-amber-700 dark:text-amber-400">文档已更新（未重画）</p>
        )}
        <p className="text-[13px] leading-relaxed text-foreground/90">{current.prompt}</p>
        {current.extras ? (
          <p className="text-[12px] text-muted-foreground">加料：{current.extras}</p>
        ) : null}
        {current.style_used ? (
          <p className="text-[12px] text-muted-foreground">已带项目风格</p>
        ) : (
          <p className="text-[12px] text-muted-foreground">未用项目风格</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted-foreground">落入</span>
          <IllustrationHomeSelect
            home={current.home}
            linkedDoc={current.linked_doc}
            docPaths={docPaths}
            disabled={busy}
            compact
            onChange={(home, linked) => void place(home, linked)}
          />
          {current.linked_doc && onOpenFile ? (
            <button
              type="button"
              className="text-[12px] text-primary hover:underline"
              onClick={() => onOpenFile(current.linked_doc!)}
            >
              {current.linked_doc}
            </button>
          ) : null}
        </div>
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
