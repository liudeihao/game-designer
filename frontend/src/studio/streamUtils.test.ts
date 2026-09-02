import { describe, expect, it } from "vitest";
import {
  appendLiveText,
  applyTraceEnd,
  applyTraceStart,
  describeLiveWorkingStatus,
  emptyLiveTurn,
} from "./streamUtils";

describe("describeLiveWorkingStatus", () => {
  it("shows thinking on an empty in-flight turn", () => {
    expect(describeLiveWorkingStatus(emptyLiveTurn())).toBe("正在思考…");
  });

  it("keeps thinking after preamble text while a long tool call has not started yet", () => {
    const turn = appendLiveText(emptyLiveTurn(), "我先去读一下文档。");
    expect(describeLiveWorkingStatus(turn)).toBe("正在思考…");
  });

  it("keeps thinking after reasoning with no answer text yet", () => {
    const turn = { ...emptyLiveTurn(), reasoning: "先看看工作区结构" };
    expect(describeLiveWorkingStatus(turn)).toBe("正在思考…");
  });

  it("names the running tool", () => {
    const turn = applyTraceStart(appendLiveText(emptyLiveTurn(), "我先去读一下文档。"), {
      id: "t1",
      agent: "Agent",
      name: "workspace_read",
      args: { path: "docs/愿景.md" },
    });
    expect(describeLiveWorkingStatus(turn)).toBe("正在阅读 docs/愿景.md…");
  });

  it("returns to thinking after the tool finishes, while waiting for the next model tokens", () => {
    let turn = applyTraceStart(appendLiveText(emptyLiveTurn(), "我先去读一下文档。"), {
      id: "t1",
      agent: "Agent",
      name: "workspace_read",
      args: { path: "docs/愿景.md" },
    });
    turn = applyTraceEnd(turn, {
      id: "t1",
      agent: "Agent",
      status: "success",
      result: "ok",
    });
    expect(describeLiveWorkingStatus(turn)).toBe("正在思考…");
  });
});
