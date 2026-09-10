export type IllustrationHome = "doc" | "unbound" | "draft";

export interface IllustrationRecord {
  id: string;
  prompt: string;
  extras: string;
  style_used: boolean;
  style_text: string;
  linked_doc: string | null;
  linked_rev: number | null;
  draft: boolean;
  home: IllustrationHome;
  stale: boolean;
  created_at: string;
  conversation_id?: string | null;
}

export interface IllustrationSettings {
  style_text: string;
  use_style_default: boolean;
}

export interface IllustrationCompileResult {
  prompt: string;
  extras: string;
  style_used: boolean;
  style_text: string;
  linked_doc: string | null;
  blurb: string;
  use_style: boolean;
}

export function illustrationImageUrl(projectId: string, id: string): string {
  return `/api/projects/${projectId}/illustrations/${id}/image`;
}
