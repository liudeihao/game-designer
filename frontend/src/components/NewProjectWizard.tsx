import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function NewProjectWizard() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const canCreate = name.trim().length > 0 && !creating;

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    setError("");
    try {
      const project = await api.createProject(name.trim() || "未命名游戏");
      navigate(`/project/${project.id}`, { state: { startMode: "plan" } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden text-foreground">
      <header className="shrink-0 border-b border-border/50 px-6 py-5 md:px-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Button variant="ghost" size="sm" className="w-fit px-2" onClick={() => navigate("/")}>
            <ArrowLeft className="size-3.5" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">新建游戏项目</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              新项目会先进入 Plan：澄清需求并生成 plan，确认后再 Execute Plan。
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <section>
            <h2 className="text-lg font-semibold tracking-tight">为你的游戏起个名字</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">
              项目名称可以随时修改，也可以先用临时名称。
            </p>
            <div className="mt-5 max-w-md space-y-1.5">
              <label className="text-[14px] font-medium text-muted-foreground">项目名称</label>
              <Input
                type="text"
                value={name}
                placeholder="例如：星际农场物语"
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canCreate && void create()}
              />
            </div>
          </section>

          {error && (
            <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-[14px] text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 justify-end gap-2 border-t border-border/50 px-6 py-3 md:px-10">
        <div className="mx-auto flex w-full max-w-3xl justify-end gap-2">
          <Button variant="outline" onClick={() => navigate("/")}>
            取消
          </Button>
          <Button disabled={!canCreate} onClick={() => void create()}>
            {creating ? "创建中…" : "创建并进入 Plan"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
