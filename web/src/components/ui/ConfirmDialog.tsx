"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "danger";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  /** Extra body below description (e.g. success link). */
  children,
  confirmLabel = "确定",
  /** Shown on the confirm button while `onConfirm` is running */
  pendingLabel = "处理中…",
  cancelLabel = "取消",
  /** When `close-only`, only a dismiss button is shown (no confirm/cancel). */
  footer = "default",
  closeOnlyLabel = "关闭",
  /** When false, a resolved `onConfirm` does not close the dialog (parent can switch to result UI). */
  closeOnSuccess = true,
  tone = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  footer?: "default" | "close-only";
  closeOnlyLabel?: string;
  closeOnSuccess?: boolean;
  tone?: Tone;
  onConfirm: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setSubmitting(false);
  }, [open]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className={cn(
            "text-ui-mono fixed left-1/2 top-1/2 z-[101] w-[min(100%,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-bg-base p-5 shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out"
          )}
          aria-busy={submitting}
        >
          <Dialog.Title className="font-display text-lg text-text-primary">{title}</Dialog.Title>
          {description !== undefined && description !== "" && (
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-text-muted">
              {description}
            </Dialog.Description>
          )}
          {children != null && children !== false && (
            <div className="mt-3 text-sm leading-relaxed text-text-muted">{children}</div>
          )}
          {submitting && footer === "default" && (
            <p className="mt-3 text-xs text-accent" role="status">
              请稍候，正在处理…
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            {footer === "close-only" ? (
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-xs text-text-primary hover:border-accent/40"
                onClick={() => onOpenChange(false)}
              >
                {closeOnlyLabel}
              </button>
            ) : (
              <>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={submitting}
                    className="rounded border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cancelLabel}
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  disabled={submitting}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60",
                    tone === "danger"
                      ? "border border-error-dim/40 bg-error-dim/20 text-text-primary hover:bg-error-dim/30"
                      : "gd-btn-dataflow border border-accent/50 bg-accent/15 text-accent hover:bg-accent/25"
                  )}
                  onClick={() => {
                    if (submitting) return;
                    void (async () => {
                      setSubmitting(true);
                      try {
                        await onConfirm();
                        if (closeOnSuccess) onOpenChange(false);
                      } catch {
                        /* keep open or toast */
                      } finally {
                        setSubmitting(false);
                      }
                    })();
                  }}
                >
                  {submitting ? pendingLabel : confirmLabel}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
