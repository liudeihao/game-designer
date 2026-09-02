import { describe, expect, it } from "vitest";
import type { LiveBlock, RuntimeEvent } from "../../types";
import {
  cardsFromEvents,
  columnItemsFromEvents,
  orderLiveBlocksForDisplay,
} from "./eventsColumn";

function call(id: string, name: string): RuntimeEvent {
  return { type: "tool_call", id, name, input: {}, after_human: 1 };
}

function ok(id: string, content = "ok"): RuntimeEvent {
  return { type: "tool_result", id, outcome: "success", content, after_human: 1 };
}

describe("cardsFromEvents", () => {
  it("keeps every tool call, in the order it ran", () => {
    const cards = cardsFromEvents([
      call("a", "workspace_read"),
      ok("a"),
      call("b", "workspace_grep"),
      ok("b"),
      call("c", "workspace_write"),
      ok("c"),
    ]);

    expect(cards.map((c) => c.type)).toEqual(["trace", "trace", "trace"]);
    expect(cards.map((c) => (c.type === "trace" ? c.name : ""))).toEqual([
      "workspace_read",
      "workspace_grep",
      "workspace_write",
    ]);
    expect(cards.every((c) => c.type === "trace" && c.status === "success" && c.kind === "tool")).toBe(
      true,
    );
  });

  it("interleaves choice and rule cards where they happened", () => {
    const cards = cardsFromEvents([
      call("a", "workspace_read"),
      ok("a"),
      {
        type: "user_choice",
        id: "q1",
        status: "pending",
        pending: { type: "user_choice", variant: "questions", message: "选一个", questions: [] },
        after_human: 1,
      },
      call("b", "workspace_write"),
      ok("b"),
    ]);

    expect(cards.map((c) => c.type)).toEqual(["trace", "user_choice", "trace"]);
  });

  it("refreshes a card in place rather than stacking a second one", () => {
    const cards = cardsFromEvents([
      call("a", "workspace_write"),
      {
        type: "user_choice",
        id: "q1",
        status: "pending",
        pending: { type: "user_choice", variant: "questions", message: "选一个", questions: [] },
        after_human: 1,
      },
      ok("a", "已写入"),
      {
        type: "user_choice",
        id: "q1",
        status: "answered",
        pending: { type: "user_choice", variant: "questions", message: "选一个", questions: [] },
        answers: [{ prompt: "方向", answer: "塔防" }],
        after_human: 1,
      },
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ type: "trace", status: "success", result: "已写入" });
    expect(cards[1]).toMatchObject({ type: "user_choice", status: "answered" });
  });

  it("shows a running card while a tool waits for permission", () => {
    const cards = cardsFromEvents([
      call("a", "workspace_write"),
      { type: "tool_permission", id: "a", status: "pending", after_human: 1 },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ type: "trace", status: "running" });
  });

  it("renders a permission panel from a pending interrupt payload", () => {
    const cards = cardsFromEvents([
      {
        type: "tool_permission",
        id: "w1",
        status: "pending",
        pending: {
          type: "tool_permission",
          calls: [{ id: "w1", name: "workspace_write", args: { path: "a.md" } }],
        },
        after_human: 1,
      },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ type: "tool_permission", status: "pending" });
  });
});

describe("columnItemsFromEvents", () => {
  const choice: RuntimeEvent = {
    type: "user_choice",
    id: "q1",
    status: "pending",
    pending: { type: "user_choice", variant: "questions", message: "先确认方向。", questions: [] },
    after_human: 1,
  };

  it("puts the chat intro before the choice card", () => {
    const items = columnItemsFromEvents([choice], true);
    expect(items.map((item) => item.type)).toEqual(["preamble", "user_choice"]);
  });

  it("keeps tool traces above the intro, then the choice card", () => {
    const items = columnItemsFromEvents([call("a", "workspace_read"), ok("a"), choice], true);
    expect(items.map((item) => item.type)).toEqual(["trace", "preamble", "user_choice"]);
  });

  it("keeps the reply after work when there is no choice card", () => {
    const items = columnItemsFromEvents([call("a", "workspace_read"), ok("a")], true);
    expect(items.map((item) => item.type)).toEqual(["trace", "preamble"]);
  });

  it("puts the chat intro before a Rule Proposal card", () => {
    const rule: RuntimeEvent = {
      type: "rule_proposal",
      id: "r1",
      scope: "project",
      operation: "add",
      name: "先谈经济",
      details: "本项目先对齐资源循环。",
      status: "pending",
      after_human: 1,
    };
    const items = columnItemsFromEvents([rule], true);
    expect(items.map((item) => item.type)).toEqual(["preamble", "rule_proposal"]);
  });

  it("maps a legacy blob proposal onto name and details", () => {
    const cards = cardsFromEvents([
      {
        type: "rule_proposal",
        id: "r1",
        scope: "project",
        operation: "append",
        text: "先谈经济",
        status: "pending",
        after_human: 1,
      } as unknown as RuntimeEvent,
    ]);
    expect(cards[0]).toMatchObject({
      type: "rule_proposal",
      operation: "add",
      name: "",
      details: "先谈经济",
    });
  });
});

describe("orderLiveBlocksForDisplay", () => {
  const rule: LiveBlock = { type: "rule_proposal", id: "r1" };
  const intro: LiveBlock = { type: "text", content: "我把它写成了 Project Rule。" };
  const trace: LiveBlock = { type: "trace", id: "t1" };

  it("moves streamed intro above a Rule Proposal that arrived first", () => {
    expect(orderLiveBlocksForDisplay([rule, intro]).map((b) => b.type)).toEqual([
      "text",
      "rule_proposal",
    ]);
  });

  it("keeps traces above the intro, then the Rule card", () => {
    expect(orderLiveBlocksForDisplay([trace, rule, intro]).map((b) => b.type)).toEqual([
      "trace",
      "text",
      "rule_proposal",
    ]);
  });

  it("leaves tool-then-reply order alone when there is no card", () => {
    expect(orderLiveBlocksForDisplay([trace, intro]).map((b) => b.type)).toEqual(["trace", "text"]);
  });
});
