"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

type Tone = "default" | "danger";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  tone = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className={cn(
            "text-ui-mono fixed left-1/2 top-1/2 z-[101] w-[min(100%,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-bg-base p-5 shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out"
          )}
        >
          <Dialog.Title className="font-display text-lg text-text-primary">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-text-muted">
              {description}
            </Dialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-[12px] text-text-muted hover:text-text-primary"
              >
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={cn(
                "rounded px-3 py-1.5 text-[12px]",
                tone === "danger"
                  ? "border border-error-dim/40 bg-error-dim/20 text-text-primary hover:bg-error-dim/30"
                  : "border border-accent/50 bg-accent/15 text-accent hover:bg-accent/25"
              )}
              onClick={() => {
                void (async () => {
                  try {
                    await onConfirm();
                    onOpenChange(false);
                  } catch {
                    /* keep open or toast */
                  }
                })();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
