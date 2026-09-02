/** Shared LLM config types for multi-provider model catalog. */

export interface ModelSpec {
  id: string;
  label: string;
  /** 0 = use the backend preset / default. */
  context_window: number;
  /** 0 = use the backend preset / default. */
  max_output_tokens: number;
}

export interface LLMProviderPublic {
  id: string;
  label: string;
  base_url: string;
  api_key_set: boolean;
  models: ModelSpec[];
}

export interface LLMCatalogEntry {
  key: string;
  provider_id: string;
  model: string;
  label: string;
  context_window?: number;
  max_output_tokens?: number;
}

export interface LLMConfigPublic {
  providers: LLMProviderPublic[];
  catalog: LLMCatalogEntry[];
  active_provider_id: string;
  model: string;
  utility_provider_id: string;
  utility_model: string;
  api_key_set: boolean;
  available_models: string[];
  base_url: string;
}

export type ProviderDraft = {
  id: string;
  label: string;
  base_url: string;
  /** Empty = keep existing key; non-empty = replace */
  api_key: string;
  api_key_set: boolean;
  models: ModelSpec[];
};

export function emptyModelSpec(id: string): ModelSpec {
  return { id, label: "", context_window: 0, max_output_tokens: 0 };
}

export function asModelSpec(raw: string | ModelSpec | null | undefined): ModelSpec | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const id = raw.trim();
    return id ? emptyModelSpec(id) : null;
  }
  const id = (raw.id || "").trim();
  if (!id) return null;
  return {
    id,
    label: raw.label || "",
    context_window: Number(raw.context_window) || 0,
    max_output_tokens: Number(raw.max_output_tokens) || 0,
  };
}
