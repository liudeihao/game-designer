import { describe, expect, it } from "vitest";
import { adapterLabel, hintsForAdapter, inferImageAdapter } from "./image";

const adapters = [
  {
    id: "openai",
    label: "OpenAI 兼容",
    base_url_hint: "https://api.openai.com/v1",
    model_hint: "gpt-image-1",
    auth_hint: "Bearer sk-…",
  },
  {
    id: "fal",
    label: "fal.ai",
    base_url_hint: "https://fal.run",
    model_hint: "fal-ai/flux/schnell",
    auth_hint: "Authorization: Key …",
  },
];

describe("image adapter helpers", () => {
  it("infers fal from fal hosts", () => {
    expect(inferImageAdapter("https://fal.run")).toBe("fal");
    expect(inferImageAdapter("https://queue.fal.run")).toBe("fal");
    expect(inferImageAdapter("https://api.openai.com/v1")).toBe("openai");
  });

  it("labels auto and registered adapters", () => {
    expect(adapterLabel("", adapters)).toBe("自动识别");
    expect(adapterLabel("auto", adapters)).toBe("自动识别");
    expect(adapterLabel("fal", adapters)).toBe("fal.ai");
  });

  it("uses explicit adapter over URL when picking hints", () => {
    expect(hintsForAdapter("fal", "https://api.openai.com/v1", adapters)?.id).toBe("fal");
    expect(hintsForAdapter("auto", "https://fal.run", adapters)?.id).toBe("fal");
  });
});
