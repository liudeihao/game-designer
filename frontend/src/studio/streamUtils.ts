import type {
  ActivityEntry,
  AnswerItem,
  ChatMessage,
  LiveTurn,
  MessagePart,
  PendingInterrupt,
  PermissionPart,
  PlanQuestion,
  TraceEndEvent,
  TracePart,
  TraceStartEvent,
  TraceStatus,
  TraceStep,
  RuleOperation,
  RuleProposalPart,
  RuleScope,
  UserChoicePart,
  UserChoiceStatus,
} from "../types";
import { isPendingToolPermission } from "../types";
import { toolTitle, toolWorkingStatus } from "./lib/toolPresentation";
import { orderLiveBlocksForDisplay } from "./lib/eventsColumn";

export const USER_CHOICE_TOOL_NAMES = new Set(["ask_user", "suggest_mode"]);

export function isUserChoiceTool(name: string | undefined): boolean {
  return !!name && USER_CHOICE_TOOL_NAMES.has(name);
}

export function emptyLiveTurn(): LiveTurn {
  return {
    turnId: "",
    reasoning: "",
    text: "",
    traces: [],
    blocks: [],
    reasoningDone: false,
    fileRefs: [],
    choices: [],
    ruleProposals: [],
  };
}

/** Append streamed prose, starting a new text block after tools. */
export function appendLiveText(turn: LiveTurn, chunk: string): LiveTurn {
  if (!chunk) return turn;
  const blocks = [...(turn.blocks || [])];
  const last = blocks[blocks.length - 1];
  if (last?.type === "text") {
    blocks[blocks.length - 1] = { type: "text", content: last.content + chunk };
  } else {
    blocks.push({ type: "text", content: chunk });
  }
  return {
    ...turn,
    text: turn.text + chunk,
    blocks,
    reasoningDone: true,
  };
}

function mergeFileRefs(
  existing: LiveTurn["fileRefs"] | undefined,
  incoming: unknown,
): NonNullable<LiveTurn["fileRefs"]> {
  const out = [...(existing || [])];
  const seen = new Set(out.map((f) => `${f.op || "write"}:${f.path}`));
  const list = Array.isArray(incoming) ? incoming : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const path = String((item as { path?: unknown }).path || "")
      .trim()
      .replace(/\\/g, "/");
    if (!path || path.endsWith("/")) continue;
    let op = String((item as { op?: unknown }).op || "write").trim() || "write";
    if (op !== "write" && op !== "delete" && op !== "search_replace") op = "write";
    const createdRaw = (item as { created?: unknown }).created;
    const created =
      createdRaw === true || createdRaw === "1"
        ? true
        : createdRaw === false || createdRaw === "0"
          ? false
          : undefined;
    const old = String((item as { old?: unknown }).old || "");
    const neu = String((item as { new?: unknown }).new || "");
    const key = `${op}:${path}`;
    if (seen.has(key)) continue;
    // Prefer latest op for the same path.
    const prevIdx = out.findIndex((f) => f.path === path);
    if (prevIdx >= 0) {
      seen.delete(`${out[prevIdx].op || "write"}:${path}`);
      out.splice(prevIdx, 1);
    }
    seen.add(key);
    out.push({
      path,
      op,
      ...(created !== undefined ? { created } : {}),
      ...(old ? { old } : {}),
      ...(neu ? { new: neu } : {}),
    });
  }
  return out;
}

export function isHandoffTrace(trace: Pick<TracePart, "name">): boolean {
  return trace.name === "handoff";
}

export function capabilityLabel(id: string): string {
  return id.replace(/_/g, " ");
}

function findTrace(traces: TracePart[], id: string): TracePart | undefined {
  for (const t of traces) {
    if (t.id === id) return t;
    if (t.children?.length) {
      const hit = findTrace(t.children, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

function updateTrace(
  traces: TracePart[],
  id: string,
  updater: (t: TracePart) => TracePart,
): TracePart[] {
  return traces.map((t) => {
    if (t.id === id) return updater(t);
    if (t.children?.length) {
      return { ...t, children: updateTrace(t.children, id, updater) };
    }
    return t;
  });
}

function allChildrenDone(trace: TracePart): boolean {
  const kids = trace.children || [];
  if (!kids.length) return false;
  return kids.every((c) => c.status !== "running" && allChildrenDoneFlat(c));
}

function allChildrenDoneFlat(trace: TracePart): boolean {
  const kids = trace.children || [];
  if (!kids.length) return trace.status !== "running";
  return kids.every((c) => c.status !== "running" && allChildrenDoneFlat(c));
}

/** After children settle, close awaiting handoff parents. */
export function settleHandoffTraces(traces: TracePart[]): TracePart[] {
  return traces.map((t) => {
    const children = t.children?.length ? settleHandoffTraces(t.children) : t.children;
    const next = children ? { ...t, children } : t;
    if (!isHandoffTrace(next) || !next.awaitingChildren) return next;
    if (!allChildrenDone(next)) return next;
    const kids = next.children || [];
    const anyErr = kids.some((c) => c.status === "error");
    const anyWarn = kids.some((c) => c.status === "warning");
    return {
      ...next,
      awaitingChildren: false,
      status: (anyErr ? "error" : anyWarn ? "warning" : "success") as TraceStatus,
      result:
        next.result ||
        kids
          .map((c) => c.result)
          .filter(Boolean)
          .slice(-1)[0],
    };
  });
}

export function pendingFromToolArgs(
  name: string,
  args?: Record<string, unknown>,
): PendingInterrupt | null {
  const a = args || {};
  if (name === "ask_user") {
    const questions = Array.isArray(a.questions) ? (a.questions as PlanQuestion[]) : [];
    return {
      type: "user_choice",
      variant: "questions",
      message: String(a.message || "").trim() || "在继续之前，我想先确认几件事：",
      questions,
    };
  }
  if (name === "suggest_mode") {
    const raw = String(a.mode || "").trim();
    const mode = raw === "plan" || raw === "ask" ? raw : "";
    return {
      type: "user_choice",
      variant: "suggest_mode",
      mode,
      message:
        String(a.message || "").trim() ||
        (mode === "plan"
          ? "这项改动范围较大，建议先进入 Plan。"
          : mode === "ask"
            ? "这轮更像是查阅，建议切到 Ask。"
            : "这件事要真的改工作区，建议切到 Agent。"),
      reason: String(a.reason || ""),
    };
  }
  return null;
}

function upsertChoice(turn: LiveTurn, choice: UserChoicePart): LiveTurn {
  const choices = [...(turn.choices || [])];
  const idx = choices.findIndex((c) => c.id === choice.id);
  if (idx >= 0) choices[idx] = { ...choices[idx], ...choice, pending: choice.pending };
  else choices.push(choice);
  const blocks = [...(turn.blocks || [])];
  if (!blocks.some((b) => b.type === "user_choice" && b.id === choice.id)) {
    blocks.push({ type: "user_choice", id: choice.id });
  }
  return { ...turn, choices, blocks };
}

export function applyPendingInterrupt(turn: LiveTurn, pending: PendingInterrupt): LiveTurn {
  if (isPendingToolPermission(pending)) {
    const part: PermissionPart = {
      type: "tool_permission",
      id: pending.calls[0]?.id || `perm-${Date.now()}`,
      pending,
      status: "pending",
    };
    const list = [...(turn.permissions || [])];
    const idx = list.findIndex((item) => item.id === part.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...part };
    else list.push(part);
    const blocks = [...(turn.blocks || [])];
    if (!blocks.some((b) => b.type === "tool_permission" && b.id === part.id)) {
      blocks.push({ type: "tool_permission", id: part.id });
    }
    return { ...turn, permissions: list, blocks };
  }
  const choices = turn.choices || [];
  const lastPending = [...choices].reverse().find((c) => c.status === "pending");
  if (lastPending) {
    return upsertChoice(turn, { ...lastPending, pending });
  }
  return upsertChoice(turn, {
    type: "user_choice",
    id: `choice-${Date.now()}`,
    pending,
    status: "pending",
  });
}

function asRuleScope(value: unknown): RuleScope {
  return value === "user" ? "user" : "project";
}

function asRuleOperation(value: unknown): RuleOperation {
  if (value === "update" || value === "delete") return value;
  if (value === "replace") return "update";
  if (value === "clear") return "delete";
  return "add";
}

function proposalFields(args: Record<string, unknown> | undefined): { name: string; details: string } {
  const raw = args || {};
  const name = String(raw.name || "");
  const details = String(raw.details ?? raw.text ?? "");
  return { name, details };
}

function upsertRuleProposal(turn: LiveTurn, part: RuleProposalPart): LiveTurn {
  const list = [...(turn.ruleProposals || [])];
  const idx = list.findIndex((item) => item.id === part.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...part };
  else list.push(part);
  const blocks = [...(turn.blocks || [])];
  if (!blocks.some((b) => b.type === "rule_proposal" && b.id === part.id)) {
    blocks.push({ type: "rule_proposal", id: part.id });
  }
  return { ...turn, ruleProposals: list, blocks };
}

export function applyTraceStart(turn: LiveTurn, ev: TraceStartEvent): LiveTurn {
  if (isUserChoiceTool(ev.name)) {
    const pending = pendingFromToolArgs(ev.name, ev.args);
    if (!pending) return turn;
    return upsertChoice(turn, {
      type: "user_choice",
      id: ev.id,
      pending,
      status: "pending",
    });
  }
  if (ev.name === "propose_rule") {
    const args = ev.args || {};
    return upsertRuleProposal(turn, {
      type: "rule_proposal",
      id: ev.id,
      scope: asRuleScope(args.scope),
      operation: asRuleOperation(args.operation),
      ...proposalFields(args),
      status: "pending",
    });
  }

  if (findTrace(turn.traces, ev.id)) return turn;
  const hideFromTimeline = ev.kind === "compaction" || ev.name === "compact_context";
  const trace: TracePart = {
    type: "trace",
    id: ev.id,
    agent: ev.agent,
    name: ev.name,
    status: "running",
    args: ev.args,
    kind: ev.kind,
    children: [],
    steps: [],
    startedAt: ev.ts,
  };

  const blocks = [...(turn.blocks || [])];
  if (!hideFromTimeline && !blocks.some((b) => b.type === "trace" && b.id === ev.id)) {
    blocks.push({ type: "trace", id: ev.id });
  }
  return { ...turn, traces: [...turn.traces, trace], blocks };
}

export function applyTraceEnd(turn: LiveTurn, ev: TraceEndEvent): LiveTurn {
  let traces = turn.traces;
  const existing = findTrace(traces, ev.id);

  if (!existing) {
    traces = [
      ...traces,
      {
        type: "trace",
        id: ev.id,
        agent: ev.agent,
        name: "unknown",
        status: ev.status as TraceStatus,
        result: ev.result,
        error: ev.error,
      },
    ];
    const blocks = [...(turn.blocks || [])];
    if (!blocks.some((b) => b.type === "trace" && b.id === ev.id)) {
      blocks.push({ type: "trace", id: ev.id });
    }
    return { ...turn, traces: settleHandoffTraces(traces), blocks };
  }

  traces = updateTrace(traces, ev.id, (t) => {
    const ended = { endedAt: ev.ts || t.endedAt };
    // Studio handoff ends immediately — keep parent open until specialist work lands.
    if (isHandoffTrace(t) && ev.status === "success") {
      const kids = t.children || [];
      const childrenDone =
        kids.length > 0 && kids.every((c) => c.status !== "running");
      if (childrenDone) {
        return {
          ...t,
          ...ended,
          status: "success",
          awaitingChildren: false,
          result: ev.result ?? t.result,
          error: ev.error ?? t.error,
        };
      }
      return {
        ...t,
        ...ended,
        status: "running",
        awaitingChildren: true,
        result: ev.result ?? t.result,
        error: ev.error ?? t.error,
      };
    }
    return {
      ...t,
      ...ended,
      status: ev.status as TraceStatus,
      result: ev.result ?? t.result,
      error: ev.error ?? t.error,
    };
  });

  return { ...turn, traces: settleHandoffTraces(traces) };
}

function appendStep(traces: TracePart[], id: string, step: TraceStep): TracePart[] {
  return updateTrace(traces, id, (t) => ({
    ...t,
    steps: [...(t.steps || []), step],
  }));
}

function findStepTargetId(traces: TracePart[], e: ActivityEntry): string | null {
  for (let i = traces.length - 1; i >= 0; i--) {
    const t = traces[i];
    if (t.agent === e.agent && t.status === "running") return t.id;
    if (t.children?.length) {
      const nested = findStepTargetId(t.children, e);
      if (nested) return nested;
    }
  }
  return null;
}

/** Fallback: close running traces when SSE trace_* events are missing. */
export function applyActivityToTrace(turn: LiveTurn, e: ActivityEntry): LiveTurn {
  const detail = e.detail || {};
  let traces = turn.traces;
  const fileRefs = mergeFileRefs(turn.fileRefs, detail.writes);

  const step: TraceStep = {
    agent: e.agent,
    kind: e.kind,
    message: e.message,
    ts: e.ts,
  };
  const stepTarget = findStepTargetId(traces, e);
  if (stepTarget) {
    traces = appendStep(traces, stepTarget, step);
  }

  // Expert finished — close the running trace card for this agent
  if (e.kind === "work" && detail.module_keys) {
    const matchingChild = findLastRunning(traces, (t) => t.agent === e.agent && !isHandoffTrace(t));
    if (matchingChild) {
      return applyTraceEnd(
        { ...turn, traces, fileRefs },
        {
          id: matchingChild.id,
          agent: e.agent,
          status: "success",
          result: e.message,
        },
      );
    }
    const matchingHandoff = findLastRunning(
      traces,
      (t) => isHandoffTrace(t) && t.awaitingChildren === true,
    );
    if (matchingHandoff) {
      traces = updateTrace(traces, matchingHandoff.id, (t) => ({
        ...t,
        status: "success",
        awaitingChildren: false,
        result: e.message,
      }));
      return { ...turn, traces: settleHandoffTraces(traces), fileRefs };
    }
  }

  if (e.kind === "error") {
    const matching = findLastRunning(traces, (t) => t.agent === e.agent);
    if (matching) {
      return applyTraceEnd(
        { ...turn, traces, fileRefs },
        {
          id: matching.id,
          agent: e.agent,
          status: "error",
          error: e.message,
        },
      );
    }
  }

  return { ...turn, traces: settleHandoffTraces(traces), fileRefs };
}

function findLastRunning(
  traces: TracePart[],
  pred: (t: TracePart) => boolean,
): TracePart | undefined {
  for (let i = traces.length - 1; i >= 0; i--) {
    const t = traces[i];
    if (t.children?.length) {
      const nested = findLastRunning(t.children, pred);
      if (nested) return nested;
    }
    if (t.status === "running" && pred(t)) return t;
  }
  return undefined;
}

export function liveTurnToParts(turn: LiveTurn): MessagePart[] {
  const parts: MessagePart[] = [];
  if (turn.reasoning.trim()) {
    parts.push({ type: "reasoning", content: turn.reasoning.trim(), collapsed: true });
  }
  const settled = settleHandoffTraces(turn.traces);
  const byId = new Map(settled.map((t) => [t.id, t]));
  const choices = turn.choices || [];
  const choiceById = new Map(choices.map((c) => [c.id, c]));
  const proposals = turn.ruleProposals || [];
  const proposalById = new Map(proposals.map((p) => [p.id, p]));
  const blocks = orderLiveBlocksForDisplay(turn.blocks || []);
  const seenTrace = new Set<string>();
  const seenChoice = new Set<string>();
  const seenProposal = new Set<string>();

  if (blocks.length > 0) {
    for (const block of blocks) {
      if (block.type === "text") {
        if (block.content.trim()) {
          parts.push({ type: "text", content: block.content.trim() });
        }
        continue;
      }
      if (block.type === "user_choice") {
        const choice = choiceById.get(block.id);
        if (choice) {
          parts.push({ ...choice });
          seenChoice.add(choice.id);
        }
        continue;
      }
      if (block.type === "rule_proposal") {
        const proposal = proposalById.get(block.id);
        if (proposal) {
          parts.push({ ...proposal });
          seenProposal.add(proposal.id);
        }
        continue;
      }
      const trace = byId.get(block.id);
      if (trace) {
        parts.push({ ...trace });
        seenTrace.add(trace.id);
      }
    }
    // Orphan top-level traces not recorded in blocks (defensive).
    for (const t of settled) {
      if (!seenTrace.has(t.id)) parts.push({ ...t });
    }
    for (const c of choices) {
      if (!seenChoice.has(c.id)) parts.push({ ...c });
    }
    for (const p of proposals) {
      if (!seenProposal.has(p.id)) parts.push({ ...p });
    }
  } else {
    // Legacy live turns without blocks: keep narration above tools.
    if (turn.text.trim()) {
      parts.push({ type: "text", content: turn.text.trim() });
    }
    for (const t of settled) {
      parts.push({ ...t });
    }
    for (const c of choices) {
      parts.push({ ...c });
    }
    for (const p of proposals) {
      parts.push({ ...p });
    }
  }

  if (turn.fileRefs?.length) {
    parts.push({ type: "file_refs", files: turn.fileRefs });
  }
  return parts;
}

/**
 * Bubble id for a streaming turn. Distinct turns must never collide, so a turn
 * that aborted before its first frame (no turn id yet) falls back to a stamp.
 */
export function liveBubbleId(turnId: string | undefined): string {
  return `live-${turnId || Date.now()}`;
}

/** Fold a streaming turn into a persisted chat message (e.g. on interrupt). */
export function liveTurnToMessage(turn: LiveTurn, fallbackText = ""): ChatMessage | null {
  const text = turn.text.trim() || fallbackText.trim();
  const parts = liveTurnToParts({ ...turn, text: text || turn.text });
  if (!text && parts.length === 0) return null;
  return {
    id: liveBubbleId(turn.turnId),
    role: "ai",
    content: text || fallbackText,
    parts: parts.length ? parts : undefined,
  };
}

/**
 * Append a finished live turn. Only the bubble of the *same* turn is rewritten
 * (abort freezes a bubble that a later ``done`` completes); earlier turns stay.
 */
export function appendLiveTurn(prev: ChatMessage[], live: LiveTurn): ChatMessage[] {
  const add = liveTurnToMessage(live, "");
  if (!add) return prev;
  const last = prev[prev.length - 1];
  if (live.turnId && last?.id === add.id && (last.role === "ai" || last.role === "assistant")) {
    return [...prev.slice(0, -1), { ...last, ...add }];
  }
  return [...prev, add];
}

export function resolveUserChoiceInMessages(
  messages: ChatMessage[],
  update: { status: UserChoiceStatus; answers?: AnswerItem[] },
): ChatMessage[] {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i--) {
    const events = next[i].events;
    if (events?.length) {
      const idx = events.findIndex((e) => e.type === "user_choice" && e.status === "pending");
      if (idx >= 0) {
        const copy = [...events];
        const cur = copy[idx];
        if (cur.type === "user_choice") {
          copy[idx] = { ...cur, status: update.status, answers: update.answers ?? cur.answers };
          next[i] = { ...next[i], events: copy };
          return next;
        }
      }
    }
    const parts = next[i].parts;
    if (!parts?.length) continue;
    const idx = parts.findIndex((p) => p.type === "user_choice" && p.status === "pending");
    if (idx < 0) continue;
    const copy = [...parts];
    const cur = copy[idx];
    if (cur.type !== "user_choice") continue;
    copy[idx] = { ...cur, status: update.status, answers: update.answers ?? cur.answers };
    next[i] = { ...next[i], parts: copy };
    return next;
  }
  return next;
}

export function resolveUserChoiceInLive(
  turn: LiveTurn,
  update: { status: UserChoiceStatus; answers?: AnswerItem[] },
): LiveTurn {
  const choices = [...(turn.choices || [])];
  const idx = [...choices].reverse().findIndex((c) => c.status === "pending");
  if (idx < 0) return turn;
  const real = choices.length - 1 - idx;
  choices[real] = {
    ...choices[real],
    status: update.status,
    answers: update.answers ?? choices[real].answers,
  };
  return { ...turn, choices };
}

/** Coerce checkpoint / API message parts into a stable TracePart tree. */
export function normalizeMessageParts(parts?: MessagePart[]): MessagePart[] | undefined {
  if (!parts?.length) return parts;
  return parts.map((p) => {
    if (p.type === "trace") return normalizeTracePart(p);
    if (p.type === "user_choice") return p;
    if (p.type === "file_refs") {
      const files = Array.isArray(p.files)
        ? p.files
            .map((f) => {
              const path = String(f?.path || "")
                .trim()
                .replace(/\\/g, "/");
              const opRaw = String(f?.op || "write");
              const op =
                opRaw === "delete" || opRaw === "search_replace" ? opRaw : "write";
              const createdFlag = f?.created as boolean | string | undefined;
              const created =
                createdFlag === true || createdFlag === "1"
                  ? true
                  : createdFlag === false || createdFlag === "0"
                    ? false
                    : undefined;
              const old = typeof f?.old === "string" ? f.old : "";
              const neu = typeof f?.new === "string" ? f.new : "";
              return {
                path,
                op,
                ...(created !== undefined ? { created } : {}),
                ...(old ? { old } : {}),
                ...(neu ? { new: neu } : {}),
              };
            })
            .filter((f) => f.path && !f.path.endsWith("/"))
        : [];
      return { type: "file_refs" as const, files };
    }
    return p;
  });
}

function normalizeTracePart(trace: TracePart): TracePart {
  return {
    ...trace,
    type: "trace",
    children: (trace.children || []).map(normalizeTracePart),
    steps: trace.steps || [],
    awaitingChildren: Boolean(trace.awaitingChildren),
    startedAt: trace.startedAt,
    endedAt: trace.endedAt,
  };
}

export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    let parts = normalizeMessageParts(m.parts);
    if (
      (m.role === "ai" || m.role === "assistant") &&
      m.plan_questions?.length &&
      !parts?.some((p) => p.type === "user_choice")
    ) {
      const answered = !!m.answers?.length;
      const choice: UserChoicePart = {
        type: "user_choice",
        id: m.id || "legacy-choice",
        pending: {
          type: "user_choice",
          variant: "questions",
          message: m.content || "在继续之前，我想先确认几件事：",
          questions: m.plan_questions,
        },
        status: answered ? "answered" : "pending",
        ...(answered ? { answers: m.answers } : {}),
      };
      parts = [...(parts || []), choice];
    }
    return { ...m, parts };
  });
}

/** Deepest / latest running trace (includes internal workspace tools). */
export function findRunningTrace(traces: TracePart[]): TracePart | undefined {
  for (let i = traces.length - 1; i >= 0; i--) {
    const t = traces[i];
    if (t.children?.length) {
      const nested = findRunningTrace(t.children);
      if (nested) return nested;
    }
    if (t.status === "running" || t.awaitingChildren) return t;
  }
  return undefined;
}

/** User-facing status while the live turn is still in progress. */
export function describeLiveWorkingStatus(turn: LiveTurn): string {
  const running = findRunningTrace(turn.traces);
  if (running) {
    if (running.kind === "compaction" || running.name === "compact_context") {
      return "正在压缩上下文…";
    }
    const working = toolWorkingStatus(running.name, running.args);
    if (working) return working;
    switch (running.name) {
      case "handoff": {
        const cap =
          typeof running.args?.capability === "string"
            ? capabilityLabel(running.args.capability)
            : "";
        return cap ? `${cap} 工作中…` : "领域能力执行中…";
      }
      case "suggest_mode":
      case "ask_user":
        return "等待确认…";
      case "propose_rule":
        return "正在出示 Rule Proposal…";
      default:
        if (running.awaitingChildren) return "等待子任务完成…";
        return `正在调用 ${running.name.replace(/_/g, " ")}…`;
    }
  }

  // Called only while the turn is in flight. After preamble text, the model may
  // spend a long time emitting a tool call (or waiting for the next tokens)
  // with no running trace yet — that still needs a spinner.
  return "正在思考…";
}

export function traceLabel(
  name: string,
  args?: Record<string, unknown>,
  status?: TraceStatus,
  result?: string,
): string {
  if (name === "handoff") {
    const cap = typeof args?.capability === "string" ? args.capability : "";
    const label = cap ? capabilityLabel(cap) : "Agent";
    const task =
      typeof args?.task === "string"
        ? args.task.trim()
        : typeof (args?.task_spec as { goal?: string } | undefined)?.goal === "string"
          ? String((args?.task_spec as { goal?: string }).goal).trim()
          : "";
    if (task) return task.length > 72 ? `${task.slice(0, 72)}…` : task;
    if (status === "running") return `${label} 执行中…`;
    return label;
  }
  if (name === "route") {
    const route = args?.route as string | undefined;
    return route ? `路由到 ${route}` : "编排路由";
  }
  if (name === "ask_user" || name === "suggest_mode") {
    if (status === "running") return "等待确认…";
    const intro = typeof args?.message === "string" ? args.message.trim() : "";
    return intro || "澄清问题";
  }
  return toolTitle(name, args, status, result);
}

const EXPLORE_TOOLS = new Set([
  "workspace_list",
  "workspace_read",
  "workspace_grep",
  "conversation_get_summary",
]);
const EDIT_TOOLS = new Set([
  "workspace_write",
  "workspace_patch",
  "workspace_search_replace",
  "workspace_delete",
]);

export interface TraceWorkStats {
  explored: number;
  edited: number;
  thoughtSeconds: number | null;
  activities: string[];
}

function walkTraces(traces: TracePart[], visit: (t: TracePart) => void) {
  for (const t of traces) {
    visit(t);
    if (t.children?.length) walkTraces(t.children, visit);
  }
}

/** Cursor-style Explored / Edited / Thought stats from a handoff tree. */
export function summarizeTraceWork(trace: TracePart, nowMs = Date.now()): TraceWorkStats {
  let explored = 0;
  let edited = 0;
  const activities: string[] = [];
  walkTraces(trace.children || [], (t) => {
    if (t.kind === "tool" || EXPLORE_TOOLS.has(t.name) || EDIT_TOOLS.has(t.name)) {
      if (EXPLORE_TOOLS.has(t.name)) explored += 1;
      if (EDIT_TOOLS.has(t.name)) edited += 1;
      const line = traceLabel(t.name, t.args, t.status, t.result);
      if (line && !activities.includes(line)) activities.push(line);
    }
  });

  let thoughtSeconds: number | null = null;
  const start = trace.startedAt ? Date.parse(trace.startedAt) : NaN;
  if (!Number.isNaN(start)) {
    const end = trace.endedAt
      ? Date.parse(trace.endedAt)
      : trace.status === "running" || trace.awaitingChildren
        ? nowMs
        : NaN;
    if (!Number.isNaN(end) && end >= start) {
      thoughtSeconds = Math.max(1, Math.round((end - start) / 1000));
    }
  }

  return { explored, edited, thoughtSeconds, activities };
}

/** Human-readable prompt the orchestrator sent to the subagent. */
export function formatHandoffPrompt(trace: TracePart): string {
  const args = trace.args || {};
  const spec =
    args.task_spec && typeof args.task_spec === "object"
      ? (args.task_spec as Record<string, unknown>)
      : {};
  const goal =
    (typeof spec.goal === "string" && spec.goal.trim()) ||
    (typeof args.task === "string" && args.task.trim()) ||
    "";
  const lines: string[] = [];
  if (goal) lines.push(goal);

  const constraints = Array.isArray(spec.constraints)
    ? spec.constraints.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (constraints.length) {
    lines.push("", "约束：");
    for (const c of constraints) lines.push(`- ${c}`);
  }
  const focus = Array.isArray(spec.focus)
    ? spec.focus.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (focus.length) {
    lines.push("", `关注：${focus.join("、")}`);
  }
  const notes =
    (typeof spec.context_notes === "string" && spec.context_notes.trim()) ||
    (typeof args.reason === "string" && args.reason.trim()) ||
    "";
  if (notes) {
    lines.push("", notes);
  }
  return lines.join("\n").trim();
}

/** Subagent reply / work summary (not the dispatch task). */
export function formatHandoffReply(trace: TracePart): string {
  if (trace.status === "running" || trace.awaitingChildren) return "";
  const prompt = formatHandoffPrompt(trace);
  const result = (trace.result || "").trim();
  if (!result) return "";
  // Early handoff cards stash the task into result; don't repeat it as the reply.
  if (result === prompt || result === (typeof trace.args?.task === "string" ? trace.args.task : "")) {
    return "";
  }
  return result;
}
