import type { UsageScopes } from "./types/usage";

export interface ActivityEntry {
  ts: string;
  agent: string;
  kind: string;
  message: string;
  detail?: Record<string, unknown>;
}

export type TraceStatus = "running" | "success" | "warning" | "error";

export interface TraceStep {
  agent: string;
  kind: string;
  message: string;
  ts?: string;
}

export interface TracePart {
  type: "trace";
  id: string;
  agent: string;
  name: string;
  status: TraceStatus;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  kind?: "handoff" | "capability" | "tool" | "gate" | "plan" | "compaction";
  children?: TracePart[];
  steps?: TraceStep[];
  awaitingChildren?: boolean;
  startedAt?: string;
  endedAt?: string;
}

export interface ReasoningPart {
  type: "reasoning";
  content: string;
  collapsed?: boolean;
}

export interface TextPart {
  type: "text";
  content: string;
}

export interface FileRef {
  path: string;
  op?: "write" | "delete" | "search_replace" | string;
  created?: boolean;
  old?: string;
  new?: string;
}

export interface FileRefsPart {
  type: "file_refs";
  files: FileRef[];
}

export type UserChoiceStatus = "pending" | "answered" | "dismissed";

export interface UserChoicePart {
  type: "user_choice";
  id: string;
  pending: PendingInterrupt;
  status: UserChoiceStatus;
  answers?: AnswerItem[];
}

export type RuleScope = "user" | "project";
export type RuleOperation = "add" | "update" | "delete";
export type RuleProposalStatus = "pending" | "accepted" | "ignored";

export interface RuleItem {
  id: string;
  name: string;
  details: string;
}

export interface RuleSetPayload {
  rules: RuleItem[];
  tokens: number;
  warn: boolean;
}

export interface RuleProposalPart {
  type: "rule_proposal";
  id: string;
  scope: RuleScope;
  operation: RuleOperation;
  name: string;
  details: string;
  status: RuleProposalStatus;
}

export type PermissionStatus = "pending" | "accepted" | "rejected" | "commented";

export interface PermissionCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface PendingToolPermission {
  type: "tool_permission";
  calls: PermissionCall[];
}

export interface PermissionPart {
  type: "tool_permission";
  id: string;
  pending: PendingToolPermission;
  status: PermissionStatus;
  comment?: string;
}

export type MessagePart =
  | ReasoningPart
  | TextPart
  | TracePart
  | FileRefsPart
  | UserChoicePart
  | RuleProposalPart
  | PermissionPart;

export interface AnswerItem {
  prompt: string;
  answer: string;
}

/** One User Choice answer. Multi-select questions answer with a list of option ids. */
export type AnswerValue = string | string[];

export interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  reasoning?: string;
  parts?: MessagePart[];
  events?: RuntimeEvent[];
  kind?: "answers" | "user_choice";
  answers?: AnswerItem[];
  plan_questions?: PlanQuestion[];
  interrupted?: boolean;
}

export type LiveBlock =
  | { type: "text"; content: string }
  | { type: "trace"; id: string }
  | { type: "user_choice"; id: string }
  | { type: "rule_proposal"; id: string }
  | { type: "tool_permission"; id: string };

export interface LiveTurn {
  /** Server turn id. Identifies the chat bubble this turn folds into. */
  turnId?: string;
  reasoning: string;
  text: string;
  traces: TracePart[];
  blocks: LiveBlock[];
  reasoningDone: boolean;
  fileRefs?: FileRef[];
  choices?: UserChoicePart[];
  ruleProposals?: RuleProposalPart[];
  permissions?: PermissionPart[];
}

export interface TraceStartEvent {
  id: string;
  agent: string;
  name: string;
  args?: Record<string, unknown>;
  kind?: "handoff" | "capability" | "tool" | "gate" | "plan" | "compaction";
  ts?: string;
}

export interface TraceEndEvent {
  id: string;
  agent: string;
  status: TraceStatus;
  result?: string;
  error?: string;
  ts?: string;
}

export type ConversationMode = "plan" | "ask" | null;

export function normalizeMode(mode: string | undefined | null): ConversationMode {
  if (mode === "plan") return "plan";
  if (mode === "ask") return "ask";
  return null;
}

export type UserChoiceVariant = "questions" | "suggest_mode";

export interface PlanQuestion {
  id: string;
  prompt: string;
  options?: { id: string; label: string }[];
  allow_multiple?: boolean;
}

export interface PendingQuestion {
  type: "user_choice";
  variant?: "questions";
  message: string;
  questions: PlanQuestion[];
  agent?: string;
}

export interface PendingSuggestMode {
  type: "user_choice";
  variant?: "suggest_mode";
  mode?: ConversationMode | "agent" | "";
  message: string;
  reason?: string;
}

export type PendingInterrupt =
  | PendingQuestion
  | PendingSuggestMode
  | PendingToolPermission;

export function isPendingQuestion(p: PendingInterrupt | null): p is PendingQuestion {
  if (!p) return false;
  return (
    p.type === "user_choice" &&
    ((p as PendingQuestion).variant === "questions" ||
      Boolean((p as PendingQuestion).questions?.length))
  );
}

export function planQuestionsFromLastMessage(
  messages: ChatMessage[],
): PendingQuestion | null {
  const last = messages[messages.length - 1];
  if (last?.role !== "ai" || !last.plan_questions?.length) return null;
  return {
    type: "user_choice",
    variant: "questions",
    message: last.content || "在继续之前，我想先确认几件事：",
    questions: last.plan_questions,
  };
}

export function suggestedModeLabel(mode: string | undefined | null): string {
  if (mode === "plan") return "Plan";
  if (mode === "ask") return "Ask";
  return "Agent";
}

export function isPendingSuggestMode(p: PendingInterrupt | null): p is PendingSuggestMode {
  if (!p) return false;
  return p.type === "user_choice" && (p as PendingSuggestMode).variant === "suggest_mode";
}

export function isPendingToolPermission(
  p: PendingInterrupt | null,
): p is PendingToolPermission {
  if (!p) return false;
  return p.type === "tool_permission" && Array.isArray((p as PendingToolPermission).calls);
}

export type ToolResultOutcome = "success" | "error" | "reject" | "comment";

export interface ToolCallEvent {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
  after_human?: number;
}

export interface ToolResultEvent {
  type: "tool_result";
  id: string;
  outcome: ToolResultOutcome;
  content: string;
  after_human?: number;
}

export interface ToolPermissionEvent {
  type: "tool_permission";
  id: string;
  status: PermissionStatus;
  comment?: string;
  after_human?: number;
  pending?: PendingToolPermission;
}

export interface RuntimeUserChoiceEvent {
  type: "user_choice";
  id: string;
  status: "pending" | "answered" | "dismissed";
  pending: PendingInterrupt;
  answers?: unknown;
  after_human?: number;
}

export interface RuleProposalEvent {
  type: "rule_proposal";
  id: string;
  scope: RuleScope;
  operation: RuleOperation;
  name?: string;
  details?: string;
  /** @deprecated legacy blob field; treat as details when name/details are missing */
  text?: string;
  status: RuleProposalStatus;
  after_human?: number;
}

export type RuntimeEvent =
  | ToolCallEvent
  | ToolResultEvent
  | ToolPermissionEvent
  | RuntimeUserChoiceEvent
  | RuleProposalEvent;

export interface ProjectMeta {
  id: string;
  name: string;
  label?: string;
  created_at: string;
  updated_at: string;
  initial_plan_done?: boolean;
}

export interface ConversationFolder {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  project_id: string;
  title: string;
  mode: ConversationMode;
  plan_markdown?: string;
  plan_title?: string;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** A plan already built by Execute Plan, kept under `.studio/plans/`. */
export interface PlanArchive {
  path: string;
  title: string;
  seq: number;
  created_at: string;
}

/** `executed` means the plan was built; entering Plan again starts a new one. */
export type PlanStatus = "drafting" | "ready" | "executed";

export interface WorkspaceSnapshot {
  files: Record<string, string>;
  revs: Record<string, number>;
}

export interface ProjectSnapshot {
  project: ProjectMeta;
  workspace: WorkspaceSnapshot;
  conversations: Conversation[];
  usage?: UsageScopes;
}

export interface ConversationSnapshot {
  conversation: Conversation;
  workspace: WorkspaceSnapshot;
  activity: ActivityEntry[];
  events?: RuntimeEvent[];
  messages: ChatMessage[];
  pending: PendingInterrupt | null;
  plan_markdown?: string;
  plan_title?: string;
  plan_status?: PlanStatus;
  plan_archives?: PlanArchive[];
  plan_progress?: PlanProgress;
  usage?: UsageScopes;
}

export type StreamFrameType =
  | "token"
  | "reasoning"
  | "trace_start"
  | "trace_end"
  | "activity"
  | "pending"
  | "plan"
  | "usage"
  | "done"
  | "error";

export interface StreamFrame<T = unknown> {
  id: string;
  turn_id: string;
  type: StreamFrameType;
  ts: number;
  data: T;
}

export type AgentRunStatus = "running" | "waiting_user" | "completed" | "error";

export interface AgentRun {
  conversationId: string;
  turnId: string;
  status: AgentRunStatus;
  messages: ChatMessage[];
  events: RuntimeEvent[];
  live?: LiveTurn;
  pending?: PendingInterrupt | null;
}

export interface PlanProgressStep {
  id: string;
  title: string;
  status: "pending" | "active" | "done";
}

export interface PlanProgress {
  steps: PlanProgressStep[];
}

export type {
  ContextUsage,
  ContextUsageCategory,
  UsageAnalytics,
  UsageBucket,
  UsageDayRow,
  UsageModelBreakdown,
  UsageProjectRow,
  UsageRecentRow,
  UsageScopes,
} from "./types/usage";

export { emptyUsageBucket, emptyUsageScopes } from "./types/usage";
