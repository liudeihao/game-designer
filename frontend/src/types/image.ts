/** Shared image-generation provider types (independent from text LLM). */

export interface ImageModelSpec {
  id: string;
  label: string;
}

export interface ImageAdapterInfo {
  id: string;
  label: string;
  base_url_hint: string;
  model_hint: string;
  auth_hint: string;
}

export interface ImageProviderPublic {
  id: string;
  label: string;
  adapter?: string;
  base_url: string;
  api_key_set: boolean;
  models: ImageModelSpec[];
}

export interface ImageCatalogEntry {
  key: string;
  provider_id: string;
  model: string;
  label: string;
}

export interface ImageConfigPublic {
  providers: ImageProviderPublic[];
  catalog: ImageCatalogEntry[];
  adapters?: ImageAdapterInfo[];
  active_provider_id: string;
  model: string;
  api_key_set: boolean;
}

export type ImageProviderDraft = {
  id: string;
  label: string;
  adapter: string;
  base_url: string;
  api_key: string;
  api_key_set: boolean;
  models: ImageModelSpec[];
};

export const AUTO_ADAPTER = "auto";

export const FALLBACK_ADAPTERS: ImageAdapterInfo[] = [
  {
    id: "openai",
    label: "OpenAI 兼容",
    base_url_hint: "https://api.openai.com/v1",
    model_hint: "gpt-image-1",
    auth_hint: "Bearer sk-…",
  },
  {
    id: "fal",
    label: "fal.ai",
    base_url_hint: "https://fal.run",
    model_hint: "fal-ai/flux/schnell",
    auth_hint: "Authorization: Key …",
  },
];

export function emptyImageModel(id: string): ImageModelSpec {
  return { id, label: "" };
}

export function asImageModel(raw: string | ImageModelSpec | null | undefined): ImageModelSpec | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const id = raw.trim();
    return id ? emptyImageModel(id) : null;
  }
  const id = (raw.id || "").trim();
  if (!id) return null;
  return { id, label: raw.label || "" };
}

export function inferImageAdapter(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host.includes("fal.ai") || host.includes("fal.run")) return "fal";
  } catch {
    /* ignore invalid URL */
  }
  return "openai";
}

export function adapterLabel(adapter: string, adapters: ImageAdapterInfo[]): string {
  const id = (adapter || "").trim();
  if (!id || id === AUTO_ADAPTER) return "自动识别";
  return adapters.find((item) => item.id === id)?.label ?? id;
}

export function hintsForAdapter(
  adapter: string,
  baseUrl: string,
  adapters: ImageAdapterInfo[],
): ImageAdapterInfo | undefined {
  const id = (adapter || "").trim() && adapter !== AUTO_ADAPTER ? adapter : inferImageAdapter(baseUrl);
  return adapters.find((item) => item.id === id) ?? adapters[0];
}
