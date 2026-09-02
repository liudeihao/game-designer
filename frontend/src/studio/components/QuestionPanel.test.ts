import { describe, expect, it } from "vitest";
import type { PlanQuestion } from "../../types";
import { answerFor, isAnswered, toggleOption } from "./QuestionPanel";

const CUSTOM = "__custom__";

const single: PlanQuestion = {
  id: "loop",
  prompt: "核心循环？",
  options: [
    { id: "run", label: "逐局探索" },
    { id: "base", label: "基地经营" },
  ],
};

const multi: PlanQuestion = {
  id: "systems",
  prompt: "保留哪些系统？",
  options: [
    { id: "craft", label: "合成" },
    { id: "trade", label: "交易" },
  ],
  allow_multiple: true,
};

const openEnded: PlanQuestion = { id: "note", prompt: "还有别的吗？" };

describe("toggleOption", () => {
  it("replaces the pick on a single-select question", () => {
    expect(toggleOption(["run"], "base", false)).toEqual(["base"]);
  });

  it("adds and removes on a multi-select question", () => {
    expect(toggleOption(["craft"], "trade", true)).toEqual(["craft", "trade"]);
    expect(toggleOption(["craft", "trade"], "craft", true)).toEqual(["trade"]);
  });
});

describe("isAnswered", () => {
  it("needs a pick when the question has options", () => {
    expect(isAnswered(single, [], "")).toBe(false);
    expect(isAnswered(single, ["run"], "")).toBe(true);
  });

  it("needs text when the question has no options", () => {
    expect(isAnswered(openEnded, [], "  ")).toBe(false);
    expect(isAnswered(openEnded, [], "先做单机")).toBe(true);
  });

  it("needs text behind a lone 其他", () => {
    expect(isAnswered(single, [CUSTOM], "")).toBe(false);
    expect(isAnswered(single, [CUSTOM], "潜行")).toBe(true);
  });

  it("accepts an empty 其他 when another option carries the answer", () => {
    expect(isAnswered(multi, ["craft", CUSTOM], "")).toBe(true);
  });
});

describe("answerFor", () => {
  it("returns a bare id for single-select", () => {
    expect(answerFor(single, ["run"], "")).toBe("run");
  });

  it("returns a list for multi-select", () => {
    expect(answerFor(multi, ["craft", "trade"], "")).toEqual(["craft", "trade"]);
  });

  it("substitutes 其他 with the typed text", () => {
    expect(answerFor(single, [CUSTOM], " 潜行 ")).toBe("潜行");
    expect(answerFor(multi, ["craft", CUSTOM], "钓鱼")).toEqual(["craft", "钓鱼"]);
  });

  it("drops an 其他 that was never filled in", () => {
    expect(answerFor(multi, ["craft", CUSTOM], "")).toEqual(["craft"]);
  });

  it("uses the typed text when the question has no options", () => {
    expect(answerFor(openEnded, [CUSTOM], "先做单机")).toBe("先做单机");
  });
});
