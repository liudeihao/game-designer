import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  FileDown,
  FolderKanban,
  LayoutTemplate,
  ListTodo,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { api } from "../api";
import type { ProjectMeta } from "../types";
import { projectLabelVariant } from "../utils/projectLabels";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

interface ProjectCard {
  meta: ProjectMeta;
  conversationCount: number;
}

const QUICK_ACTIONS = [
  {
    id: "plan",
    title: "新建项目",
    desc: "和 AI 一起设计游戏，需要时再进入 Plan",
    icon: ListTodo,
    to: "/new",
    state: { startMode: null },
  },
  {
    id: "template",
    title: "使用模板",
    desc: "品类模板一键起步",
    icon: LayoutTemplate,
    to: "/templates",
    soon: true,
  },
  {
    id: "import",
    title: "导入设计文档",
    desc: "从 JSON 导入现有设计",
    icon: FileDown,
    to: "/library",
    soon: true,
  },
] as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export function DashboardView() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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

  const recent = filtered.slice(0, 6);
  const totalProjects = cards.length;
  const totalConversations = cards.reduce((s, c) => s + c.conversationCount, 0);
  const inProgress = cards.filter((c) => (c.meta.label || "").trim() === "进行中").length;
  const doneCount = cards.filter((c) => {
    const t = (c.meta.label || "").trim();
    return t === "Done" || t === "已完成";
  }).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-foreground">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[14px] text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              AI Game Studio
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              从创意到设计文档，管理和推进你的游戏设计项目。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="搜索项目…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => navigate("/new")}>
              <Plus className="size-3.5" />
              新建项目
            </Button>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "项目", value: loading ? "—" : String(totalProjects) },
            { label: "进行中", value: loading ? "—" : String(inProgress) },
            { label: "Done", value: loading ? "—" : String(doneCount) },
            { label: "对话", value: loading ? "—" : String(totalConversations) },
          ].map((s) => (
            <div key={s.label} className="surface-muted px-4 py-3.5">
              <div className="text-[13px] text-muted-foreground">{s.label}</div>
              <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">快捷开始</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    navigate(a.to, "state" in a && a.state ? { state: a.state } : undefined)
                  }
                  className="surface-interactive group flex items-start gap-3 p-4 text-left"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[15px] font-medium">
                      {a.title}
                      {"soon" in a && a.soon && (
                        <span className="text-[11px] font-normal text-muted-foreground/70">Soon</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[13px] text-muted-foreground">{a.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <FolderKanban className="size-3.5" />
              最近项目
            </h2>
            <Button variant="ghost" size="sm" className="h-7 text-[14px]" asChild>
              <Link to="/projects">
                查看全部
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="surface flex items-center gap-2 px-4 py-12 text-[15px] text-muted-foreground">
              <span className="ws-spin" />
              加载项目…
            </div>
          ) : recent.length === 0 ? (
            <div className="surface px-4 py-12 text-center">
              <div className="text-[14px] font-medium">还没有项目</div>
              <p className="mx-auto mt-1 max-w-sm text-[14px] text-muted-foreground">
                创建第一个游戏设计项目，和 Agent 一起把创意写成设计文档。
              </p>
              <Button className="mt-4" size="sm" onClick={() => navigate("/new")}>
                <Plus className="size-3.5" />
                开始新建
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {recent.map(({ meta, conversationCount }) => {
                const label = (meta.label || "").trim();
                return (
                  <Link
                    key={meta.id}
                    to={`/project/${meta.id}`}
                    className="surface-interactive group flex flex-col gap-3 p-4 transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold group-hover:text-primary">
                          {meta.name}
                        </div>
                        <div className="mt-1 text-[12px] text-muted-foreground">
                          {new Date(meta.updated_at).toLocaleDateString()} · {conversationCount}{" "}
                          对话
                        </div>
                      </div>
                      {label ? (
                        <Badge
                          variant={projectLabelVariant(label)}
                          className="shrink-0 font-normal"
                        >
                          {label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 font-normal">
                          无标签
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
