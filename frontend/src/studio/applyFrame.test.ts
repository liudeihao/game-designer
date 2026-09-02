import { describe, expect, it } from "vitest";
import { applyFrame, emptyAgentRun, statusFromSnapshot, unwrapStreamFrame } from "./applyFrame";
import { emptyLiveTurn } from "./streamUtils";

function frame(
  type: "token" | "trace_start" | "trace_end" | "pending" | "done" | "error",
  data: unknown,
  turnId = "turn_1",
) {
  return { id: `frm_${type}`, turn_id: turnId, type, ts: 1, data };
}

describe("unwrapStreamFrame", () => {
  it("reads the envelope and returns the inner payload", () => {
    const parsed = {
      id: "frm_1",
      turn_id: "turn_1",
      type: "token",
      ts: 10,
      data: { text: "我", node: "main_agent" },
    };
    const { frame: unwrapped, payload } = unwrapStreamFrame("token", parsed);
    expect(unwrapped?.turn_id).toBe("turn_1");
    expect(payload).toEqual({ text: "我", node: "main_agent" });
  });

  it("treats a bare payload as the old shape", () => {
    const { frame: unwrapped, payload } = unwrapStreamFrame("token", { text: "建议", node: "" });
    expect(unwrapped).toBeUndefined();
    expect(payload).toEqual({ text: "建议", node: "" });
  });
});

describe("applyFrame", () => {
  it("appends token text into live", () => {
    let run = emptyAgentRun("c1", "turn_1");
    run = applyFrame(run, frame("token", { text: "我" }));
    run = applyFrame(run, frame("token", { text: "建议" }));
    expect(run.status).toBe("running");
    expect(run.live?.text).toBe("我建议");
  });

  it("records a tool trace from start to end", () => {
    let run = emptyAgentRun("c1", "turn_1");
    run = applyFrame(
      run,
      frame("trace_start", {
        id: "t1",
        agent: "Agent",
        name: "workspace_read",
        args: { path: "docs/a.md" },
      }),
    );
    expect(run.live?.traces[0]?.status).toBe("running");
    run = applyFrame(
      run,
      frame("trace_end", { id: "t1", agent: "Agent", status: "success", result: "ok" }),
    );
    expect(run.live?.traces[0]?.status).toBe("success");
  });

  it("sets waiting_user on pending", () => {
    let run = emptyAgentRun("c1", "turn_1");
    run = applyFrame(
      run,
      frame("pending", {
        type: "user_choice",
        variant: "questions",
        message: "选一个",
        questions: [{ id: "q1", prompt: "方向？" }],
      }),
    );
    expect(run.status).toBe("waiting_user");
    expect(run.pending?.type).toBe("user_choice");
  });

  it("finalizes messages on done and clears live", () => {
    let run = emptyAgentRun("c1", "turn_1");
    run = { ...run, messages: [{ role: "human", content: "你好" }] };
    run = applyFrame(run, frame("token", { text: "好的" }));
    run = applyFrame(
      run,
      frame("done", {
        pending: null,
        events: [],
        messages: [],
      }),
    );
    expect(run.status).toBe("completed");
    expect(run.live).toBeUndefined();
    expect(run.messages.some((m) => m.role === "ai" && m.content.includes("好的"))).toBe(true);
  });

  it("marks the folded AI bubble interrupted on done", () => {
    let run = emptyAgentRun("c1", "turn_1");
    run = { ...run, messages: [{ role: "human", content: "你好" }] };
    run = applyFrame(run, frame("token", { text: "部分" }));
    run = applyFrame(
      run,
      frame("done", {
        pending: null,
        events: [],
        interrupted: true,
      }),
    );
    const last = run.messages[run.messages.length - 1];
    expect(last.interrupted).toBe(true);
    expect(last.content).toContain("部分");
  });

  it("keeps the previous turn when two AI turns have no human message between", () => {
    let run = emptyAgentRun("c1");
    run = { ...run, messages: [{ role: "human", content: "做个塔防" }] };
    run = applyFrame(run, frame("token", { text: "先确认几件事" }, "turn_1"));
    run = applyFrame(run, frame("done", { pending: null, events: [] }, "turn_1"));

    // Answering an ask_user card resumes without adding a human bubble.
    run = applyFrame(run, frame("token", { text: "已更新右侧 plan" }, "turn_2"));
    run = applyFrame(run, frame("done", { pending: null, events: [] }, "turn_2"));

    expect(run.messages).toHaveLength(3);
    expect(run.messages[1].content).toContain("先确认几件事");
    expect(run.messages[2].content).toContain("已更新右侧 plan");
  });

  it("rewrites the bubble of the same turn instead of stacking a second one", () => {
    let run = emptyAgentRun("c1");
    run = { ...run, messages: [{ role: "human", content: "继续" }] };
    run = applyFrame(run, frame("token", { text: "部分回答" }, "turn_1"));
    run = applyFrame(run, frame("done", { pending: null, events: [] }, "turn_1"));
    // Same turn resumes (e.g. after a frozen abort bubble) and finishes again.
    run = applyFrame(run, frame("token", { text: "部分回答，以及结论" }, "turn_1"));
    run = applyFrame(run, frame("done", { pending: null, events: [] }, "turn_1"));

    expect(run.messages).toHaveLength(2);
    expect(run.messages[1].content).toBe("部分回答，以及结论");
  });

  it("assembles the same messages when a done frame is applied twice", () => {
    // StrictMode replays state updaters, so committing a turn must not depend on
    // anything the first pass mutated.
    let run = emptyAgentRun("c1");
    run = { ...run, messages: [{ role: "human", content: "做个塔防" }] };
    run = applyFrame(run, frame("token", { text: "明白了，已确认" }, "turn_1"));
    const done = frame("done", {
      pending: null,
      events: [{ type: "tool_call", id: "w1", name: "write_plan", after_human: 1 }],
      plan_markdown: "# 计划",
    }, "turn_1");

    const first = applyFrame(run, done);
    const second = applyFrame(run, done);
    expect(second.messages).toEqual(first.messages);
    expect(first.messages).toHaveLength(2);
    expect(first.messages[1].content).toBe("明白了，已确认");
  });

  it("swaps a plan body in the chat for a pointer to the plan panel", () => {
    const body = `# 塔防计划\n\n## 愿景\n${"细节。".repeat(200)}`;
    let run = emptyAgentRun("c1");
    run = { ...run, messages: [{ role: "human", content: "写计划" }] };
    run = applyFrame(run, frame("token", { text: body }, "turn_1"));
    run = applyFrame(
      run,
      frame("done", { pending: null, events: [], plan_markdown: "# 塔防计划" }, "turn_1"),
    );

    expect(run.messages[1].content).toBe("已更新右侧 plan，可继续讨论或点击「执行计划」。");
  });

  it("done with pending stays waiting_user", () => {
    let run = emptyAgentRun("c1");
    run = applyFrame(
      run,
      frame("done", {
        pending: { type: "user_choice", variant: "questions", message: "先确认方向。", questions: [] },
        events: [],
      }),
    );
    expect(run.status).toBe("waiting_user");
  });
});

describe("statusFromSnapshot", () => {
  it("does not need a live stream", () => {
    expect(statusFromSnapshot(null)).toBe("completed");
    expect(
      statusFromSnapshot({ type: "user_choice", variant: "suggest_mode", mode: "plan", message: "进 Plan" }),
    ).toBe("waiting_user");
  });
});

describe("empty live turn", () => {
  it("starts empty", () => {
    expect(emptyLiveTurn().text).toBe("");
  });
});
