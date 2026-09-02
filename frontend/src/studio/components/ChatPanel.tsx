import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  ImageIcon,
  Layers,
  ListTodo,
  MessageCircleQuestion,
  Plus,
  Square,
  X,
} from "lucide-react";
import type {
  ChatMessage,
  ContextUsage,
  ConversationMode,
  LiveTurn,
  PendingQuestion,
  PendingSuggestMode,
} from "../../types";
import type { LLMCatalogEntry, LLMConfigPublic } from "../../types/llm";
import { api } from "../../api";
import { cn } from "@/lib/utils";
import { describeLiveWorkingStatus, liveBubbleId } from "../streamUtils";
import { ChatMessageView } from "./ChatMessageView";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { ContextUsageControl } from "../../components/ContextUsageControl";
import { openDebugPanel } from "../../debug/log";
import type { RuleProposalHandlers } from "./RuleProposalCard";
import type { UserChoiceHandlers } from "./UserChoiceInline";
import type { PermissionHandlers } from "./PermissionPanel";

interface Props {
  messages: ChatMessage[];
  liveTurn: LiveTurn | null;
  running: boolean;
  input: string;
  errorMsg: string;
  hasConversation: boolean;
  conversationId: string | null;
  workflowMode: ConversationMode;
  selectedModel: string;
  liveContextUsage?: ContextUsage | null;
  onModelChange: (modelKey: string) => void;
  pendingQuestion: PendingQuestion | null;
  pendingSuggestMode: PendingSuggestMode | null;
  composerRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
  onInput: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  stopping?: boolean;
  onDismissError: () => void;
  onSubmitAnswers: UserChoiceHandlers["onSubmitAnswers"];
  onSubmitPermission: PermissionHandlers["onSubmitPermission"];
  onEnterPlan: () => void;
  onLeavePlan: () => void;
  onEnterAsk: () => void;
  onLeaveAsk: () => void;
  onAcceptSuggestMode: UserChoiceHandlers["onAcceptSuggestMode"];
  onDismissSuggestMode: () => void;
  onResolveRuleProposal: RuleProposalHandlers["onResolve"];
  onOpenFile?: (path: string) => void;
}

const COMPOSER_MIN = 40;
const COMPOSER_MAX = 200;

type ComposerTool = "plan" | "ask" | "image";

const TOOL_MENU: {
  id: ComposerTool;
  label: string;
  desc: string;
  icon: typeof ListTodo;
  enabled: boolean;
}[] = [
  { id: "plan", label: "Plan", desc: "先写 plan 再 Execute Plan", icon: ListTodo, enabled: true },
  { id: "ask", label: "Ask", desc: "仅提问，不改工作区", icon: MessageCircleQuestion, enabled: true },
  { id: "image", label: "Image", desc: "附图或生成概念图", icon: ImageIcon, enabled: false },
];

function catalogKey(entry: LLMCatalogEntry) {
  return entry.key || `${entry.provider_id}::${entry.model}`;
}

function splitCatalogKey(selectedModel: string): { model: string; providerId: string } {
  if (selectedModel.includes("::")) {
    const idx = selectedModel.indexOf("::");
    return { providerId: selectedModel.slice(0, idx), model: selectedModel.slice(idx + 2) };
  }
  return { providerId: "", model: selectedModel };
}

function modelNameOnly(selectedModel: string, catalog: LLMCatalogEntry[], fallback: string) {
  const hit = catalog.find((e) => catalogKey(e) === selectedModel);
  if (hit?.model?.trim()) return hit.model.trim();
  if (selectedModel.includes("::")) return selectedModel.split("::").pop() || selectedModel;
  return selectedModel || fallback || "模型";
}

export function ChatPanel({
  messages,
  liveTurn,
  running,
  input,
  errorMsg,
  hasConversation,
  conversationId,
  workflowMode,
  selectedModel,
  liveContextUsage,
  onModelChange,
  pendingQuestion,
  pendingSuggestMode,
  composerRef,
  onInput,
  onSend,
  onStop,
  stopping = false,
  onDismissError,
  onSubmitAnswers,
  onSubmitPermission,
  onEnterPlan,
  onLeavePlan,
  onEnterAsk,
  onLeaveAsk,
  onAcceptSuggestMode,
  onDismissSuggestMode,
  onResolveRuleProposal,
  onOpenFile,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [catalog, setCatalog] = useState<LLMCatalogEntry[]>([]);
  const [cfgLabel, setCfgLabel] = useState("");

  const hasLiveContent =
    !!liveTurn &&
    !!(
      liveTurn.reasoning ||
      liveTurn.text ||
      liveTurn.traces.length ||
      liveTurn.blocks?.length ||
      liveTurn.choices?.length ||
      liveTurn.ruleProposals?.length ||
      liveTurn.permissions?.length
    );
  const last = messages[messages.length - 1];
  const lastIsAi = last?.role === "ai" || last?.role === "assistant";
  // Only fold live content back into the bubble of this same turn; a new turn
  // always gets its own bubble so the previous reply stays readable.
  const attachLiveToLast =
    lastIsAi &&
    !!liveTurn?.turnId &&
    last?.id === liveBubbleId(liveTurn.turnId) &&
    (running || hasLiveContent);
  const choiceHandlers = {
    onSubmitAnswers,
    onAcceptSuggestMode,
    onDismissSuggestMode,
  };
  const permissionHandlers = { onSubmitPermission };
  const ruleHandlers = { onResolve: onResolveRuleProposal };
  const isPlan = workflowMode === "plan";
  const isAsk = workflowMode === "ask";
  const canSend = !!input.trim() && !running && hasConversation;
  const liveStatus = liveTurn && running ? describeLiveWorkingStatus(liveTurn) : null;
  const usageModel = splitCatalogKey(selectedModel);

  useEffect(() => {
    api.getConfig().then((cfg: { llm: LLMConfigPublic }) => {
      const entries = cfg.llm.catalog?.length
        ? cfg.llm.catalog
        : (cfg.llm.available_models || []).map((m) => ({
            key: `${cfg.llm.active_provider_id}::${m}`,
            provider_id: cfg.llm.active_provider_id,
            model: m,
            label: m,
            context_window: 0,
            max_output_tokens: 0,
          }));
      setCatalog(entries);
      const activeKey = `${cfg.llm.active_provider_id}::${cfg.llm.model}`;
      setCfgLabel(cfg.llm.model || "");
      if (!selectedModel && activeKey) onModelChange(activeKey);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [
    messages.length,
    liveTurn?.text,
    liveTurn?.reasoning,
    liveTurn?.traces.length,
    liveTurn?.blocks?.length,
    liveStatus,
    running,
    pendingQuestion,
    pendingSuggestMode,
  ]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    const next = Math.min(Math.max(ta.scrollHeight, COMPOSER_MIN), COMPOSER_MAX);
    ta.style.height = `${next}px`;
    ta.style.overflowY = next >= COMPOSER_MAX ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    if (composerRef) composerRef.current = taRef.current;
  });

  const selectTool = (id: ComposerTool) => {
    if (id === "plan") onEnterPlan();
    if (id === "ask") onEnterAsk();
  };

  const plusMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={running || !hasConversation}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            "bg-background text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]",
            "transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.16)]",
            "disabled:opacity-40",
          )}
          aria-label="添加工具"
        >
          <Plus className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        {TOOL_MENU.map((tool) => {
          const Icon = tool.icon;
          return (
            <DropdownMenuItem
              key={tool.id}
              disabled={
                !tool.enabled ||
                running ||
                (tool.id === "plan" && isPlan) ||
                (tool.id === "ask" && isAsk)
              }
              onSelect={() => selectTool(tool.id)}
              className="gap-2.5"
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">{tool.label}</div>
                <div className="text-[12px] text-muted-foreground">
                  {tool.enabled ? tool.desc : `${tool.desc}（即将推出）`}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const planChip = isPlan ? (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full pl-2.5 pr-1",
        "bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-[color:var(--warning)]",
        "shadow-[0_0_0_1px_color-mix(in_srgb,var(--warning)_35%,transparent),0_2px_8px_color-mix(in_srgb,var(--warning)_28%,transparent)]",
      )}
    >
      <ListTodo className="size-3.5" />
      <span className="text-[13px] font-medium">Plan</span>
      <button
        type="button"
        className="ml-0.5 flex size-5 items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,var(--warning)_22%,transparent)] disabled:opacity-40"
        aria-label="退出 Plan"
        title="退出 Plan"
        disabled={running}
        onClick={onLeavePlan}
      >
        <X className="size-3" />
      </button>
    </span>
  ) : null;

  const askChip = isAsk ? (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full pl-2.5 pr-1",
        "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-primary",
        "shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_30%,transparent)]",
      )}
    >
      <MessageCircleQuestion className="size-3.5" />
      <span className="text-[13px] font-medium">Ask</span>
      <button
        type="button"
        className="ml-0.5 flex size-5 items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] disabled:opacity-40"
        aria-label="退出 Ask"
        title="退出 Ask"
        disabled={running}
        onClick={onLeaveAsk}
      >
        <X className="size-3" />
      </button>
    </span>
  ) : null;

  const modelPicker = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={running || !hasConversation || catalog.length === 0}
          className="h-8 max-w-[10rem] gap-1 px-2 text-[14px] font-normal text-muted-foreground hover:text-foreground"
          aria-label="选择模型"
          title={modelNameOnly(selectedModel, catalog, cfgLabel)}
        >
          <span className="truncate font-mono">
            {catalog.length === 0
              ? cfgLabel || "选择模型"
              : modelNameOnly(selectedModel, catalog, cfgLabel)}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-72 overflow-y-auto">
        {catalog.map((entry) => {
          const key = catalogKey(entry);
          const active = key === selectedModel;
          return (
            <DropdownMenuItem
              key={key}
              className={cn("flex flex-col items-start gap-0.5 py-2", active && "bg-primary/10")}
              onSelect={() => onModelChange(key)}
            >
              <span className="truncate font-mono text-[14px] text-foreground">{entry.model}</span>
              {entry.label && entry.label !== entry.model && (
                <span className="truncate text-[13px] text-muted-foreground">{entry.label}</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const sendBtn = running && onStop ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          onClick={onStop}
          className="size-8 shrink-0 rounded-full shadow-sm"
          aria-label={stopping ? "停止中，再点一次强制中断" : "停止"}
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{stopping ? "停止中，再点一次强制中断" : "停止"}</TooltipContent>
    </Tooltip>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          disabled={!canSend}
          onClick={onSend}
          className="size-8 shrink-0 rounded-full shadow-sm"
          aria-label="发送"
        >
          {running ? <span className="ws-spin" /> : <ArrowUp className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>发送</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex h-full min-h-0 flex-col bg-background">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5" ref={scrollRef}>
          {!hasConversation ? (
            <div className="mt-24 text-center text-[15px] text-muted-foreground">
              选择或新建一个对话，开始和 AI 一起设计游戏。
            </div>
          ) : messages.length === 0 && !hasLiveContent && !running && !pendingQuestion && !pendingSuggestMode ? (
            <div className="mx-auto mt-20 max-w-md text-center">
              <div
                className={cn(
                  "mx-auto mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10",
                )}
              >
                {isPlan ? (
                  <ListTodo className="size-4 text-primary" />
                ) : (
                  <Layers className="size-4 text-primary" />
                )}
              </div>
              {isPlan ? (
                <>
                  <h2 className="text-lg font-semibold tracking-tight">先 Plan，再 Execute Plan</h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                    描述你想做的游戏。Agent 可能先提问澄清，再在右侧生成 plan；确认后点击「执行计划」。
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold tracking-tight">和 AI 一起设计游戏</h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                    直接下达修改指令，或点输入框旁的 + 选择 Plan 先澄清需求。右侧可随时切换工作区与 plan。
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-2">
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                if (isLast && attachLiveToLast) {
                  return (
                    <ChatMessageView
                      key={m.id ?? i}
                      message={m}
                      liveTurn={liveTurn}
                      streaming={running}
                      onOpenFile={onOpenFile}
                      choiceHandlers={choiceHandlers}
                      ruleHandlers={ruleHandlers}
                      permissionHandlers={permissionHandlers}
                    />
                  );
                }
                return (
                  <ChatMessageView
                    key={m.id ?? i}
                    message={m}
                    onOpenFile={onOpenFile}
                    choiceHandlers={choiceHandlers}
                    ruleHandlers={ruleHandlers}
                    permissionHandlers={permissionHandlers}
                  />
                );
              })}
              {!attachLiveToLast && (running || hasLiveContent) && (
                <ChatMessageView
                  liveTurn={liveTurn}
                  streaming={running}
                  onOpenFile={onOpenFile}
                  choiceHandlers={choiceHandlers}
                  ruleHandlers={ruleHandlers}
                  permissionHandlers={permissionHandlers}
                />
              )}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-[14px] text-destructive">
            <strong className="shrink-0">出错了</strong>
            <span className="min-w-0 flex-1 leading-relaxed">{errorMsg}</span>
            <Button variant="ghost" size="sm" className="h-6 shrink-0" onClick={() => openDebugPanel()}>
              详情
            </Button>
            <Button variant="ghost" size="sm" className="h-6 shrink-0" onClick={onDismissError}>
              关闭
            </Button>
          </div>
        )}

        <div className="relative shrink-0 bg-background px-4 pb-4 pt-1">
          <div className="relative mx-auto flex w-full max-w-2xl flex-col rounded-2xl bg-card px-3 pb-2.5 pt-3 shadow-sm ring-1 ring-border/40">
            <textarea
              ref={taRef}
              rows={1}
              className={cn(
                "box-border w-full resize-none border-0 bg-transparent px-1 py-0 text-[16px] leading-6 text-foreground outline-none",
                "placeholder:text-muted-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              style={{ minHeight: COMPOSER_MIN, maxHeight: COMPOSER_MAX }}
              placeholder={
                hasConversation
                  ? isPlan
                    ? "描述创意或继续讨论计划…"
                    : "描述你想设计的游戏，或下达具体指令…"
                  : "请先选择或新建一个对话。"
              }
              value={input}
              disabled={running || !hasConversation}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />

            <div className="mt-1.5 flex w-full items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1.5">
                {plusMenu}
                {planChip}
                {askChip}
                {(messages.length > 0 || running || hasLiveContent) && (
                  <ContextUsageControl
                    key={conversationId ?? "none"}
                    conversationId={hasConversation ? conversationId : null}
                    model={usageModel.model}
                    providerId={usageModel.providerId}
                    live={liveContextUsage}
                    refreshKey={`${messages.length}:${messages[messages.length - 1]?.id ?? ""}`}
                    panelClassName="left-0 right-auto"
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                {modelPicker}
                {sendBtn}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
