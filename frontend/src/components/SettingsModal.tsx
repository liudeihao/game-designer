import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, formatApiError } from "../api";
import type { RuleItem } from "../types";
import type { LLMCatalogEntry, ModelSpec, ProviderDraft } from "../types/llm";
import { asModelSpec, emptyModelSpec } from "../types/llm";
import { savePanelFollowMode, type PanelFollowMode } from "../studio/panelFollow";
import {
  loadShowInternalToolTraces,
  saveShowInternalToolTraces,
} from "../studio/traceVisibility";
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
import { RuleListEditor, validateRuleItems } from "./RuleListEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface Props {
  panelFollowMode: PanelFollowMode;
  onPanelFollowModeChange: (mode: PanelFollowMode) => void;
  onSaved?: () => void;
}

function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4 space-y-1.5">
      <label className="block text-[14px] font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[14px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OptionCard({
  active,
  title,
  hint,
  children,
}: {
  active: boolean;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-wrap items-start gap-2 rounded-lg px-3 py-2.5 transition-colors duration-150",
        active ? "bg-primary/12 ring-1 ring-primary/40" : "bg-muted/40 hover:bg-muted/70",
      )}
    >
      {children}
      <span className="text-[15px] font-medium">{title}</span>
      <span className="w-full pl-5 text-[14px] text-muted-foreground">{hint}</span>
    </label>
  );
}

/** Shared「工作区」settings body (settings page + studio popup). */
export function WorkspaceSettingsSection({
  followMode,
  onFollowModeChange,
  showInternalToolTraces,
  onShowInternalToolTracesChange,
  saving,
  onSave,
  showHeader = true,
}: {
  followMode: PanelFollowMode;
  onFollowModeChange: (mode: PanelFollowMode) => void;
  showInternalToolTraces: boolean;
  onShowInternalToolTracesChange: (show: boolean) => void;
  saving?: boolean;
  onSave: () => void;
  showHeader?: boolean;
}) {
  return (
    <div>
      {showHeader && (
        <header className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">工作区</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            控制 Agent 编辑模块时右侧面板的跟随行为，以及聊天里展示哪些工具过程。
          </p>
        </header>
      )}
      <Field label="当 Agent 正在编辑某个模块时，右侧面板如何响应">
        <div className="space-y-1.5">
          {(
            [
              ["follow", "自动跳转", "切换到对应 Tab 并展示最新内容"],
              ["highlight", "仅高亮", "保持当前 Tab，在对应 Tab 上闪烁提示"],
              ["off", "关闭", "不自动跳转或高亮"],
            ] as const
          ).map(([value, label, hint]) => (
            <OptionCard key={value} active={followMode === value} title={label} hint={hint}>
              <input
                type="radio"
                name="panelFollow"
                className="mt-1"
                checked={followMode === value}
                onChange={() => onFollowModeChange(value)}
              />
            </OptionCard>
          ))}
        </div>
      </Field>
      <Field
        label="工具过程展示"
        hint="默认展示每一次工具调用；Compact 等内部机制始终隐藏。"
      >
        <OptionCard
          active={showInternalToolTraces}
          title="显示查阅类工具"
          hint="关闭后只保留派发、提案与写入卡片，隐藏 workspace_list / workspace_read / conversation_get_summary"
        >
          <input
            type="checkbox"
            className="mt-1"
            checked={showInternalToolTraces}
            onChange={(e) => onShowInternalToolTracesChange(e.target.checked)}
          />
        </OptionCard>
      </Field>
      <div className="flex justify-end pt-2">
        <Button disabled={saving} onClick={onSave}>
          {saving ? "保存中…" : "保存工作区设置"}
        </Button>
      </div>
    </div>
  );
}

/** Studio top-bar settings: workspace options + Project Rule. */
export function WorkspaceSettingsDialog({
  open,
  onOpenChange,
  panelFollowMode,
  onPanelFollowModeChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelFollowMode: PanelFollowMode;
  onPanelFollowModeChange: (mode: PanelFollowMode) => void;
  projectId?: string;
}) {
  const [followMode, setFollowMode] = useState<PanelFollowMode>(panelFollowMode);
  const [showInternalTools, setShowInternalTools] = useState(loadShowInternalToolTraces);
  const [saving, setSaving] = useState(false);
  const [projectRules, setProjectRules] = useState<RuleItem[]>([]);
  const [projectRuleWarn, setProjectRuleWarn] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleError, setRuleError] = useState("");

  useEffect(() => {
    if (open) {
      setFollowMode(panelFollowMode);
      setShowInternalTools(loadShowInternalToolTraces());
      setRuleError("");
      if (projectId) {
        api.getProjectRule(projectId).then((d) => {
          setProjectRules(d.rules || []);
          setProjectRuleWarn(d.warn);
        }).catch(() => {
          setProjectRules([]);
          setProjectRuleWarn(false);
        });
      }
    }
  }, [open, panelFollowMode, projectId]);

  const save = () => {
    setSaving(true);
    try {
      savePanelFollowMode(followMode);
      onPanelFollowModeChange(followMode);
      saveShowInternalToolTraces(showInternalTools);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const saveProjectRule = async () => {
    if (!projectId) return;
    const invalid = validateRuleItems(projectRules);
    if (invalid) {
      setRuleError(invalid);
      return;
    }
    setSavingRule(true);
    setRuleError("");
    try {
      const saved = await api.saveProjectRule(projectId, projectRules);
      setProjectRules(saved.rules || []);
      setProjectRuleWarn(saved.warn);
    } catch (err) {
      setRuleError(formatApiError(err, "保存 Project Rule 失败"));
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>工作区设置</DialogTitle>
          <DialogDescription>
            本项目的 Project Rule，以及右侧面板与工具过程展示。
          </DialogDescription>
        </DialogHeader>
        {projectId ? (
          <div className="border-b border-border/40 pb-5">
            <h3 className="mb-1 text-[15px] font-semibold">Project Rule</h3>
            <p className="mb-3 text-[13px] text-muted-foreground">
              只对本项目生效。每条有名称与详情，不是设计文档；删项目会一起清掉。
            </p>
            <RuleListEditor
              rules={projectRules}
              warn={projectRuleWarn}
              saving={savingRule}
              error={ruleError}
              onChange={(next) => {
                setProjectRules(next);
                setProjectRuleWarn(false);
                setRuleError("");
              }}
              onSave={() => void saveProjectRule()}
            />
          </div>
        ) : null}
        <WorkspaceSettingsSection
          showHeader={false}
          followMode={followMode}
          onFollowModeChange={setFollowMode}
          showInternalToolTraces={showInternalTools}
          onShowInternalToolTracesChange={setShowInternalTools}
          saving={saving}
          onSave={save}
        />
      </DialogContent>
    </Dialog>
  );
}

function newDraft(): ProviderDraft {
  return {
    id: `prov_${Math.random().toString(36).slice(2, 12)}`,
    label: "",
    base_url: "",
    api_key: "",
    api_key_set: false,
    models: [],
  };
}

function ProviderDialog({
  open,
  draft,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  draft: ProviderDraft | null;
  onClose: () => void;
  onSave: (draft: ProviderDraft) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<ProviderDraft | null>(null);
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    if (open && draft) {
      setForm({ ...draft, models: draft.models.map((m) => ({ ...m })) });
      setCustomModel("");
    }
  }, [open, draft]);

  if (!form) return null;

  const patch = (partial: Partial<ProviderDraft>) => setForm((prev) => (prev ? { ...prev, ...partial } : prev));

  const addModel = (id: string) => {
    const mid = id.trim();
    if (!mid || form.models.some((m) => m.id === mid)) return;
    patch({ models: [...form.models, emptyModelSpec(mid)] });
  };

  const removeModel = (id: string) => {
    patch({ models: form.models.filter((m) => m.id !== id) });
  };

  const patchModel = (id: string, partial: Partial<ModelSpec>) => {
    patch({
      models: form.models.map((m) => (m.id === id ? { ...m, ...partial } : m)),
    });
  };

  const canSave = form.base_url.trim().length > 0 && (form.api_key_set || form.api_key.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft && (draft.api_key_set || draft.models.length > 0 || draft.label.trim())
              ? "编辑服务商"
              : "添加服务商"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="备注名">
            <Input
              value={form.label}
              placeholder="可选"
              onChange={(e) => patch({ label: e.target.value })}
            />
          </Field>
          <Field label="Base URL">
            <Input
              value={form.base_url}
              placeholder="https://api.example.com/v1"
              onChange={(e) => patch({ base_url: e.target.value })}
            />
          </Field>
          <Field
            label={
              <>
                API Key{" "}
                {form.api_key_set && !form.api_key && (
                  <Badge variant="default" className="ml-1 align-middle">
                    已设置
                  </Badge>
                )}
              </>
            }
          >
            <Input
              type="password"
              value={form.api_key}
              placeholder={form.api_key_set ? "留空则保持原 Key" : "sk-..."}
              onChange={(e) => patch({ api_key: e.target.value })}
              autoComplete="off"
            />
          </Field>

          <Field label="模型" hint="手动添加模型 ID。上下文窗口和最大输出留空则使用内置预设。">
            {form.models.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1.4fr)_5.5rem_5.5rem_1.5rem] items-center gap-1.5 px-0.5 text-[12px] text-muted-foreground">
                  <span>模型 ID</span>
                  <span>上下文</span>
                  <span>最大输出</span>
                  <span />
                </div>
                {form.models.map((spec) => (
                  <div
                    key={spec.id}
                    className="grid grid-cols-[minmax(0,1.4fr)_5.5rem_5.5rem_1.5rem] items-center gap-1.5"
                  >
                    <span className="truncate font-mono text-[13px] leading-5 text-foreground/90" title={spec.id}>
                      {spec.id}
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="h-8 px-2 text-[13px] tabular-nums"
                      value={spec.context_window > 0 ? String(spec.context_window) : ""}
                      placeholder="自动"
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const n = raw === "" ? 0 : Number.parseInt(raw, 10);
                        patchModel(spec.id, { context_window: Number.isFinite(n) && n > 0 ? n : 0 });
                      }}
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="h-8 px-2 text-[13px] tabular-nums"
                      value={spec.max_output_tokens > 0 ? String(spec.max_output_tokens) : ""}
                      placeholder="自动"
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const n = raw === "" ? 0 : Number.parseInt(raw, 10);
                        patchModel(spec.id, { max_output_tokens: Number.isFinite(n) && n > 0 ? n : 0 });
                      }}
                    />
                    <button
                      type="button"
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive"
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
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            disabled={saving || !canSave}
            onClick={() => void onSave(form)}
          >
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPanel({
  panelFollowMode,
  onPanelFollowModeChange,
  onSaved,
}: Props) {
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [model, setModel] = useState("");
  const [savingModels, setSavingModels] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [userRules, setUserRules] = useState<RuleItem[]>([]);
  const [userRuleWarn, setUserRuleWarn] = useState(false);
  const [savingUserRule, setSavingUserRule] = useState(false);
  const [userRuleError, setUserRuleError] = useState("");
  const [followMode, setFollowMode] = useState<PanelFollowMode>(panelFollowMode);
  const [showInternalTools, setShowInternalTools] = useState(loadShowInternalToolTraces);
  const [editDraft, setEditDraft] = useState<ProviderDraft | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setFollowMode(panelFollowMode);
  }, [panelFollowMode]);

  useEffect(() => {
    setShowInternalTools(loadShowInternalToolTraces());
  }, []);

  useEffect(() => {
    api.getConfig().then((c) => {
      setProviders(
        (c.llm.providers ?? []).map((p) => ({
          id: p.id,
          label: p.label,
          base_url: p.base_url,
          api_key: "",
          api_key_set: p.api_key_set,
          models: (p.models ?? []).map(asModelSpec).filter((m): m is ModelSpec => m != null),
        })),
      );
      setActiveProviderId(c.llm.active_provider_id || "");
      setModel(c.llm.model || "");
    });
    api.getUserRule().then((d) => {
      setUserRules(d.rules || []);
      setUserRuleWarn(d.warn);
    }).catch(() => {
      setUserRules([]);
      setUserRuleWarn(false);
    });
  }, []);

  const catalog: LLMCatalogEntry[] = useMemo(() => {
    const entries: LLMCatalogEntry[] = [];
    for (const p of providers) {
      const label = p.label.trim() || "未命名";
      for (const spec of p.models) {
        entries.push({
          key: `${p.id}::${spec.id}`,
          provider_id: p.id,
          model: spec.id,
          label,
          context_window: spec.context_window,
          max_output_tokens: spec.max_output_tokens,
        });
      }
    }
    return entries;
  }, [providers]);

  const activeKey = activeProviderId && model ? `${activeProviderId}::${model}` : "";
  const activeEntry = catalog.find((e) => e.key === activeKey);

  const persistProviders = async (
    nextProviders: ProviderDraft[],
    nextActiveId = activeProviderId,
    nextModel = model,
  ) => {
    setSavingModels(true);
    try {
      const saved = await api.updateConfig({
        providers: nextProviders.map((p) => ({
          id: p.id,
          label: p.label.trim(),
          base_url: p.base_url.trim(),
          api_key: p.api_key || undefined,
          models: p.models.map((m) => ({
            id: m.id,
            label: m.label,
            context_window: m.context_window || 0,
            max_output_tokens: m.max_output_tokens || 0,
          })),
        })),
        active_provider_id: nextActiveId,
        model: nextModel,
        utility_provider_id: "",
        utility_model: "",
      });
      const returned = (saved.llm.providers ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        base_url: p.base_url,
        api_key: "",
        api_key_set: p.api_key_set,
        models: (p.models ?? []).map(asModelSpec).filter((m): m is ModelSpec => m != null),
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
      setSavingModels(false);
    }
  };

  const selectMain = async (key: string) => {
    const entry = catalog.find((e) => e.key === key);
    if (!entry) return;
    setActiveProviderId(entry.provider_id);
    setModel(entry.model);
    await persistProviders(providers, entry.provider_id, entry.model);
  };

  const openCreate = () => {
    setEditDraft(newDraft());
    setDialogOpen(true);
  };

  const openEdit = (p: ProviderDraft) => {
    setEditDraft({ ...p, api_key: "", models: p.models.map((m) => ({ ...m })) });
    setDialogOpen(true);
  };

  const saveDialog = async (draft: ProviderDraft) => {
    const exists = providers.some((p) => p.id === draft.id);
    const next = exists
      ? providers.map((p) => (p.id === draft.id ? draft : p))
      : [...providers, draft];
    let nextActive = activeProviderId;
    let nextModel = model;
    const stillActive = next.some((p) => p.id === nextActive && p.models.some((m) => m.id === nextModel));
    if (!stillActive) {
      nextActive = "";
      nextModel = "";
    }
    await persistProviders(next, nextActive, nextModel);
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
    await persistProviders(next, nextActive, nextModel);
  };

  const saveWorkspace = async () => {
    setSavingWorkspace(true);
    try {
      savePanelFollowMode(followMode);
      onPanelFollowModeChange(followMode);
      saveShowInternalToolTraces(showInternalTools);
      onSaved?.();
    } finally {
      setSavingWorkspace(false);
    }
  };

  return (
    <div className="space-y-10">
      <section id="settings-models" className="scroll-mt-8">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">模型</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              列表只读；添加/修改在弹窗中完成，保存后立即生效。
            </p>
          </div>
          <Button type="button" size="sm" onClick={openCreate} disabled={savingModels}>
            <Plus className="size-3.5" />
            添加服务商
          </Button>
        </header>

        <div className="mb-5 space-y-2">
          {providers.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-center text-[14px] text-muted-foreground">
              尚未配置服务商。点击「添加服务商」开始。
            </div>
          )}
          {providers.map((p) => (
            <div
              key={p.id}
              className="flex items-start gap-3 rounded-lg bg-muted/40 px-3.5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">
                    {p.label.trim() || "未命名服务商"}
                  </span>
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
                  onClick={() => openEdit(p)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  aria-label="删除"
                  disabled={savingModels}
                  onClick={() => void removeProvider(p.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Field label="当前模型" hint="切换后自动保存。未选择时不会自动指定服务商。">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={savingModels || catalog.length === 0}
                className={cn(
                  "box-border flex h-10 w-full items-center justify-between gap-2 rounded-md border border-solid border-input/70 bg-muted/30 px-3 text-left text-[15px] leading-5 text-foreground shadow-none transition-[border-color,box-shadow,background-color]",
                  "hover:bg-muted/50",
                  "focus-visible:border-ring focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                aria-label="选择模型"
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
                      <span className="truncate font-mono text-[14px] text-foreground">{e.model}</span>
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
        </Field>
        <p className="text-[14px] text-muted-foreground">
          使用前请至少配置一个带 API Key 的厂商并选择模型。
          {savingModels ? " · 正在保存…" : ""}
        </p>

        <ProviderDialog
          open={dialogOpen}
          draft={editDraft}
          saving={savingModels}
          onClose={() => {
            setDialogOpen(false);
            setEditDraft(null);
          }}
          onSave={saveDialog}
        />
      </section>

      <section id="settings-rules" className="scroll-mt-8 border-t border-border/40 pt-10">
        <header className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">User Rule</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            对本 Studio 生效，跨项目。每条有名称与详情。是行为约束，不是权限。
          </p>
        </header>
        <RuleListEditor
          rules={userRules}
          warn={userRuleWarn}
          saving={savingUserRule}
          error={userRuleError}
          onChange={(next) => {
            setUserRules(next);
            setUserRuleWarn(false);
            setUserRuleError("");
          }}
          onSave={() => {
            const invalid = validateRuleItems(userRules);
            if (invalid) {
              setUserRuleError(invalid);
              return;
            }
            setSavingUserRule(true);
            setUserRuleError("");
            api
              .saveUserRule(userRules)
              .then((d) => {
                setUserRules(d.rules || []);
                setUserRuleWarn(d.warn);
                onSaved?.();
              })
              .catch((err) => setUserRuleError(formatApiError(err, "保存 User Rule 失败")))
              .finally(() => setSavingUserRule(false));
          }}
        />
      </section>

      <section id="settings-workspace" className="scroll-mt-8 border-t border-border/40 pt-10">
        <WorkspaceSettingsSection
          followMode={followMode}
          onFollowModeChange={setFollowMode}
          showInternalToolTraces={showInternalTools}
          onShowInternalToolTracesChange={setShowInternalTools}
          saving={savingWorkspace}
          onSave={() => void saveWorkspace()}
        />
      </section>
    </div>
  );
}

/** @deprecated Use SettingsPanel via SettingsView */
export const SettingsModal = SettingsPanel;
