import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoreHorizontal, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { api } from "../api";
import type { ProjectMeta } from "../types";
import { PROJECT_LABEL_PRESETS, projectLabelVariant } from "../utils/projectLabels";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Dialog, type DialogConfig } from "../components/Dialog";

interface ProjectCard {
  meta: ProjectMeta;
  conversationCount: number;
}

export function ProjectsView() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const projects = await api.listProjects();
      const snapshots = await Promise.all(
        projects.map(async (meta) => {
          try {
            const snap = await api.getProject(meta.id);
            return {
              meta: snap.project ?? meta,
              conversationCount: snap.conversations.length,
            };
          } catch {
            return { meta, conversationCount: 0 };
          }
        }),
      );
      snapshots.sort(
        (a, b) => new Date(b.meta.updated_at).getTime() - new Date(a.meta.updated_at).getTime(),
      );
      setCards(snapshots);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => {
      const name = c.meta.name.toLowerCase();
      const label = (c.meta.label || "").toLowerCase();
      return name.includes(q) || label.includes(q);
    });
  }, [cards, query]);

  const renameProject = (meta: ProjectMeta) => {
    setDialog({
      title: "重命名项目",
      inputLabel: "项目名称",
      defaultValue: meta.name,
      confirmLabel: "保存",
      onConfirm: async (name) => {
        await api.renameProject(meta.id, name.trim() || meta.name);
        await load();
      },
    });
  };

  const setCustomLabel = (meta: ProjectMeta) => {
    setDialog({
      title: "自定义标签",
      inputLabel: "标签",
      defaultValue: meta.label || "",
      confirmLabel: "保存",
      onConfirm: async (value) => {
        await api.updateProject(meta.id, { label: value.trim() });
        await load();
      },
    });
  };

  const setLabel = async (meta: ProjectMeta, label: string) => {
    await api.updateProject(meta.id, { label });
    setCards((prev) =>
      prev.map((c) =>
        c.meta.id === meta.id ? { ...c, meta: { ...c.meta, label } } : c,
      ),
    );
  };

  const deleteProject = (meta: ProjectMeta) => {
    setDialog({
      title: "删除项目",
      message: `确定删除「${meta.name}」？其所有对话与游戏设计资产都将被删除，此操作不可撤销。`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        await api.deleteProject(meta.id);
        await load();
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-foreground">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">项目</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              用标签标记项目状态，例如构思、进行中、Done
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="筛选项目…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => navigate("/new")}>
              <Plus className="size-3.5" />
              新建
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="surface flex items-center gap-2 px-4 py-16 text-[15px] text-muted-foreground">
            <span className="ws-spin" />
            加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface px-4 py-16 text-center text-[15px] text-muted-foreground">
            {cards.length === 0 ? "还没有项目" : "没有匹配的项目"}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ meta, conversationCount }) => {
              const label = (meta.label || "").trim();
              return (
                <div
                  key={meta.id}
                  className="surface-interactive group relative flex flex-col gap-3 p-4 transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/project/${meta.id}`} className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold group-hover:text-primary">
                        {meta.name}
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        {new Date(meta.updated_at).toLocaleString()} · {conversationCount} 对话
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      {label ? (
                        <Badge variant={projectLabelVariant(label)} className="font-normal">
                          {label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal">
                          无标签
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 opacity-60 hover:opacity-100"
                            aria-label="管理项目"
                            onClick={(e) => e.preventDefault()}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => navigate(`/project/${meta.id}`)}>
                            打开
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => renameProject(meta)}>
                            <Pencil className="size-3.5" />
                            重命名
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Tag className="size-3.5" />
                              设置标签
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-36">
                              {PROJECT_LABEL_PRESETS.map((preset) => (
                                <DropdownMenuItem
                                  key={preset}
                                  onSelect={() => void setLabel(meta, preset)}
                                >
                                  {preset}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setCustomLabel(meta)}>
                                自定义…
                              </DropdownMenuItem>
                              {label ? (
                                <DropdownMenuItem onSelect={() => void setLabel(meta, "")}>
                                  清除标签
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => deleteProject(meta)}
                          >
                            <Trash2 className="size-3.5" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {dialog && <Dialog config={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
