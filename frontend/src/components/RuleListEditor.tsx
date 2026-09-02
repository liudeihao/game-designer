import { Plus, Trash2 } from "lucide-react";
import type { RuleItem } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export function newRuleItem(): RuleItem {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return { id: `r_${raw.slice(0, 12)}`, name: "", details: "" };
}

export function validateRuleItems(rules: RuleItem[]): string {
  const names = rules.map((item) => item.name.trim());
  if (names.some((name) => !name)) return "每条 Rule 都需要名称";
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) return `Rule 名称重复：${name}`;
    seen.add(name);
  }
  return "";
}

export function RuleListEditor({
  rules,
  warn,
  saving,
  error,
  onChange,
  onSave,
}: {
  rules: RuleItem[];
  warn: boolean;
  saving: boolean;
  error?: string;
  onChange: (rules: RuleItem[]) => void;
  onSave: () => void;
}) {
  const update = (id: string, patch: Partial<RuleItem>) => {
    onChange(rules.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-3">
      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-[13px] text-muted-foreground">
          还没有 Rule
        </p>
      ) : (
        <ul className="space-y-3">
          {rules.map((item, index) => (
            <li key={item.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  className="h-8 text-[13px]"
                  value={item.name}
                  placeholder="名称，例如：先问再写"
                  aria-label={`Rule ${index + 1} 名称`}
                  onChange={(e) => update(item.id, { name: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`删除 Rule ${item.name || index + 1}`}
                  onClick={() => onChange(rules.filter((row) => row.id !== item.id))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <Textarea
                className="min-h-[88px] text-[13px]"
                value={item.details}
                placeholder="详情：跨对话仍应遵守的工作约定"
                aria-label={`Rule ${item.name || index + 1} 详情`}
                onChange={(e) => update(item.id, { details: e.target.value })}
              />
            </li>
          ))}
        </ul>
      )}
      {warn ? (
        <p className="text-[13px] text-amber-600 dark:text-amber-400">
          这些 Rule 合计已经较长，仍会全部注入 Context，请尽量写短。
        </p>
      ) : null}
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rules, newRuleItem()])}
        >
          <Plus className="size-3.5" />
          添加 Rule
        </Button>
        <Button disabled={saving} onClick={onSave}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
