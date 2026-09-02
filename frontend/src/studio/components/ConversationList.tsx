import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Conversation, ConversationFolder } from "../../types";
import { cn } from "@/lib/utils";
import { Button } from "../../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";

const EXPANDED_KEY = "gd.convListExpanded";

function loadExpanded(): boolean {
  // Default: collapsed narrow rail
  return localStorage.getItem(EXPANDED_KEY) === "1";
}

interface Props {
  conversations: Conversation[];
  folders: ConversationFolder[];
  currentId: string | null;
  pendingId: string | null;
  /** Conversation ids currently streaming (parallel tasks). */
  runningIds?: string[];
  disabled: boolean;
  createBlockedReason?: string | null;
  onSelect: (id: string) => void;
  onCreate: (folderId?: string | null) => void;
  onRename: (c: Conversation) => void;
  onDelete: (id: string) => void;
  onCreateFolder: () => void;
  onRenameFolder: (f: ConversationFolder) => void;
  onDeleteFolder: (id: string) => void;
  onMoveConversation: (c: Conversation, folderId: string | null) => void;
}

function ConvRow({
  c,
  active,
  running,
  onSelect,
  onRename,
  onDelete,
  folders,
  onMove,
}: {
  c: Conversation;
  active: boolean;
  running?: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  folders: ConversationFolder[];
  onMove: (folderId: string | null) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group mb-1 flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-150",
        active
          ? "bg-primary/12 text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {running ? (
        <span className="ws-spin size-3.5 shrink-0" aria-label="进行中" />
      ) : (
        <MessageSquare className="size-3.5 shrink-0 opacity-70" />
      )}
      <span className="min-w-0 flex-1 truncate text-[14px]">{c.title}</span>
      {running && (
        <span className="shrink-0 text-[11px] text-primary">进行中</span>
      )}
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        {folders.length > 0 && (
          <select
            className="max-w-[4.5rem] truncate rounded border-0 bg-transparent text-[11px] text-muted-foreground outline-none"
            value={c.folder_id ?? ""}
            title="移动到文件夹"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onMove(e.target.value || null);
            }}
          >
            <option value="">未分组</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="rounded p-1 hover:bg-muted"
          aria-label="重命名"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          className="rounded p-1 hover:bg-destructive/15 hover:text-destructive"
          aria-label="删除"
          disabled={running}
          onClick={(e) => {
            e.stopPropagation();
            if (running) return;
            onDelete();
          }}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function ConversationList({
  conversations,
  folders,
  currentId,
  pendingId,
  runningIds = [],
  disabled,
  createBlockedReason,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveConversation,
}: Props) {
  const busy = disabled;
  const runningSet = useMemo(() => new Set(runningIds), [runningIds]);
  const [expanded, setExpanded] = useState(loadExpanded);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, expanded ? "1" : "0");
  }, [expanded]);

  const unfiled = useMemo(
    () => conversations.filter((c) => !c.folder_id),
    [conversations],
  );

  const byFolder = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const f of folders) map.set(f.id, []);
    for (const c of conversations) {
      if (c.folder_id && map.has(c.folder_id)) {
        map.get(c.folder_id)!.push(c);
      }
    }
    return map;
  }, [conversations, folders]);

  const toggle = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleCreate = (folderId?: string | null) => {
    if (busy) return;
    onCreate(folderId);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex h-full min-h-0 shrink-0 flex-col border-r border-border/50 bg-background transition-[width] duration-200 ease-out",
          expanded ? "w-[240px]" : "w-14",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center border-b border-border/50",
            expanded
              ? "h-12 justify-between px-2.5"
              : "flex-col justify-center gap-1 px-1.5 py-2",
          )}
        >
          {expanded ? (
            <>
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setExpanded(false)}
                      aria-label="收起对话列表"
                    >
                      <PanelLeftClose className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>收起</TooltipContent>
                </Tooltip>
                <span className="px-1 text-sm font-medium text-muted-foreground">对话</span>
              </div>
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={busy}
                      onClick={onCreateFolder}
                      aria-label="新建文件夹"
                    >
                      <FolderPlus className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>新建文件夹</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      disabled={busy}
                      onClick={() => handleCreate()}
                      aria-label="新对话"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{createBlockedReason || "新对话"}</TooltipContent>
                </Tooltip>
              </div>
            </>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setExpanded(true)}
                    aria-label="展开对话列表"
                  >
                    <PanelLeftOpen className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">展开对话</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={busy}
                    onClick={() => handleCreate()}
                    aria-label="新对话"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{createBlockedReason || "新对话"}</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {expanded ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {conversations.length === 0 && folders.length === 0 && (
              <div className="px-2 py-8 text-center text-[14px] leading-relaxed text-muted-foreground">
                还没有对话。点击 + 开始设计。
              </div>
            )}

            {folders.map((f) => {
              const items = byFolder.get(f.id) ?? [];
              const open = !collapsed[f.id];
              return (
                <div key={f.id} className="mb-2">
                  <div className="group mb-0.5 flex items-center gap-1 rounded-md px-1 py-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1 text-left text-[12px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                      onClick={() => toggle(f.id)}
                    >
                      {open ? (
                        <ChevronDown className="size-3 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0" />
                      )}
                      <span className="truncate">{f.name}</span>
                      <span className="text-[11px] opacity-60">{items.length}</span>
                    </button>
                    <button
                      type="button"
                      className="hidden rounded p-1 text-muted-foreground hover:bg-muted group-hover:inline-flex"
                      aria-label="重命名文件夹"
                      onClick={() => onRenameFolder(f)}
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="hidden rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive group-hover:inline-flex"
                      aria-label="删除文件夹"
                      onClick={() => onDeleteFolder(f.id)}
                    >
                      <Trash2 className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="hidden rounded p-1 text-muted-foreground hover:bg-muted group-hover:inline-flex disabled:pointer-events-none disabled:opacity-40"
                      aria-label="在此文件夹新建对话"
                      disabled={busy}
                      title={createBlockedReason || "新对话"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCreate(f.id);
                      }}
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                  {open &&
                    items.map((c) => (
                      <ConvRow
                        key={c.id}
                        c={c}
                        active={c.id === currentId || c.id === pendingId}
                        running={runningSet.has(c.id)}
                        onSelect={() => onSelect(c.id)}
                        onRename={() => onRename(c)}
                        onDelete={() => onDelete(c.id)}
                        folders={folders}
                        onMove={(fid) => onMoveConversation(c, fid)}
                      />
                    ))}
                </div>
              );
            })}

            {(unfiled.length > 0 || folders.length > 0) && (
              <div className="mb-1 px-1 pt-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                {folders.length > 0 ? "未分组" : ""}
              </div>
            )}
            {unfiled.map((c) => (
              <ConvRow
                key={c.id}
                c={c}
                active={c.id === currentId || c.id === pendingId}
                running={runningSet.has(c.id)}
                onSelect={() => onSelect(c.id)}
                onRename={() => onRename(c)}
                onDelete={() => onDelete(c.id)}
                folders={folders}
                onMove={(fid) => onMoveConversation(c, fid)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 py-2">
            {conversations.map((c) => {
              const active = c.id === currentId || c.id === pendingId;
              const running = runningSet.has(c.id);
              return (
                <Tooltip key={c.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-label={running ? `${c.title}（进行中）` : c.title}
                      className={cn(
                        "relative flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
                        active
                          ? "bg-primary/12 text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {running ? (
                        <span className="ws-spin size-3.5" />
                      ) : (
                        <MessageSquare className="size-3.5" />
                      )}
                      {running && (
                        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {running ? `${c.title} · 进行中` : c.title}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

      </aside>
    </TooltipProvider>
  );
}
