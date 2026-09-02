/** Display helpers for optional provenance labels on decisions. */

export function stageLabel(stageId: string, display?: string): string {
  return (display || stageId || "").trim();
}
