"use strict";
/* =============================================================================
 * Bestscreen local config — copy this file to `config.local.js` and fill in
 * your keys. Both `config.local.js` and `.env` are gitignored.
 *
 * This file IS the source of truth at runtime. The `.env.example` file is
 * documentation only (there's no build step that would read `.env`).
 *
 * If `config.local.js` is missing, the AI module falls back to whatever the
 * user has saved via the Settings UI (per-browser, localStorage). That means:
 *   - Local dev: paste your key here, never see the Settings prompt again.
 *   - Production (bestscreen.web.app): this file isn't deployed, so users
 *     enter their own key via Settings (per the BYOK design).
 * ============================================================================= */

window.BS_CONFIG = {
  ai: {
    provider: "anthropic",                  // "anthropic" or "openai"
    apiKey:   "",                            // sk-ant-… or sk-…
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
