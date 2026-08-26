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

// Every reasoning model on this key uses a DIFFERENT parameter shape, discovered the hard
// way on 2026-08-26: openai/gpt-oss-* requires reasoning_effort in {low,medium,high} and
// rejects 'none' outright; qwen/qwen3.6-27b requires {none,default} and rejects 'low'. A
// hardcoded 'low' worked while resolveModels() picked gpt-oss-120b, but would have thrown a
// 400 the moment the self-healing fallback ever routed to qwen — the exact situation this
// fallback exists for. Every model resolveModels() can hand back must be covered here.
//
// gpt-oss without these params still burns real completion budget on hidden reasoning (a
// trivial 2-sentence request used 28 reasoning tokens by default) — low+hidden keeps that
// budget for the actual post. qwen with effort='none' skips reasoning entirely; it does not
// need reasoning_format (untested and not required to get clean output).
export function reasoningParamsFor(model: string): Record<string, string> {
  if (model.startsWith('openai/gpt-oss')) {
    return { reasoning_effort: 'low', reasoning_format: 'hidden' };
  }
  if (model.startsWith('qwen/')) {
    return { reasoning_effort: 'none' };
  }
  // Unknown family (e.g. groq/compound, allam-2-7b if PREFERENCES ever grows to include
  // them) — omit reasoning params entirely rather than guess a value that 400s.
  return {};
}


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

// Rough token estimate. Deliberately conservative — Devanagari and punctuation tokenise
// worse than plain English, so we assume ~3 chars/token rather than the usual ~4.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Drop items from the tail of a list until the whole request is estimated to fit.
 *
 * This exists because hand-tuned constants already failed once: the prompt was sized to
 * fit 12,000 TPM, then adira_memory started filling up, the prompt grew a little every
 * day, and on 2026-08-13 it crossed the line and posting stopped for four days before the
 * model was retired on top of it. Anything that GROWS over time will do that again.
 *
 * So the budget is enforced at runtime rather than assumed at design time.
 */
export function fitToBudget<T>(
  items: T[],
  render: (kept: T[]) => string,
  reservedOutputTokens: number,
  budget = TPM_BUDGET,
  minItems = 1,
): { kept: T[]; estimated: number; dropped: number } {
  // 2026-08-26: the char/3 heuristic landed only 23 tokens over budget on real content
  // (numbers and punctuation tokenise worse than prose). A fixed safety margin is cheaper
  // and more robust than re-tuning the char/token ratio for every kind of text we might see.
  const SAFETY_MARGIN = 400;
  const ceiling = budget - reservedOutputTokens - SAFETY_MARGIN;
  let kept = [...items];
  while (kept.length > minItems && estimateTokens(render(kept)) > ceiling) {
    kept.pop();
  }
  return { kept, estimated: estimateTokens(render(kept)), dropped: items.length - kept.length };
}
