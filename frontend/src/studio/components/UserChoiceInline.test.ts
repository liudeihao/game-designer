import { describe, expect, it } from "vitest";
import { choiceAnswersFromRecord } from "./UserChoiceInline";

const questions = [
  {
    id: "systems",
    prompt: "想保留哪些系统？",
    options: [
      { id: "craft", label: "合成" },
      { id: "trade", label: "交易" },
      { id: "farm", label: "种田" },
    ],
  },
  { id: "note", prompt: "还有别的吗？" },
];

describe("choiceAnswersFromRecord", () => {
  it("renders every label of a multi-select answer", () => {
    const items = choiceAnswersFromRecord(questions, {
      systems: ["craft", "farm"],
      note: "先做单机",
    });
    expect(items).toEqual([
      { prompt: "想保留哪些系统？", answer: "合成、种田" },
      { prompt: "还有别的吗？", answer: "先做单机" },
    ]);
  });

  it("keeps free text that matches no option", () => {
    const items = choiceAnswersFromRecord(questions, { systems: ["craft", "钓鱼"] });
    expect(items[0].answer).toBe("合成、钓鱼");
  });

  it("drops empty values", () => {
    const items = choiceAnswersFromRecord(questions, { systems: [], note: "" });
    expect(items.map((i) => i.answer)).toEqual(["", ""]);
  });
});
