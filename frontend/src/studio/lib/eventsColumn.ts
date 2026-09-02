import type {
  ChatMessage,
  LiveBlock,
  PendingInterrupt,
  RuleOperation,
  RuleProposalPart,
  RuleScope,
  RuntimeEvent,
  RuntimeUserChoiceEvent,
  ToolCallEvent,
  ToolPermissionEvent,
  ToolResultEvent,
  TracePart,
  TraceStatus,
  UserChoicePart,
  PermissionPart,
} from "../../types";

function isHuman(message: ChatMessage): boolean {
  return message.role === "human";
}

function isAi(message: ChatMessage): boolean {
  return message.role === "ai" || message.role === "assistant";
}

function eventKey(event: RuntimeEvent): string {
  return `${event.type}:${"id" in event ? event.id : ""}`;
}

function choiceRank(status: string | undefined): number {
  if (status === "answered" || status === "dismissed") return 2;
  if (status === "pending") return 1;
  return 0;
}

function ruleRank(status: string | undefined): number {
  if (status === "accepted" || status === "ignored") return 2;
  if (status === "pending") return 1;
  return 0;
}

function shouldReplaceEvent(prev: RuntimeEvent, next: RuntimeEvent): boolean {
  if (prev.type === "user_choice" && next.type === "user_choice") {
    return choiceRank(next.status) >= choiceRank(prev.status);
  }
  if (prev.type === "rule_proposal" && next.type === "rule_proposal") {
    return ruleRank(next.status) >= ruleRank(prev.status);
  }
  if (prev.type === "tool_permission" && next.type === "tool_permission") {
    return next.status !== "pending" || prev.status === "pending";
  }
  return true;
}

function upsertEvent(list: RuntimeEvent[], event: RuntimeEvent): RuntimeEvent[] {
  const key = eventKey(event);
  const idx = list.findIndex((item) => eventKey(item) === key);
  if (idx < 0) return [...list, event];
  if (!shouldReplaceEvent(list[idx], event)) return list;
  const out = [...list];
  out[idx] = event;
  return out;
}

function questionIds(questions: unknown): string {
  if (!Array.isArray(questions)) return "";
  return questions
    .map((item) => (item && typeof item === "object" && "id" in item ? String((item as { id?: unknown }).id || "") : ""))
    .filter(Boolean)
    .join("\0");
}

function findEventOwner(messages: ChatMessage[], event: RuntimeEvent): number {
  if (event.type === "user_choice") {
    const qids = questionIds((event.pending as { questions?: unknown } | undefined)?.questions);
    for (let i = 0; i < messages.length; i++) {
      if (!isAi(messages[i])) continue;
      if ((messages[i].events || []).some((item) => item.type === "user_choice" && item.id === event.id)) {
        return i;
      }
      if (
        (messages[i].parts || []).some((part) => {
          if (part.type !== "user_choice") return false;
          if (part.id === event.id) return true;
          return !!qids && questionIds((part.pending as { questions?: unknown } | undefined)?.questions) === qids;
        })
      ) {
        return i;
      }
      if (qids && questionIds(messages[i].plan_questions) === qids) return i;
    }
  } else if ("id" in event) {
    for (let i = 0; i < messages.length; i++) {
      if ((messages[i].events || []).some((item) => "id" in item && item.id === event.id)) return i;
    }
  }

  let humans = 0;
  const lastAiByHuman = new Map<number, number>();
  messages.forEach((message, index) => {
    if (isHuman(message)) humans += 1;
    if (isAi(message)) lastAiByHuman.set(humans, index);
  });
  const turn = typeof event.after_human === "number" && event.after_human > 0 ? event.after_human : humans || 1;
  const hit = lastAiByHuman.get(turn);
  if (hit !== undefined) return hit;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isAi(messages[i])) return i;
  }
  return -1;
}

function syncChoiceParts(message: ChatMessage, event: RuntimeEvent): ChatMessage {
  if (event.type !== "user_choice") return message;
  const parts = message.parts;
  if (!parts?.length) return message;
  const qids = questionIds((event.pending as { questions?: unknown } | undefined)?.questions);
  let changed = false;
  const next = parts.map((part) => {
    if (part.type !== "user_choice") return part;
    const match =
      part.id === event.id ||
      (!!qids && questionIds((part.pending as { questions?: unknown } | undefined)?.questions) === qids);
    if (!match) return part;
    if (choiceRank(event.status) < choiceRank(part.status)) return part;
    changed = true;
    return {
      ...part,
      id: event.id || part.id,
      status: event.status,
      answers: Array.isArray(event.answers) ? event.answers : part.answers,
    };
  });
  return changed ? { ...message, parts: next } : message;
}

function syncRuleParts(message: ChatMessage, event: RuntimeEvent): ChatMessage {
  if (event.type !== "rule_proposal") return message;
  const parts = message.parts;
  if (!parts?.length) return message;
  let changed = false;
  const next = parts.map((part) => {
    if (part.type !== "rule_proposal" || part.id !== event.id) return part;
    if (ruleRank(event.status) < ruleRank(part.status)) return part;
    changed = true;
    return {
      ...part,
      status: event.status,
      scope: event.scope,
      operation: asOperation(event.operation),
      name: event.name || part.name,
      details: event.details || event.text || part.details,
    };
  });
  return changed ? { ...message, parts: next } : message;
}

/** Hang Events on the owning Agent bubble. Same id is replaced, not stacked. */
export function attachEventsToMessages(
  messages: ChatMessage[],
  events: RuntimeEvent[] | undefined,
): ChatMessage[] {
  if (!events?.length) return messages.map((m) => ({ ...m }));

  const out: ChatMessage[] = messages.map((m) => ({
    ...m,
    events: m.events ? [...m.events] : undefined,
  }));
  for (const event of events) {
    const owner = findEventOwner(out, event);
    if (owner >= 0) {
      const current = out[owner];
      const withEvent = { ...current, events: upsertEvent(current.events || [], event) };
      out[owner] = syncRuleParts(syncChoiceParts(withEvent, event), event);
      continue;
    }
    out.push({
      id: `events-${event.type}-${"id" in event ? event.id : out.length}`,
      role: "ai",
      content: "",
      events: [event],
    });
  }
  return out;
}

export function hydratePendingChoice(
  messages: ChatMessage[],
  pending: PendingInterrupt | null,
): ChatMessage[] {
  if (!pending) return messages;
  if (pending.type === "tool_permission") {
    const hasPending = messages.some((m) =>
      (m.events || []).some((e) => e.type === "tool_permission" && e.status === "pending"),
    );
    if (hasPending) return messages;
    const event: ToolPermissionEvent = {
      type: "tool_permission",
      id: pending.calls[0]?.id || "pending-permission",
      status: "pending",
      pending,
    };
    const out = [...messages];
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].role === "ai" || out[i].role === "assistant") {
        out[i] = { ...out[i], events: [...(out[i].events || []), event] };
        return out;
      }
    }
    return [...out, { id: "pending-permission", role: "ai", content: "", events: [event] }];
  }
  const hasPending = messages.some((m) =>
    (m.events || []).some((e) => e.type === "user_choice" && e.status === "pending"),
  );
  if (hasPending) return messages;
  const event: RuntimeUserChoiceEvent = {
    type: "user_choice",
    id: "pending-choice",
    status: "pending",
    pending,
  };
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "ai" || out[i].role === "assistant") {
      out[i] = { ...out[i], events: [...(out[i].events || []), event] };
      return out;
    }
  }
  return [...out, { id: "pending-choice", role: "ai", content: "", events: [event] }];
}

function traceCard(
  id: string,
  call: ToolCallEvent | undefined,
  result: ToolResultEvent | undefined,
  permission: ToolPermissionEvent | undefined,
): TracePart {
  let status: TraceStatus = "running";
  if (result?.outcome === "success") status = "success";
  else if (result?.outcome === "error") status = "error";
  else if (result?.outcome === "reject" || result?.outcome === "comment") status = "warning";
  else if (permission?.status === "pending") status = "running";
  return {
    type: "trace",
    id,
    agent: "",
    name: call?.name || "tool",
    kind: "tool",
    status,
    args: call?.input,
    result: result?.outcome === "success" ? result.content : undefined,
    error:
      result && result.outcome !== "success"
        ? result.content
        : permission?.status === "pending"
          ? "等待 Tool Permission"
          : undefined,
  };
}

export type EventCard = TracePart | UserChoicePart | RuleProposalPart | PermissionPart;

export type EventColumnItem = EventCard | { type: "preamble" };

function isUserFacingCard(card: EventCard): boolean {
  return card.type === "user_choice" || card.type === "rule_proposal" || card.type === "tool_permission";
}

function isLiveUserCard(block: LiveBlock): boolean {
  return block.type === "user_choice" || block.type === "rule_proposal" || block.type === "tool_permission";
}

/**
 * Streaming records the tool before the intro tokens. The chat still wants
 * intro above User Choice / Rule cards — same layout as `columnItemsFromEvents`.
 */
export function orderLiveBlocksForDisplay(blocks: LiveBlock[]): LiveBlock[] {
  if (!blocks.some(isLiveUserCard)) return blocks;
  const intros = blocks.filter((block) => block.type === "text");
  if (!intros.length) return blocks;
  const rest = blocks.filter((block) => block.type !== "text");
  const cardAt = rest.findIndex(isLiveUserCard);
  return [...rest.slice(0, cardAt), ...intros, ...rest.slice(cardAt)];
}

/**
 * `ask_user.message` is a chat intro. Place assistant preamble immediately
 * before the first User Choice / Rule card so intro comes before questions.
 * Tool traces stay above that preamble. No user-facing card → preamble last
 * (reply after work).
 */
export function columnItemsFromEvents(
  events: RuntimeEvent[],
  hasPreamble: boolean,
): EventColumnItem[] {
  const cards = cardsFromEvents(events);
  if (!hasPreamble) return cards;
  const idx = cards.findIndex(isUserFacingCard);
  if (idx < 0) return [...cards, { type: "preamble" }];
  return [...cards.slice(0, idx), { type: "preamble" }, ...cards.slice(idx)];
}

/**
 * Project the Event log into chat cards. Cards keep the order their events were
 * recorded in, so the column reads the way the turn actually ran.
 */
export function cardsFromEvents(events: RuntimeEvent[]): EventCard[] {
  const results = new Map<string, ToolResultEvent>();
  const permissions = new Map<string, ToolPermissionEvent>();
  for (const event of events) {
    if (event.type === "tool_result") results.set(event.id, event);
    else if (event.type === "tool_permission") permissions.set(event.id, event);
  }

  // Map insertion order = first sighting; later events refresh in place.
  const cards = new Map<string, EventCard>();
  for (const event of events) {
    if (event.type === "tool_call" || event.type === "tool_result") {
      const key = `tool:${event.id}`;
      const call = event.type === "tool_call" ? event : undefined;
      const prev = cards.get(key);
      if (!call && prev) continue;
      cards.set(
        key,
        traceCard(event.id, call, results.get(event.id), permissions.get(event.id)),
      );
      continue;
    }
    if (event.type === "user_choice") {
      const key = `choice:${event.id}`;
      const prev = cards.get(key) as UserChoicePart | undefined;
      if (prev && choiceRank(event.status) < choiceRank(prev.status)) continue;
      cards.set(key, {
        type: "user_choice",
        id: event.id,
        pending: event.pending,
        status: event.status,
        answers: Array.isArray(event.answers)
          ? (event.answers as UserChoicePart["answers"])
          : undefined,
      });
      continue;
    }
    if (event.type === "rule_proposal") {
      const key = `rule:${event.id}`;
      const prev = cards.get(key) as RuleProposalPart | undefined;
      if (prev && ruleRank(event.status) < ruleRank(prev.status)) continue;
      cards.set(key, {
        type: "rule_proposal",
        id: event.id,
        scope: asScope(event.scope),
        operation: asOperation(event.operation),
        name: event.name || "",
        details: event.details || event.text || "",
        status: event.status,
      });
      continue;
    }
    if (event.type === "tool_permission" && event.pending?.calls?.length) {
      const key = `perm:${event.id}`;
      const prev = cards.get(key) as PermissionPart | undefined;
      if (prev && prev.status !== "pending" && event.status === "pending") continue;
      cards.set(key, {
        type: "tool_permission",
        id: event.id,
        pending: event.pending,
        status: event.status,
        comment: event.comment,
      });
    }
  }
  return [...cards.values()];
}

function asScope(value: unknown): RuleScope {
  return value === "user" ? "user" : "project";
}

function asOperation(value: unknown): RuleOperation {
  if (value === "update" || value === "delete") return value;
  if (value === "replace") return "update";
  if (value === "clear") return "delete";
  return "add";
}

