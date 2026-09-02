import type {
  ActivityEntry,
  AgentRun,
  ChatMessage,
  Conversation,
  ConversationMode,
  LiveTurn,
  PendingInterrupt,
  PlanStatus,
  RuntimeEvent,
  StreamFrame,
  StreamFrameType,
  TraceEndEvent,
  TraceStartEvent,
  UsageScopes,
  WorkspaceSnapshot,
} from "../types";
import { attachEventsToMessages, hydratePendingChoice } from "./lib/eventsColumn";
import {
  appendLiveText,
  appendLiveTurn,
  applyActivityToTrace,
  applyPendingInterrupt,
  applyTraceEnd,
  applyTraceStart,
  emptyLiveTurn,
} from "./streamUtils";

export function emptyAgentRun(conversationId: string, turnId = ""): AgentRun {
  return {
    conversationId,
    turnId,
    status: "running",
    messages: [],
    events: [],
    live: emptyLiveTurn(),
    pending: null,
  };
}

export function statusFromSnapshot(pending: PendingInterrupt | null | undefined): AgentRun["status"] {
  return pending ? "waiting_user" : "completed";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export interface DonePayload {
  workspace?: WorkspaceSnapshot;
  activity?: ActivityEntry[];
  events?: RuntimeEvent[];
  messages?: ChatMessage[];
  pending?: PendingInterrupt | null;
  plan_markdown?: string;
  plan_title?: string;
  plan_status?: PlanStatus;
  kind?: string;
  mode?: string;
  conversation?: Conversation;
  usage?: UsageScopes;
  flush_error?: { message?: string };
  interrupted?: boolean;
}

export interface ApplyFrameExtras {
  workflowMode?: ConversationMode;
}

function hasLiveBody(live: LiveTurn | undefined): boolean {
  if (!live) return false;
  return Boolean(
    live.text ||
      live.blocks?.length ||
      live.choices?.length ||
      live.ruleProposals?.length ||
      live.permissions?.length,
  );
}

const PLAN_BUBBLE_SUMMARY = "已更新右侧 plan，可继续讨论或点击「执行计划」。";

/** Plan bodies belong in the Plan panel; the chat keeps a one-line pointer. */
function summarizePlanBubble(message: ChatMessage, planMarkdown: string): ChatMessage {
  if (message.role !== "ai" || !planMarkdown) return message;
  if ((message.parts || []).some((part) => part.type === "user_choice")) return message;
  const content = message.content || "";
  if (
    content.length > 350 &&
    (content.includes("# ") || content.includes("## ")) &&
    (content.includes("愿景") || content.includes("核心循环") || content.includes("计划"))
  ) {
    return {
      ...message,
      content: PLAN_BUBBLE_SUMMARY,
      parts: message.parts?.map((part) =>
        part.type === "text" ? { ...part, content: PLAN_BUBBLE_SUMMARY } : part,
      ),
    };
  }
  return message;
}

export function applyFrame(
  run: AgentRun,
  frame: StreamFrame,
  _extras?: ApplyFrameExtras,
): AgentRun {
  const turnId = frame.turn_id || run.turnId;
  const live0 = run.live ?? emptyLiveTurn();
  const next: AgentRun = {
    ...run,
    turnId,
    // The bubble this turn folds into is keyed by turn id, not by arrival order.
    live: live0.turnId === turnId ? live0 : { ...live0, turnId },
  };
  switch (frame.type) {
    case "token": {
      const text = String(asRecord(frame.data).text ?? "");
      return {
        ...next,
        status: "running",
        live: appendLiveText(next.live ?? emptyLiveTurn(), text),
      };
    }
    case "reasoning": {
      const text = String(asRecord(frame.data).text ?? "");
      const live = next.live ?? emptyLiveTurn();
      return {
        ...next,
        status: "running",
        live: { ...live, reasoning: live.reasoning + text },
      };
    }
    case "trace_start":
      return {
        ...next,
        status: "running",
        live: applyTraceStart(next.live ?? emptyLiveTurn(), frame.data as TraceStartEvent),
      };
    case "trace_end":
      return {
        ...next,
        status: "running",
        live: applyTraceEnd(next.live ?? emptyLiveTurn(), frame.data as TraceEndEvent),
      };
    case "activity":
      return {
        ...next,
        live: applyActivityToTrace(next.live ?? emptyLiveTurn(), frame.data as ActivityEntry),
      };
    case "pending": {
      const pending = frame.data as PendingInterrupt;
      return {
        ...next,
        status: "waiting_user",
        pending,
        live: applyPendingInterrupt(next.live ?? emptyLiveTurn(), pending),
      };
    }
    case "error":
      return { ...next, status: "error" };
    case "done": {
      const data = (frame.data || {}) as DonePayload;
      const live = next.live ?? emptyLiveTurn();
      const pending = data.pending ?? null;
      const incomingEvents = data.events ?? next.events;
      let messages = next.messages;
      if (hasLiveBody(live) || incomingEvents?.length || pending) {
        messages = hydratePendingChoice(
          attachEventsToMessages(appendLiveTurn(messages, live), incomingEvents),
          pending,
        );
      } else if (data.messages?.length) {
        messages = data.messages;
      }
      const planMarkdown = (data.plan_markdown || "").trim();
      if (planMarkdown && messages.length) {
        const last = messages[messages.length - 1];
        const summarized = summarizePlanBubble(last, planMarkdown);
        if (summarized !== last) messages = [...messages.slice(0, -1), summarized];
      }
      if (data.interrupted && messages.length) {
        const last = messages[messages.length - 1];
        if (last.role === "ai" || last.role === "assistant") {
          messages = [...messages.slice(0, -1), { ...last, interrupted: true }];
        }
      }
      return {
        ...next,
        status: pending ? "waiting_user" : "completed",
        messages,
        events: incomingEvents,
        pending,
        live: undefined,
      };
    }
    default:
      return next;
  }
}

export function unwrapStreamFrame(
  event: string,
  parsed: unknown,
): { frame?: StreamFrame; payload: unknown } {
  if (!parsed || typeof parsed !== "object") {
    return { payload: parsed };
  }
  const obj = parsed as Record<string, unknown>;
  const type = obj.type;
  const data = obj.data;
  const turnId = obj.turn_id;
  if (
    typeof type === "string" &&
    type === event &&
    turnId != null &&
    "data" in obj
  ) {
    const frame: StreamFrame = {
      id: String(obj.id ?? ""),
      turn_id: String(turnId),
      type: type as StreamFrameType,
      ts: typeof obj.ts === "number" ? obj.ts : 0,
      data,
    };
    return { frame, payload: data };
  }
  return { payload: parsed };
}
