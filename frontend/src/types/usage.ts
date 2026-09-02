export interface UsageModelBreakdown {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  total_tokens: number;
  calls: number;
}

export interface UsageBucket {
  turn_id?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  total_tokens: number;
  calls: number;
  provider_calls: number;
  estimated_calls: number;
  input_breakdown: UsageInputBreakdown;
  by_model: UsageModelBreakdown[];
}

export interface UsageInputBreakdown {
  system: number;
  rules?: number;
  tools: number;
  conversation: number;
  other: number;
}

export interface ContextUsageCategory {
  id: string;
  label: string;
  tokens: number;
  color: string;
}

/** Context-window occupancy of the most recent LLM call. */
export interface ContextUsage {
  model: string;
  mode: "plan" | "ask" | null;
  context_limit: number;
  total_tokens: number;
  percent: number;
  categories: ContextUsageCategory[];
  source?: "provider" | "estimated" | "projected";
  call_id?: string;
  role?: string;
}

export interface UsageScopes {
  turn: UsageBucket;
  conversation: UsageBucket;
  project: UsageBucket;
  /** Present on streamed usage events; absent on REST aggregates. */
  context?: ContextUsage;
}

export interface UsageDayRow {
  day: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  calls: number;
}

export interface UsageProjectRow {
  project_id: string;
  project_name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  calls: number;
}

export interface UsageToolRef {
  name: string;
  tags?: string[];
}

export interface UsageRecentRow {
  id: string;
  project_id: string;
  conversation_id: string;
  turn_id: string;
  model: string;
  role: string;
  usage_source: "provider" | "estimated";
  input_breakdown: UsageInputBreakdown;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
  tags?: string[];
  tools_offered?: UsageToolRef[];
  tools_invoked?: UsageToolRef[];
}

export interface UsageAnalytics {
  totals: UsageBucket;
  by_day: UsageDayRow[];
  by_model: UsageModelBreakdown[];
  by_project: UsageProjectRow[];
  recent: UsageRecentRow[];
}

export function emptyUsageBucket(): UsageBucket {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    total_tokens: 0,
    calls: 0,
    provider_calls: 0,
    estimated_calls: 0,
    input_breakdown: { system: 0, rules: 0, tools: 0, conversation: 0, other: 0 },
    by_model: [],
  };
}

export function emptyUsageScopes(): UsageScopes {
  return {
    turn: emptyUsageBucket(),
    conversation: emptyUsageBucket(),
    project: emptyUsageBucket(),
  };
}
