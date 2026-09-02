import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog as ShadDialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

export interface DialogConfig {
  title: string;
  message?: string;
  /** When set, an input field is shown (prompt mode). */
  inputLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  hideCancel?: boolean;
  danger?: boolean;
  onConfirm: (value: string) => void;
}

export function Dialog({ config, onClose }: { config: DialogConfig; onClose: () => void }) {
  const isPrompt = config.inputLabel !== undefined;
  const [value, setValue] = useState(config.defaultValue ?? "");

  useEffect(() => {
    setValue(config.defaultValue ?? "");
  }, [config.defaultValue, config.title]);

  const confirm = () => {
    config.onConfirm(value);
    onClose();
  };

  return (
    <ShadDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === "Enter" && (isPrompt ? (e.target as HTMLElement).tagName === "INPUT" : true)) {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          {config.message && <DialogDescription>{config.message}</DialogDescription>}
        </DialogHeader>

        {isPrompt && (
          <div className="grid gap-1.5">
            {config.inputLabel && (
              <label className="text-[14px] font-medium text-muted-foreground">
                {config.inputLabel}
              </label>
            )}
            <Input
              autoFocus
              value={value}
              placeholder={config.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}

        <DialogFooter>
          {!config.hideCancel && (
            <Button variant="outline" onClick={onClose}>
              {config.cancelLabel ?? "取消"}
            </Button>
          )}
          <Button variant={config.danger ? "destructive" : "default"} onClick={confirm}>
            {config.confirmLabel ?? "确定"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </ShadDialog>
  );
}
