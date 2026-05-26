"use strict";
/* =============================================================================
 * BESTSCREEN AI — bring-your-own-key inline assist
 *
 * Uses the user's own API key (saved in Settings, never sent anywhere but the
 * provider). Supports Anthropic + OpenAI. Right-click any line in the editor
 * to invoke one of several prompt templates.
 *
 * Note: requests go directly from the browser to the provider, which means
 * the provider must allow CORS. Anthropic does (via the messages API with
 * anthropic-dangerous-direct-browser-access header). OpenAI also allows
 * direct browser calls (the user accepts the risk by entering their key).
 * ============================================================================= */

const AI = (() => {

  const COMMANDS = [
    { id: "punch",    label: "Punch up",        prompt: "Make this line sharper, funnier, or more cinematic. Output ONLY the rewritten line, no commentary.\n\nLINE:\n{TEXT}" },
    { id: "tighten",  label: "Tighten",         prompt: "Rewrite this to be tighter. Cut filler words. Output ONLY the rewritten line.\n\nLINE:\n{TEXT}" },
    { id: "alt",      label: "Alternative take",prompt: "Suggest one alternative version of this line in a slightly different tone. Output ONLY the alternative line.\n\nLINE:\n{TEXT}" },
    { id: "subtext",  label: "Add subtext",     prompt: "Rewrite this to be less on-the-nose — say it indirectly. Output ONLY the rewritten line.\n\nLINE:\n{TEXT}" },
    { id: "show",     label: "Show, don't tell",prompt: "Rewrite this action line to SHOW the emotion through visual behavior, not state it. Output ONLY the rewritten line.\n\nLINE:\n{TEXT}" },
    { id: "brainstorm", label: "Brainstorm beats", prompt: "Brainstorm 3 short alternative things that could happen next in this scene. Number them 1, 2, 3. Be concise.\n\nCURRENT CONTEXT:\n{CONTEXT}" },
    { id: "coverage", label: "Generate coverage", prompt: "Write a professional coverage document for the following screenplay. Format with: LOGLINE (1 sentence), SYNOPSIS (200 words), STRENGTHS (3 bullets), WEAKNESSES (3 bullets), VERDICT (CONSIDER/PASS/RECOMMEND with reason).\n\nSCREENPLAY:\n{TEXT}" },
  ];

  function getCommands() { return COMMANDS; }

  async function complete(promptTemplate, vars) {
    const settings = Storage.getSettings();
    const ai = settings.ai || {};
    if (!ai.apiKey) {
      throw new Error("No API key. Open Settings and add your key first.");
    }
    let prompt = promptTemplate;
    Object.entries(vars).forEach(([k,v]) => {
      prompt = prompt.replaceAll("{" + k + "}", v || "");
    });

    if (ai.provider === "anthropic") return callAnthropic(ai, prompt);
    if (ai.provider === "openai")    return callOpenAI(ai, prompt);
    throw new Error("Unknown provider: " + ai.provider);
  }

  async function callAnthropic(ai, prompt) {
    const model = ai.model || "claude-sonnet-4-6";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ai.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error("Anthropic " + r.status + ": " + t.slice(0,200));
    }
    const j = await r.json();
    return j.content?.[0]?.text || "";
  }

  async function callOpenAI(ai, prompt) {
    const model = ai.model || "gpt-4o-mini";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + ai.apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error("OpenAI " + r.status + ": " + t.slice(0,200));
    }
    const j = await r.json();
    return j.choices?.[0]?.message?.content || "";
  }

  /* ----------------------------------------------------------------------
   * Streaming — returns an async iterator that yields text chunks as they
   * arrive. Callers can render them progressively into a ghost overlay.
   * -------------------------------------------------------------------- */
  async function* stream(promptTemplate, vars) {
    const settings = Storage.getSettings();
    const ai = settings.ai || {};
    if (!ai.apiKey) throw new Error("No API key. Open Settings and add your key first.");
    let prompt = promptTemplate;
    Object.entries(vars || {}).forEach(([k, v]) => { prompt = prompt.replaceAll("{" + k + "}", v || ""); });
    if (ai.provider === "anthropic") { yield* streamAnthropic(ai, prompt); return; }
    if (ai.provider === "openai")    { yield* streamOpenAI(ai, prompt); return; }
    throw new Error("Unknown provider: " + ai.provider);
  }

  // Parse a stream of `data: …` lines (SSE) into JSON event objects.
  async function* readSSE(response) {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line || !line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try { yield JSON.parse(payload); } catch { /* skip malformed */ }
      }
    }
  }

  async function* streamAnthropic(ai, prompt) {
    const model = ai.model || "claude-sonnet-4-6";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ai.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: 1024, stream: true, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error("Anthropic " + r.status + ": " + t.slice(0, 200)); }
    for await (const ev of readSSE(r)) {
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        yield ev.delta.text;
      }
    }
  }

  async function* streamOpenAI(ai, prompt) {
    const model = ai.model || "gpt-4o-mini";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + ai.apiKey,
      },
      body: JSON.stringify({ model, max_tokens: 1024, stream: true, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error("OpenAI " + r.status + ": " + t.slice(0, 200)); }
    for await (const ev of readSSE(r)) {
      const chunk = ev.choices?.[0]?.delta?.content;
      if (chunk) yield chunk;
    }
  }

  return { getCommands, complete, stream };
})();
