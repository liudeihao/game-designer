/** Shared image-generation provider types (independent from text LLM). */

export interface ImageModelSpec {
  id: string;
  label: string;
}

export interface ImageProviderPublic {
  id: string;
  label: string;
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
  active_provider_id: string;
  model: string;
  api_key_set: boolean;
}

export type ImageProviderDraft = {
  id: string;
  label: string;
  base_url: string;
  api_key: string;
  api_key_set: boolean;
  models: ImageModelSpec[];
};

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
