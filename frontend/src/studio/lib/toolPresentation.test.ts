import { describe, expect, it } from "vitest";
import {
  deleteFileCount,
  parseToolJson,
  toolFriendlyDetails,
  toolTitle,
  toolWorkingStatus,
  writeFileCount,
} from "./toolPresentation";

const sevenWriteResult = JSON.stringify({
  ok: true,
  op: "write",
  count: 7,
  results: [
    { path: "愿景.md", op: "write", created: true },
    { path: "核心循环.md", op: "write", created: true },
    { path: "世界生态.md", op: "write", created: true },
    { path: "资源与成长.md", op: "write", created: true },
    { path: "建造与基地.md", op: "write", created: true },
    { path: "战斗与Boss.md", op: "write", created: true },
    { path: "内容节奏.md", op: "write", created: true },
  ],
});

const sevenWriteArgs = {
  files: [
    { path: "愿景.md", content: "（12 字）" },
    { path: "核心循环.md", content: "（12 字）" },
    { path: "世界生态.md", content: "（12 字）" },
    { path: "资源与成长.md", content: "（12 字）" },
    { path: "建造与基地.md", content: "（12 字）" },
    { path: "战斗与Boss.md", content: "（12 字）" },
    { path: "内容节奏.md", content: "（12 字）" },
  ],
};

describe("parseToolJson", () => {
  it("parses JSON results and leaves plain text alone", () => {
    expect(parseToolJson(sevenWriteResult)).toMatchObject({ count: 7 });
    expect(parseToolJson("已生成 plan")).toBe("已生成 plan");
    expect(parseToolJson("")).toBeUndefined();
  });
});

describe("workspace_write presentation", () => {
  it("titles a batch write by count, not the first path", () => {
    expect(writeFileCount(sevenWriteArgs, sevenWriteResult)).toBe(7);
    expect(toolTitle("workspace_write", sevenWriteArgs, "success", sevenWriteResult)).toBe(
      "写了 7 个文件",
    );
    expect(toolWorkingStatus("workspace_write", sevenWriteArgs)).toBe("正在写入 7 个文件…");
  });

  it("lists every written file, preferring result created flags", () => {
    const details = toolFriendlyDetails("workspace_write", sevenWriteArgs, sevenWriteResult);
    expect(details.files.map((f) => f.path)).toEqual([
      "愿景.md",
      "核心循环.md",
      "世界生态.md",
      "资源与成长.md",
      "建造与基地.md",
      "战斗与Boss.md",
      "内容节奏.md",
    ]);
    expect(details.files.every((f) => f.created === true)).toBe(true);
  });

  it("titles a single write with the path", () => {
    const args = { files: [{ path: "愿景.md", content: "x" }] };
    const result = JSON.stringify({
      ok: true,
      op: "write",
      count: 1,
      results: [{ path: "愿景.md", op: "write", created: true }],
    });
    expect(toolTitle("workspace_write", args, "success", result)).toBe("写了 愿景.md");
  });
});

describe("other tools", () => {
  it("falls back to 调用了 {name} for unknown tools", () => {
    expect(toolTitle("figma_export", { dest: "out" })).toBe("调用了 figma export");
    expect(toolFriendlyDetails("figma_export", {}).lines).toEqual(["见详情"]);
  });

  it("counts deletes from args.paths", () => {
    const args = { paths: ["旧稿.md", "系统/废弃.md"] };
    expect(deleteFileCount(args)).toBe(2);
    expect(toolTitle("workspace_delete", args)).toBe("删除了 2 个文件");
  });
});
