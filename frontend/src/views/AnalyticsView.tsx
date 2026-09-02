import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Coins, RefreshCw } from "lucide-react";
import { api } from "../api";
import type { ProjectMeta, UsageAnalytics } from "../types";
import { emptyUsageBucket } from "../types";
import { formatTokens } from "../components/UsageMeter";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

type RangeKey = "7d" | "30d" | "all";

function sinceFor(range: RangeKey): string | undefined {
  if (range === "all") return undefined;
  const days = range === "7d" ? 7 : 30;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function BarRow({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <div className="mb-1 truncate text-[14px] text-foreground">{label}</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-right font-mono text-[14px] tabular-nums text-muted-foreground">
        {suffix}
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [data, setData] = useState<UsageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [ps, analytics] = await Promise.all([
        api.listProjects(),
        api.getUsageAnalytics({
          since: sinceFor(range),
          projectId: projectId || undefined,
        }),
      ]);
      setProjects(ps);
      setData(analytics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, projectId]);

  const totals = data?.totals ?? emptyUsageBucket();
  const maxDayTokens = useMemo(
    () => Math.max(0, ...(data?.by_day.map((d) => d.total_tokens) ?? [0])),
    [data],
  );
  const maxModelTokens = useMemo(
    () => Math.max(0, ...(data?.by_model.map((m) => m.total_tokens) ?? [0])),
    [data],
  );
  const maxProjectTokens = useMemo(
    () => Math.max(0, ...(data?.by_project.map((p) => p.total_tokens) ?? [0])),
    [data],
  );
  const inputParts = [
    { key: "system", label: "System prompt", value: totals.input_breakdown?.system ?? 0 },
    { key: "rules", label: "Rules", value: totals.input_breakdown?.rules ?? 0 },
    { key: "tools", label: "Tool definitions / results", value: totals.input_breakdown?.tools ?? 0 },
    { key: "conversation", label: "Conversation", value: totals.input_breakdown?.conversation ?? 0 },
    { key: "other", label: "Other / protocol overhead", value: totals.input_breakdown?.other ?? 0 },
  ];
  const maxInputPart = Math.max(0, ...inputParts.map((part) => part.value));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-foreground">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="size-4 text-primary" />
              <span className="text-[14px]">洞察</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">用量分析</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              按时间、模型与项目汇总 Token 用量（支持多模型）
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["7d", "30d", "all"] as RangeKey[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={range === key ? "default" : "outline"}
                onClick={() => setRange(key)}
              >
                {key === "7d" ? "近 7 天" : key === "30d" ? "近 30 天" : "全部"}
              </Button>
            ))}
            <select
              className="h-8 rounded-md border border-border/70 bg-muted/30 px-2 text-[14px]"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">全部项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="刷新">
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-[15px] text-destructive">
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (
          <>
            <section className="mb-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: "总 Token", value: formatTokens(totals.total_tokens) },
                { label: "输入 / 输出", value: `${formatTokens(totals.input_tokens)} / ${formatTokens(totals.output_tokens)}` },
                { label: "调用次数", value: String(totals.calls) },
              ].map((card) => (
                <div key={card.label} className="surface-muted px-4 py-3.5">
                  <div className="text-[13px] text-muted-foreground">{card.label}</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums tracking-tight">
                    {card.value}
                  </div>
                </div>
              ))}
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="surface p-4">
                <h2 className="mb-1 text-[15px] font-semibold">输入 Token 组成</h2>
                <p className="mb-3 text-[12px] text-muted-foreground">
                  总输入来自供应商 usage；组成按本次发送载荷分词并对齐到实报总数。
                </p>
                {inputParts.every((part) => part.value === 0) ? (
                  <EmptyHint />
                ) : (
                  inputParts.map((part) => (
                    <BarRow
                      key={part.key}
                      label={part.label}
                      value={part.value}
                      max={maxInputPart}
                      suffix={formatTokens(part.value)}
                    />
                  ))
                )}
              </section>

              <section className="surface p-4">
                <h2 className="mb-3 text-[15px] font-semibold">数据质量</h2>
                <div className="space-y-2 text-[14px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">供应商实报</span><span>{totals.provider_calls ?? 0} 次</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">本地估算</span><span>{totals.estimated_calls ?? 0} 次</span></div>
                </div>
              </section>

              <section className="surface p-4">
                <h2 className="mb-3 text-[15px] font-semibold">按日 Token</h2>
                {(data?.by_day.length ?? 0) === 0 ? (
                  <EmptyHint />
                ) : (
                  data!.by_day.map((d) => (
                    <BarRow
                      key={d.day}
                      label={d.day}
                      value={d.total_tokens}
                      max={maxDayTokens}
                      suffix={formatTokens(d.total_tokens)}
                    />
                  ))
                )}
              </section>

              <section className="surface p-4">
                <h2 className="mb-3 text-[15px] font-semibold">按模型</h2>
                {(data?.by_model.length ?? 0) === 0 ? (
                  <EmptyHint />
                ) : (
                  data!.by_model.map((m) => (
                    <BarRow
                      key={m.model}
                      label={m.model}
                      value={m.total_tokens}
                      max={maxModelTokens}
                      suffix={`${formatTokens(m.total_tokens)} · ${m.calls} 次`}
                    />
                  ))
                )}
              </section>

              <section className="surface p-4">
                <h2 className="mb-3 text-[15px] font-semibold">按项目</h2>
                {(data?.by_project.length ?? 0) === 0 ? (
                  <EmptyHint />
                ) : (
                  data!.by_project.map((p) => (
                    <div key={p.project_id} className="py-1">
                      <BarRow
                        label={p.project_name}
                        value={p.total_tokens}
                        max={maxProjectTokens}
                        suffix={formatTokens(p.total_tokens)}
                      />
                      <Link
                        to={`/project/${p.project_id}`}
                        className="text-[13px] text-primary hover:underline"
                      >
                        打开项目
                      </Link>
                    </div>
                  ))
                )}
              </section>

              <section className="surface p-4">
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                  <Coins className="size-3.5" />
                  最近调用
                </h2>
                {(data?.recent.length ?? 0) === 0 ? (
                  <EmptyHint />
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {data!.recent.slice(0, 20).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium">{r.model}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {r.role && (
                              <Badge variant="secondary" className="text-[12px]">
                                {r.role}
                              </Badge>
                            )}
                            {(r.tags ?? []).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[12px]">
                                {tag}
                              </Badge>
                            ))}
                            {(r.tools_invoked ?? []).map((tool, i) => (
                              <Badge key={`${tool.name}-${i}`} variant="outline" className="text-[12px]">
                                {tool.name}
                                {(tool.tags ?? []).includes("mutation") ? " · mutation" : ""}
                              </Badge>
                            ))}
                            <Badge variant={r.usage_source === "provider" ? "secondary" : "outline"} className="text-[12px]">
                              {r.usage_source === "provider" ? "实报" : "估算"}
                            </Badge>
                            <span className="text-[13px] text-muted-foreground">
                              {new Date(r.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                          {formatTokens(r.total_tokens)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <p className="mt-6 text-[13px] text-muted-foreground">
              工作区内可查看本轮 / 本对话 / 本项目 Token 用量。
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <p className="py-6 text-center text-[14px] text-muted-foreground">
      暂无用量数据。在工作区发起一轮对话后会出现在这里。
    </p>
  );
}
