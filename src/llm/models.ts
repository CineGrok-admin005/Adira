// One place for model IDs.
//
// On 2026-08-17 Groq retired llama-3.3-70b-versatile. Every run since failed with
// "model does not exist", twice a day, for eight days. The ID was hardcoded in five
// separate files, so a provider's routine deprecation became a five-file outage —
// and llama-3.1-8b-instant, which the repair calls had just moved to, was retired
// with it.
//
// Provider deprecations are normal and will happen again. They should cost one line.
//
// Verify what a key can actually reach:  npm run models
export const MODELS = {
  /** The post itself. Needs the most capability. */
  WRITER: 'openai/gpt-oss-120b',

  /** Mechanical repair — strip a banned phrase, lengthen a draft. No judgement needed. */
  REPAIR: 'openai/gpt-oss-20b',
} as const;

// Groq free tier is limited per MINUTE as well as per day, and a single oversized
// request is rejected outright with a 413 — which is what happened 2026-08-13 to 08-17,
// when the prompt grew past 12,000 tokens as memory filled up. Keep prompts under this.
export const TPM_BUDGET = 8_000;

// Measured 2026-08-25 (npm run models, then read x-ratelimit-limit-tokens):
//   groq/compound        70,000 TPM but a hard per-request body cap — rejects our prompt
//   openai/gpt-oss-120b   8,000 TPM   <- WRITER. Prompt must fit 8k INCLUDING reserved output.
//   openai/gpt-oss-20b    8,000 TPM   <- REPAIR: small prompts, fits comfortably
//   qwen/qwen3.6-27b      8,000 TPM
//
// The 8k models are TIGHTER than the retired llama-3.3-70b's 12k, so moving to one of
// them would have traded a 404 for the same 413 that broke posting 08-13 to 08-17.
