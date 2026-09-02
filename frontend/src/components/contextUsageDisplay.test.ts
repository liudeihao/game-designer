import { describe, expect, it } from "vitest";
import type { ContextUsage } from "../types";
import { pickContextUsage } from "./contextUsageDisplay";

function usage(total: number): ContextUsage {
  return {
    model: "m",
    mode: null,
    context_limit: 1000,
    total_tokens: total,
    percent: total / 10,
    categories: [],
  };
}

describe("pickContextUsage", () => {
  it("returns nothing without a conversation", () => {
    expect(pickContextUsage(null, usage(10), usage(20), "a")).toBeNull();
  });

  it("prefers the live SSE reading for the current conversation", () => {
    expect(pickContextUsage("a", usage(42), usage(7), "a")?.total_tokens).toBe(42);
  });

  it("does not keep another conversation's snapshot after a switch", () => {
    expect(pickContextUsage("b", null, usage(88), "a")).toBeNull();
  });

  it("uses the snapshot only when it belongs to this conversation", () => {
    expect(pickContextUsage("b", null, usage(15), "b")?.total_tokens).toBe(15);
  });
});
