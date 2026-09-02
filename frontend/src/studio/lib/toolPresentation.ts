import type { FileRef, TracePart, TraceStatus } from "../../types";

export type ToolPreview = { old?: string; new?: string };

export interface ToolFriendlyDetails {
  files: FileRef[];
  lines: string[];
  preview: ToolPreview | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseToolJson(raw: string | undefined): unknown {
  const text = (raw || "").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function formatToolJson(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function pathArg(args?: Record<string, unknown>): string {
  if (!args) return "";
  for (const key of ["path", "ref"]) {
    const v = args[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function writeFilesFromArgs(args?: Record<string, unknown>): FileRef[] {
  const files = args?.files;
  if (!Array.isArray(files)) return [];
  const out: FileRef[] = [];
  for (const item of files) {
    const rec = asRecord(item);
    const path = typeof rec?.path === "string" ? rec.path.trim() : "";
    if (path) out.push({ path, op: "write" });
  }
  return out;
}

function writeFilesFromResult(parsed: unknown): FileRef[] {
  const rec = asRecord(parsed);
  const results = rec?.results;
  if (!Array.isArray(results)) return [];
  const out: FileRef[] = [];
  for (const item of results) {
    const row = asRecord(item);
    const path = typeof row?.path === "string" ? row.path.trim() : "";
    if (path) out.push({ path, op: "write", created: row?.created === true });
  }
  return out;
}

function deletePathsFromArgs(args?: Record<string, unknown>): string[] {
  const paths = args?.paths;
  if (Array.isArray(paths)) {
    return paths.map((p) => String(p || "").trim()).filter(Boolean);
  }
  if (typeof args?.path === "string" && args.path.trim()) return [args.path.trim()];
  return [];
}

function deleteFilesFromResult(parsed: unknown): FileRef[] {
  const rec = asRecord(parsed);
  const results = rec?.results;
  if (!Array.isArray(results)) return [];
  const out: FileRef[] = [];
  for (const item of results) {
    const row = asRecord(item);
    const path = typeof row?.path === "string" ? row.path.trim() : "";
    if (path) out.push({ path, op: "delete" });
  }
  return out;
}

export function writeFileCount(args?: Record<string, unknown>, result?: string): number {
  const parsed = parseToolJson(result);
  const rec = asRecord(parsed);
  if (typeof rec?.count === "number" && rec.count > 0) return rec.count;
  const fromResult = writeFilesFromResult(parsed);
  if (fromResult.length) return fromResult.length;
  return writeFilesFromArgs(args).length;
}

export function deleteFileCount(args?: Record<string, unknown>, result?: string): number {
  const parsed = parseToolJson(result);
  const rec = asRecord(parsed);
  if (typeof rec?.count === "number" && rec.count > 0) return rec.count;
  const fromResult = deleteFilesFromResult(parsed);
  if (fromResult.length) return fromResult.length;
  return deletePathsFromArgs(args).length;
}

function collectPaths(value: unknown, into: string[]) {
  if (typeof value === "string" && value.trim() && value.includes(".")) {
    const text = value.trim();
    if (text.length < 200 && !text.includes("\n")) into.push(text);
    return;
  }
  const rec = asRecord(value);
  if (rec) {
    if (typeof rec.path === "string" && rec.path.trim()) into.push(rec.path.trim());
    for (const nested of Object.values(rec)) collectPaths(nested, into);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, into);
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

export function toolTitle(
  name: string,
  args?: Record<string, unknown>,
  status?: TraceStatus,
  result?: string,
): string {
  const parsed = parseToolJson(result);
  const rec = asRecord(parsed);
  const path = pathArg(args) || (typeof rec?.path === "string" ? rec.path.trim() : "");

  if (name === "workspace_write") {
    const n = writeFileCount(args, result);
    if (n <= 0) return "写了工作区";
    if (n === 1) {
      const files = writeFilesFromResult(parsed);
      const one = files[0]?.path || writeFilesFromArgs(args)[0]?.path || path;
      return one ? `写了 ${one}` : "写了 1 个文件";
    }
    return `写了 ${n} 个文件`;
  }

  if (name === "workspace_search_replace") {
    return path ? `编辑了 ${path}` : "编辑了文件";
  }

  if (name === "workspace_delete") {
    const n = deleteFileCount(args, result);
    if (n <= 0) return "删除了文件";
    if (n === 1) {
      const files = deleteFilesFromResult(parsed);
      const one = files[0]?.path || deletePathsFromArgs(args)[0] || path;
      return one ? `删除了 ${one}` : "删除了 1 个文件";
    }
    return `删除了 ${n} 个文件`;
  }

  if (name === "workspace_read") return path ? `读了 ${path}` : "读了工作区";
  if (name === "workspace_list") return path ? `列出了 ${path}` : "列出了工作区";
  if (name === "workspace_grep") return path ? `搜索了 ${path}` : "搜索了工作区";

  if (name === "write_plan" || name === "update_plan") {
    if (status && status !== "running" && result?.trim()) return result.trim();
    return name === "update_plan" ? "正在修改 plan…" : "正在撰写 plan…";
  }

  if (name === "conversation_get_summary") return "读取了对话摘要";

  if (name === "workspace_patch") {
    return path ? `编辑了 ${path}` : "编辑了文件";
  }

  const pretty = name.replace(/_/g, " ").trim();
  return pretty ? `调用了 ${pretty}` : "调用了工具";
}

export function toolWorkingStatus(name: string, args?: Record<string, unknown>): string | null {
  const path = pathArg(args);
  switch (name) {
    case "workspace_read":
      return path ? `正在阅读 ${path}…` : "正在阅读工作区…";
    case "workspace_list":
      return path ? `正在浏览 ${path}…` : "正在浏览工作区…";
    case "workspace_grep":
      return path ? `正在搜索 ${path}…` : "正在搜索工作区…";
    case "conversation_get_summary":
      return "正在读取压缩后的上下文…";
    case "workspace_write": {
      const n = writeFileCount(args);
      if (n > 1) return `正在写入 ${n} 个文件…`;
      if (n === 1) {
        const one = writeFilesFromArgs(args)[0]?.path || path;
        return one ? `正在写入 ${one}…` : "正在写入工作区…";
      }
      return "正在写入工作区…";
    }
    case "workspace_delete": {
      const n = deleteFileCount(args);
      if (n > 1) return `正在删除 ${n} 个文件…`;
      if (n === 1) {
        const one = deletePathsFromArgs(args)[0] || path;
        return one ? `正在删除 ${one}…` : "正在删除文件…";
      }
      return "正在删除文件…";
    }
    case "workspace_search_replace":
    case "workspace_patch":
      return path ? `正在更新 ${path}…` : "正在更新工作区…";
    case "write_plan":
      return "正在撰写 plan…";
    case "update_plan":
      return "正在修改 plan…";
    default:
      return null;
  }
}

export function toolFriendlyDetails(
  name: string,
  args?: Record<string, unknown>,
  result?: string,
): ToolFriendlyDetails {
  const parsed = parseToolJson(result);
  const rec = asRecord(parsed);
  const path = pathArg(args) || (typeof rec?.path === "string" ? rec.path.trim() : "");
  const empty: ToolFriendlyDetails = { files: [], lines: [], preview: null };

  if (name === "workspace_write") {
    const files = writeFilesFromResult(parsed);
    return { files: files.length ? files : writeFilesFromArgs(args), lines: [], preview: null };
  }

  if (name === "workspace_delete") {
    const files = deleteFilesFromResult(parsed);
    if (files.length) return { files, lines: [], preview: null };
    return {
      files: deletePathsFromArgs(args).map((p) => ({ path: p, op: "delete" as const })),
      lines: [],
      preview: null,
    };
  }

  if (name === "workspace_search_replace" || name === "workspace_patch") {
    const old = typeof rec?.old === "string" ? rec.old : typeof args?.old === "string" ? args.old : "";
    const neu = typeof rec?.new === "string" ? rec.new : typeof args?.new === "string" ? args.new : "";
    const filePath = path || (typeof rec?.path === "string" ? rec.path : "");
    return {
      files: filePath ? [{ path: filePath, op: "search_replace", old, new: neu }] : [],
      lines: [],
      preview: old || neu ? { old, new: neu } : null,
    };
  }

  if (name === "workspace_read") {
    if (typeof rec?.message === "string" && rec.message.trim()) {
      return { ...empty, lines: [rec.message.trim()] };
    }
    return { ...empty, lines: [path ? `已读取 ${path}` : "已读取工作区"] };
  }

  if (name === "workspace_list") {
    const count = typeof rec?.count === "number" ? rec.count : Array.isArray(rec?.entries) ? rec.entries.length : 0;
    const scope = path || "工作区";
    return { ...empty, lines: [count > 0 ? `列出了 ${scope} 下 ${count} 项` : `已列出 ${scope}`] };
  }

  if (name === "workspace_grep") {
    const count = typeof rec?.count === "number" ? rec.count : Array.isArray(rec?.matches) ? rec.matches.length : 0;
    return { ...empty, lines: [count > 0 ? `找到 ${count} 处` : "没有匹配"] };
  }

  if (name === "write_plan" || name === "update_plan") {
    return { ...empty, lines: ["已写入右侧 plan"] };
  }

  if (name === "conversation_get_summary") {
    return { ...empty, lines: ["已读取对话摘要"] };
  }

  const guessed: string[] = [];
  collectPaths(args, guessed);
  collectPaths(parsed, guessed);
  const paths = uniquePaths(guessed);
  if (paths.length) {
    return { files: paths.map((p) => ({ path: p })), lines: [], preview: null };
  }
  return { ...empty, lines: ["见详情"] };
}

export function hasFriendlyBody(details: ToolFriendlyDetails): boolean {
  return details.files.length > 0 || details.lines.length > 0 || !!details.preview;
}

export function toolTitleFromTrace(trace: Pick<TracePart, "name" | "args" | "status" | "result">): string {
  return toolTitle(trace.name, trace.args, trace.status, trace.result);
}
