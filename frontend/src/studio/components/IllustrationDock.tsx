import { useEffect, useState } from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import { api, formatApiError } from "../../api";
import type { IllustrationHome, IllustrationRecord, IllustrationSettings } from "../../types/illustration";
import { illustrationImageUrl } from "../../types/illustration";
import { notifyIllustrationsChanged, subscribeIllustrationsChanged } from "../lib/illustrationEvents";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { IllustrationHomeSelect } from "./IllustrationHomeSelect";

export function ProjectStyleEditor({ projectId }: { projectId: string }) {
  const [settings, setSettings] = useState<IllustrationSettings>({
    style_text: "",
    use_style_default: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getIllustrationSettings(projectId)
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        if (!cancelled) setSettings({ style_text: "", use_style_default: true });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const save = async (next: IllustrationSettings) => {
    setSettings(next);
    setSaving(true);
    setError("");
    try {
      setSettings(await api.saveIllustrationSettings(projectId, next));
    } catch (err) {
      setError(formatApiError(err, "保存项目风格失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-border/40 px-2 py-2">
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">项目风格</p>
      <Textarea
        value={settings.style_text}
        onChange={(e) => setSettings({ ...settings, style_text: e.target.value })}
        onBlur={() => void save(settings)}
        placeholder="可选。媒介、色彩、线面、禁止项…"
        className="min-h-[4.5rem] resize-y text-[12px] leading-relaxed"
      />
      <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={settings.use_style_default}
          onChange={(e) => void save({ ...settings, use_style_default: e.target.checked })}
        />
        默认带上这段风格
      </label>
      {saving ? <p className="mt-1 text-[11px] text-muted-foreground">保存中…</p> : null}
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

export function IllustrationGeneratePanel({
  projectId,
  docPath,
  conversationId,
  docPaths,
  imageConfigured,
  onClose,
}: {
  projectId: string;
  docPath: string;
  conversationId?: string | null;
  docPaths: string[];
  imageConfigured: boolean;
  onClose: () => void;
}) {
  const [extras, setExtras] = useState("");
  const [useStyle, setUseStyle] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [home, setHome] = useState<IllustrationHome>("doc");
  const [linkedDoc, setLinkedDoc] = useState<string | null>(docPath);
  const [compiling, setCompiling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLinkedDoc(docPath);
    setHome("doc");
    setCompiling(true);
    api
      .getIllustrationSettings(projectId)
      .then((s) => {
        setUseStyle(s.use_style_default);
        return api.compileIllustration(projectId, {
          extras: "",
          use_style: s.use_style_default,
          linked_doc: docPath,
        });
      })
      .then((c) => {
        setPrompt(c.prompt);
        setUseStyle(c.use_style);
      })
      .catch((err) => setError(formatApiError(err, "编译提示词失败")))
      .finally(() => setCompiling(false));
  }, [projectId, docPath]);

  const recompile = async () => {
    setCompiling(true);
    setError("");
    try {
      const c = await api.compileIllustration(projectId, {
        extras,
        use_style: useStyle,
        linked_doc: docPath,
      });
      setPrompt(c.prompt);
    } catch (err) {
      setError(formatApiError(err, "编译提示词失败"));
    } finally {
      setCompiling(false);
    }
  };

  const generate = async () => {
    if (!imageConfigured) {
      setError("未配置生图模型。请到设置 → 图像模型。");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      await api.generateIllustration(projectId, {
        prompt,
        extras,
        use_style: useStyle,
        home,
        linked_doc: home === "doc" ? linkedDoc || docPath : null,
        conversation_id: conversationId,
      });
      notifyIllustrationsChanged();
      onClose();
    } catch (err) {
      setError(formatApiError(err, "生成失败"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="border-b border-border/50 bg-muted/15 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">生成插画</h3>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </div>
      {!imageConfigured && (
        <p className="mb-2 text-[12px] text-amber-700 dark:text-amber-400">
          未配置生图模型，请先到设置 → 图像模型。
        </p>
      )}
      <label className="mb-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <input type="checkbox" checked={useStyle} onChange={(e) => setUseStyle(e.target.checked)} />
        使用项目风格
      </label>
      <Textarea
        value={extras}
        onChange={(e) => setExtras(e.target.value)}
        placeholder="当场加料（可选）"
        className="mb-2 min-h-[3.5rem] text-[12px]"
      />
      <div className="mb-2 flex justify-end">
        <Button type="button" size="sm" variant="outline" className="h-7 text-[12px]" disabled={compiling} onClick={() => void recompile()}>
          {compiling ? "编译中…" : "重新编译提示词"}
        </Button>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="最终提示词"
        className="mb-2 min-h-[5rem] text-[12px]"
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted-foreground">落入</span>
        <IllustrationHomeSelect
          home={home}
          linkedDoc={linkedDoc}
          docPaths={docPaths}
          onChange={(nextHome, nextDoc) => {
            setHome(nextHome);
            setLinkedDoc(nextDoc);
          }}
        />
      </div>
      {error ? <p className="mb-2 text-[12px] text-destructive">{error}</p> : null}
      <Button
        type="button"
        size="sm"
        className="h-7"
        disabled={generating || compiling || !prompt.trim() || !imageConfigured}
        onClick={() => void generate()}
      >
        {generating ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
        生成
      </Button>
    </div>
  );
}

export function IllustrationStrip({
  projectId,
  docPath,
}: {
  projectId: string;
  docPath: string;
}) {
  const [rows, setRows] = useState<IllustrationRecord[]>([]);

  const load = () => {
    api
      .listIllustrations(projectId, docPath)
      .then((d) => setRows(d.illustrations || []))
      .catch(() => setRows([]));
  };

  useEffect(() => {
    load();
    return subscribeIllustrationsChanged(load);
  }, [projectId, docPath]);

  if (!rows.length) return null;

  return (
    <div className="border-t border-border/50 bg-muted/10 px-3 py-2">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">本文档插画</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rows.map((row) => (
          <div key={row.id} className="w-36 shrink-0 overflow-hidden rounded-md bg-background ring-1 ring-border/50">
            <img
              src={illustrationImageUrl(projectId, row.id)}
              alt=""
              className="h-24 w-full object-cover"
            />
            {row.stale ? (
              <p className="px-1.5 py-1 text-[10px] text-amber-700 dark:text-amber-400">文档已更新（未重画）</p>
            ) : (
              <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{row.home === "draft" ? "草稿" : "已挂档"}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
