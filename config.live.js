"use strict";
/* =============================================================================
 * Bestscreen PRODUCTION config — TRACKED in git, deployed to the live site.
 *
 * ⚠ THE API KEY BELOW IS PUBLIC. Anyone who visits bestscreen.web.app can
 *   read it via DevTools → Network. Mitigations in place:
 *     1. Anthropic Console → set a hard monthly spend cap on this key.
 *     2. Rotate the key periodically (and update this file + redeploy).
 *     3. If abuse appears, rotate immediately.
 *
 * `config.local.js` (gitignored) is loaded AFTER this file in index.html,
 * so a developer can override the live key locally without touching this file.
 * ============================================================================= */

window.BS_CONFIG = {
  ai: {
    provider: "anthropic",                  // "anthropic" or "openai"
    apiKey:   "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",                            // sk-ant-… or sk-…
    model:    "claude-sonnet-4-6",          // or "gpt-4o-mini"
  },
  // Firebase keys (NOT used at runtime today — placeholder for future Firestore
  // sync / Auth integration). Safe to leave blank.
  firebase: {
    apiKey:            "",
    authDomain:        "wr-ai-ters-room.firebaseapp.com",
    projectId:         "wr-ai-ters-room",
    storageBucket:     "wr-ai-ters-room.appspot.com",
    messagingSenderId: "",
    appId:             "",
  },
  authorName: "",
};
