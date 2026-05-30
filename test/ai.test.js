import { describe, it, expect } from "vitest";

// ---------- AI module — testable pure functions ----------
// The AI module is a browser IIFE. We extract resolveAI's precedence logic
// for testing. This tests the contract, not the network calls.

/**
 * Simulates the resolveAI() precedence logic:
 *   1. config.local.js (window.BS_CONFIG.ai) wins if it has an apiKey
 *   2. Settings UI (localStorage) is the fallback
 */
function resolveAI(localConfig, storedSettings) {
  const local = localConfig || {};
  const stored = storedSettings || {};
  return {
    provider: local.apiKey ? (local.provider || "anthropic") : (stored.provider || "anthropic"),
    apiKey:   local.apiKey || stored.apiKey || "",
    model:    local.model || stored.model || "",
  };
}

/**
 * Simulates the prompt template variable substitution.
 */
function interpolatePrompt(template, vars) {
  let prompt = template;
  Object.entries(vars || {}).forEach(([k, v]) => {
    prompt = prompt.replaceAll("{" + k + "}", v || "");
  });
  return prompt;
}

// ---------- Tests ----------

describe("resolveAI — config precedence", () => {
  it("uses stored settings when no local config exists", () => {
    const result = resolveAI({}, { provider: "openai", apiKey: "sk-stored", model: "gpt-4o" });
    expect(result.provider).toBe("openai");
    expect(result.apiKey).toBe("sk-stored");
    expect(result.model).toBe("gpt-4o");
  });

  it("local config wins when it has an apiKey", () => {
    const result = resolveAI(
      { provider: "anthropic", apiKey: "sk-local", model: "claude-sonnet-4-6" },
      { provider: "openai", apiKey: "sk-stored", model: "gpt-4o" }
    );
    expect(result.provider).toBe("anthropic");
    expect(result.apiKey).toBe("sk-local");
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  it("falls back to stored when local has no apiKey", () => {
    const result = resolveAI(
      { provider: "anthropic", apiKey: "", model: "claude-sonnet-4-6" },
      { provider: "openai", apiKey: "sk-stored", model: "gpt-4o" }
    );
    expect(result.provider).toBe("openai");
    expect(result.apiKey).toBe("sk-stored");
    // model falls through to local first, then stored
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  it("defaults to anthropic when no provider specified", () => {
    const result = resolveAI({}, {});
    expect(result.provider).toBe("anthropic");
    expect(result.apiKey).toBe("");
    expect(result.model).toBe("");
  });

  it("returns empty apiKey when neither source provides one", () => {
    const result = resolveAI({}, {});
    expect(result.apiKey).toBe("");
  });
});

describe("Prompt template interpolation", () => {
  it("replaces single variable", () => {
    const result = interpolatePrompt("Hello {NAME}", { NAME: "World" });
    expect(result).toBe("Hello World");
  });

  it("replaces multiple occurrences of same variable", () => {
    const result = interpolatePrompt("{X} and {X}", { X: "A" });
    expect(result).toBe("A and A");
  });

  it("replaces multiple different variables", () => {
    const result = interpolatePrompt("SCENE: {SCENE}\nCONTEXT: {CONTEXT}", {
      SCENE: "INT. ROOM - DAY",
      CONTEXT: "A thriller about trust",
    });
    expect(result).toBe("SCENE: INT. ROOM - DAY\nCONTEXT: A thriller about trust");
  });

  it("replaces missing values with empty string", () => {
    const result = interpolatePrompt("Hello {NAME}", { NAME: null });
    expect(result).toBe("Hello ");
  });

  it("leaves unmatched placeholders intact", () => {
    const result = interpolatePrompt("Hello {NAME}", {});
    expect(result).toBe("Hello {NAME}");
  });

  it("handles empty template", () => {
    expect(interpolatePrompt("", { X: "A" })).toBe("");
  });

  it("handles template with no variables", () => {
    expect(interpolatePrompt("No variables here", {})).toBe("No variables here");
  });
});
