"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeSelect({
  value,
  onValueChange,
  options,
  placeholder = "选择…",
  id: _id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  disabled = false,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  disabled?: boolean;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={_id}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          disabled={disabled}
          className={cn(
            "text-ui-mono flex w-full max-w-xs items-center justify-between gap-2 rounded border border-border/60 bg-surface/60 px-3 py-2 text-left text-[13px] text-text-primary outline-none",
            "hover:border-accent/30 focus:border-accent/50",
            disabled && "cursor-not-allowed opacity-50 hover:border-border/60",
            className
          )}
        >
          <span className="min-w-0 truncate">{current?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="text-ui-mono z-[80] min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(100vw-2rem,24rem)] rounded-md border border-border bg-bg-base p-1 shadow-lg"
          sideOffset={4}
          align="start"
        >
          {options.map((o) => (
            <DropdownMenu.Item
              key={o.label + String(o.value)}
              className={cn(
                "cursor-pointer rounded px-2 py-1.5 text-[13px] outline-none",
                "hover:bg-white/5 focus:bg-white/5 data-[highlighted]:bg-white/5",
                o.value === value && "text-accent"
              )}
              onSelect={() => onValueChange(o.value)}
            >
              {o.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
