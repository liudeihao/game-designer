import { cn } from "@/lib/utils";

/** Shown when the server API could not be reached or returned a server error (RSC or client). */

export function BackendUnavailable({ title, detail }: { title?: string; detail?: string }) {
  return (
    <div className="border border-border/50 bg-surface/50 px-4 py-6 text-center">
      <p className="text-ui-mono text-sm text-text-primary">{title ?? "无法连接到服务"}</p>
      <p className="text-ui-mono mt-2 text-xs text-text-muted">
        {detail ?? "请确认本机后端已启动，或稍后再试。页面不会向用户展示技术错误信息。"}
      </p>
    </div>
  );
}

export function BackendBanner({ message, className }: { message?: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-ui-mono border-b border-error-dim/30 bg-error-dim/10 px-4 py-2 text-center text-xs text-text-primary/90",
        className
      )}
    >
      {message ?? "当前无法连上后端，以下列表可能为空或已过期。"}
    </div>
  );
}
