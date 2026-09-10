import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../api";
import type { ImageCatalogEntry, ImageModelSpec, ImageProviderDraft } from "../types/image";
import { asImageModel, emptyImageModel } from "../types/image";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

function newDraft(): ImageProviderDraft {
  return {
    id: `prov_${Math.random().toString(36).slice(2, 12)}`,
    label: "",
    base_url: "",
    api_key: "",
    api_key_set: false,
    models: [],
  };
}

function ImageProviderDialog({
  open,
  draft,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  draft: ImageProviderDraft | null;
  onClose: () => void;
  onSave: (draft: ImageProviderDraft) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<ImageProviderDraft | null>(null);
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    if (open && draft) {
      setForm({ ...draft, models: draft.models.map((m) => ({ ...m })) });
      setCustomModel("");
    }
  }, [open, draft]);

  if (!form) return null;

  const patch = (partial: Partial<ImageProviderDraft>) =>
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));

  const addModel = (id: string) => {
    const mid = id.trim();
    if (!mid || form.models.some((m) => m.id === mid)) return;
    patch({ models: [...form.models, emptyImageModel(mid)] });
  };

  const removeModel = (id: string) => {
    patch({ models: form.models.filter((m) => m.id !== id) });
  };

  const canSave = form.base_url.trim().length > 0 && (form.api_key_set || form.api_key.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft && (draft.api_key_set || draft.models.length > 0 || draft.label.trim())
              ? "编辑生图服务商"
              : "添加生图服务商"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium text-muted-foreground">备注名</label>
            <Input value={form.label} placeholder="可选" onChange={(e) => patch({ label: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium text-muted-foreground">Base URL</label>
            <Input
              value={form.base_url}
              placeholder="https://api.openai.com/v1"
              onChange={(e) => patch({ base_url: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium text-muted-foreground">
              API Key{" "}
              {form.api_key_set && !form.api_key && (
                <Badge variant="default" className="ml-1 align-middle">
                  已设置
                </Badge>
              )}
            </label>
            <Input
              type="password"
              value={form.api_key}
              placeholder={form.api_key_set ? "留空则保持原 Key" : "sk-..."}
              onChange={(e) => patch({ api_key: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium text-muted-foreground">模型</label>
            <p className="text-[13px] text-muted-foreground">填写生图模型 ID，例如 gpt-image-1、dall-e-3。</p>
            {form.models.length > 0 && (
              <div className="space-y-1.5">
                {form.models.map((spec) => (
                  <div key={spec.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{spec.id}</span>
                    <button
                      type="button"
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/12 hover:text-destructive"
                      aria-label={`移除 ${spec.id}`}
                      onClick={() => removeModel(spec.id)}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className={cn("flex gap-2", form.models.length > 0 && "mt-2")}>
              <Input
                value={customModel}
                placeholder="模型 ID"
                onChange={(e) => setCustomModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addModel(customModel);
                    setCustomModel("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  addModel(customModel);
                  setCustomModel("");
                }}
              >
                添加
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button disabled={saving || !canSave} onClick={() => void onSave(form)}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ImageSettingsSection({ onSaved }: { onSaved?: () => void }) {
  const [providers, setProviders] = useState<ImageProviderDraft[]>([]);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [editDraft, setEditDraft] = useState<ImageProviderDraft | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    api.getConfig().then((c) => {
      const image = c.image;
      if (!image) return;
      setProviders(
        (image.providers ?? []).map((p) => ({
          id: p.id,
          label: p.label,
          base_url: p.base_url,
          api_key: "",
          api_key_set: p.api_key_set,
          models: (p.models ?? []).map(asImageModel).filter((m): m is ImageModelSpec => m != null),
        })),
      );
      setActiveProviderId(image.active_provider_id || "");
      setModel(image.model || "");
    });
  }, []);

  const catalog: ImageCatalogEntry[] = useMemo(() => {
    const entries: ImageCatalogEntry[] = [];
    for (const p of providers) {
      const label = p.label.trim() || "未命名";
      for (const spec of p.models) {
        entries.push({
          key: `${p.id}::${spec.id}`,
          provider_id: p.id,
          model: spec.id,
          label,
        });
      }
    }
    return entries;
  }, [providers]);

  const activeKey = activeProviderId && model ? `${activeProviderId}::${model}` : "";
  const activeEntry = catalog.find((e) => e.key === activeKey);

  const persist = async (
    nextProviders: ImageProviderDraft[],
    nextActiveId = activeProviderId,
    nextModel = model,
  ) => {
    setSaving(true);
    try {
      const saved = await api.updateConfig({
        image: {
          providers: nextProviders.map((p) => ({
            id: p.id,
            label: p.label.trim(),
            base_url: p.base_url.trim(),
            api_key: p.api_key || undefined,
            models: p.models.map((m) => ({ id: m.id, label: m.label })),
          })),
          active_provider_id: nextActiveId,
          model: nextModel,
        },
      });
      const returned = (saved.image?.providers ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        base_url: p.base_url,
        api_key: "",
        api_key_set: p.api_key_set,
        models: (p.models ?? []).map(asImageModel).filter((m): m is ImageModelSpec => m != null),
      }));
      setProviders(returned.length > 0 ? returned : nextProviders.map((p) => ({
        ...p,
        api_key: "",
        api_key_set: p.api_key_set || !!p.api_key,
      })));
      setActiveProviderId(nextActiveId);
      setModel(nextModel);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const selectMain = async (key: string) => {
    const entry = catalog.find((e) => e.key === key);
    if (!entry) return;
    setActiveProviderId(entry.provider_id);
    setModel(entry.model);
    await persist(providers, entry.provider_id, entry.model);
  };

  const saveDialog = async (draft: ImageProviderDraft) => {
    const exists = providers.some((p) => p.id === draft.id);
    const next = exists ? providers.map((p) => (p.id === draft.id ? draft : p)) : [...providers, draft];
    let nextActive = activeProviderId;
    let nextModel = model;
    const stillActive = next.some((p) => p.id === nextActive && p.models.some((m) => m.id === nextModel));
    if (!stillActive) {
      nextActive = "";
      nextModel = "";
    }
    await persist(next, nextActive, nextModel);
    setDialogOpen(false);
    setEditDraft(null);
  };

  const removeProvider = async (id: string) => {
    const next = providers.filter((p) => p.id !== id);
    let nextActive = activeProviderId;
    let nextModel = model;
    if (activeProviderId === id) {
      nextActive = "";
      nextModel = "";
    }
    await persist(next, nextActive, nextModel);
  };

  return (
    <section id="settings-image-models" className="scroll-mt-8 border-t border-border/40 pt-10">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">图像模型</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            与文字模型分开配置。未配置时不能生成概念插画。
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditDraft(newDraft());
            setDialogOpen(true);
          }}
          disabled={saving}
        >
          <Plus className="size-3.5" />
          添加服务商
        </Button>
      </header>

      <div className="mb-5 space-y-2">
        {providers.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-center text-[14px] text-muted-foreground">
            尚未配置生图服务商。需要兼容 OpenAI Images 的接口。
          </div>
        )}
        {providers.map((p) => (
          <div key={p.id} className="flex items-start gap-3 rounded-lg bg-muted/40 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[15px] font-semibold">{p.label.trim() || "未命名服务商"}</span>
                <Badge variant={p.api_key_set ? "success" : "warning"}>
                  {p.api_key_set ? "Key 已配置" : "缺少 Key"}
                </Badge>
              </div>
              <div className="mt-1 truncate font-mono text-[12px] text-muted-foreground">
                {p.base_url || "（未设置 Base URL）"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.models.length === 0 ? (
                  <span className="text-[12px] text-muted-foreground">暂无模型</span>
                ) : (
                  p.models.map((m) => (
                    <Badge key={m.id} variant="secondary" className="font-mono font-normal">
                      {m.id}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="编辑"
                onClick={() => {
                  setEditDraft({ ...p, api_key: "", models: p.models.map((m) => ({ ...m })) });
                  setDialogOpen(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive"
                aria-label="删除"
                disabled={saving}
                onClick={() => void removeProvider(p.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-2 space-y-1.5">
        <label className="block text-[14px] font-medium text-muted-foreground">当前生图模型</label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={saving || catalog.length === 0}
              className={cn(
                "box-border flex h-10 w-full items-center justify-between gap-2 rounded-md border border-solid border-input/70 bg-muted/30 px-3 text-left text-[15px] leading-5 text-foreground",
                "hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <span className={cn("min-w-0 truncate", !activeEntry && "text-muted-foreground")}>
                {catalog.length === 0
                  ? "暂无模型"
                  : activeEntry
                    ? `${activeEntry.model} — ${activeEntry.label}`
                    : "选择模型…"}
              </span>
              <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
            {catalog.map((e) => {
              const active = e.key === activeKey;
              return (
                <DropdownMenuItem
                  key={e.key}
                  className={cn("flex items-start justify-between gap-2 py-2", active && "bg-primary/10")}
                  onSelect={() => void selectMain(e.key)}
                >
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="truncate font-mono text-[14px]">{e.model}</span>
                    {e.label && e.label !== e.model && (
                      <span className="truncate text-[13px] text-muted-foreground">{e.label}</span>
                    )}
                  </span>
                  {active && <Check className="size-3.5 shrink-0 text-primary" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-[14px] text-muted-foreground">
          使用兼容 OpenAI `/v1/images/generations` 的接口。
          {saving ? " · 正在保存…" : ""}
        </p>
      </div>

      <ImageProviderDialog
        open={dialogOpen}
        draft={editDraft}
        saving={saving}
        onClose={() => {
          setDialogOpen(false);
          setEditDraft(null);
        }}
        onSave={saveDialog}
      />
    </section>
  );
}
