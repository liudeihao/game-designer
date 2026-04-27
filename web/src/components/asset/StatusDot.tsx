import { cn } from "@/lib/utils";

export function StatusDot({
  status,
  label,
}: {
  status: "pulse" | "done" | "fail";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          status === "pulse" && "animate-pulse bg-accent shadow-[0_0_6px_var(--accent)]",
          status === "done" && "bg-accent",
          status === "fail" && "bg-[#6b4a4a]"
        )}
      />
      <span className="text-ui-mono text-[11px] text-text-muted">{label}</span>
    </span>
  );
}
