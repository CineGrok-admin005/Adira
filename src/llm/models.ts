// Model selection, resolved at runtime against what the key can actually reach.
//
// On 2026-08-17 Groq retired llama-3.3-70b-versatile. Every run failed with 404 twice a
// day for eight days. The ID was hardcoded in five files, and llama-3.1-8b-instant — the
// model the repair calls had just moved to — was retired in the same sweep, so the
// fallback was dead too. A provider deprecation is routine; it should never be an outage.
//
// So nothing is hardcoded to a single ID any more. Each role has an ordered preference
// list, and the first one the API actually offers wins. If the preferred model disappears,
// the next run silently continues on the next choice and tells you it happened.
//
// Inspect what a key can reach:  npm run models

const PREFERENCES = {
  // The post itself. Needs the most capability.
  writer: ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b'],
  // Mechanical repair — strip a banned phrase, lengthen a draft. No judgement needed.
  repair: ['openai/gpt-oss-20b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-120b'],
} as const;

// Measured 2026-08-25 via x-ratelimit-limit-tokens:
//   groq/compound        70,000 TPM but a hard per-request body cap — rejects our prompt
//   openai/gpt-oss-120b   8,000 TPM
//   openai/gpt-oss-20b    8,000 TPM
//   qwen/qwen3.6-27b      8,000 TPM
// Every available model is TIGHTER than the retired llama's 12k, which is why the prompt
// had to shrink as well as the ID change. Keep requests under this.
export const TPM_BUDGET = 8_000;

export interface ResolvedModels { writer: string; repair: string }

let cached: ResolvedModels | null = null;

async function listAvailable(): Promise<string[]> {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Groq /models returned ${res.status}`);
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id);
}

/**
 * Resolve once per process. On a fallback or a total miss it raises a Telegram alert —
 * degrading quietly is what let eight days of 404s go unnoticed, so this stays loud.
 */
export async function resolveModels(): Promise<ResolvedModels> {
  if (cached) return cached;

  let available: string[];
  try {
    available = await listAvailable();
  } catch (err) {
    // Can't check — proceed on first choice rather than blocking the run. If that ID is
    // dead the call itself fails and the existing alerting reports it.
    console.warn('⚠️  Could not list Groq models, using first preference:', err instanceof Error ? err.message : err);
    return (cached = { writer: PREFERENCES.writer[0], repair: PREFERENCES.repair[0] });
  }

  const notices: string[] = [];

  const pick = (role: 'writer' | 'repair'): string => {
    const prefs = PREFERENCES[role];
    const found = prefs.find((m) => available.includes(m));
    if (!found) {
      notices.push(
        `❌ No ${role} model available. Tried: ${prefs.join(', ')}.\nGroq currently offers: ${available.join(', ')}`
      );
      return prefs[0]; // let the call fail loudly rather than guessing an unrelated model
    }
    if (found !== prefs[0]) {
      notices.push(`⚠️ ${role}: "${prefs[0]}" is gone — fell back to "${found}". Update PREFERENCES in src/llm/models.ts.`);
    }
    return found;
  };

  cached = { writer: pick('writer'), repair: pick('repair') };

  if (notices.length > 0) {
    const msg = `ADIRA — model availability changed\n\n${notices.join('\n\n')}`;
    console.warn(msg);
    try {
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (chatId) {
        const { bot } = await import('../telegram/bot');
        await bot.sendMessage(chatId, msg);
      }
    } catch { /* never let an alert break the run */ }
  }

  return cached;
}
