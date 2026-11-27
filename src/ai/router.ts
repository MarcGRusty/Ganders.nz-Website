// Picks an AI service for each job (auto mode) or uses the one chosen, falls back when one
// fails, applies Marc's house rules to every prompt, and cleans every answer.
import type { Env } from '../types';
import { PROVIDERS, AUTO_ORDER, providerById, type Task } from './providers';
import { open, seal } from '../lib/crypto';
import { guard } from '../lib/style-guard';

export interface AiSettings {
  mode: string;   // 'auto' or a provider id
  voice: string;  // how Marc writes; added to every prompt
}

// GUESS: adapted from the voice notes in Marc's current site. Editable in Studio.
export const DEFAULT_AI: AiSettings = {
  mode: 'auto',
  voice: 'Write as Marc Gander, in the first person. Warm, curious, practical, with dry Kiwi humour. NZ English spelling. Short paragraphs, plain words, specific details over big claims. No hashtags, no hype, no cliches.',
};

const HOUSE_RULES = [
  'Never use em dashes. Use commas, full stops, colons or brackets instead.',
  'Avoid stock phrasing such as "delve", "tapestry", "game-changer", "unlock", "elevate", "seamless", "in today\'s fast-paced world", and "it\'s not just X, it\'s Y".',
  'Never name or describe Marc\'s children. Use first names only for family. Keep any location at city level or broader.',
  'Do not mention that you are an AI.',
].join('\n');

export async function getAiSettings(env: Env): Promise<AiSettings> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ai'").first<{ value: string }>();
  return { ...DEFAULT_AI, ...(r ? JSON.parse(r.value) : {}) };
}

export async function saveAiSettings(env: Env, s: AiSettings) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')").bind(JSON.stringify(s)).run();
}

interface Row { id: string; enabled: number; enc_key: string | null; model: string }

/** Provider status for Studio. Keys are never sent back, only whether one is saved. */
export async function listProviders(env: Env) {
  const { results } = await env.DB.prepare('SELECT id, enabled, enc_key, model FROM ai_providers').all<Row>();
  return PROVIDERS.map((p) => {
    const r = results.find((x) => x.id === p.id);
    const ready = p.needsKey ? !!r?.enc_key : !!env.AI;
    return { id: p.id, label: p.label, needsKey: p.needsKey, keyHint: p.keyHint, models: p.models, model: r?.model || p.defaultModel, enabled: r ? !!r.enabled : true, hasKey: !!r?.enc_key, ready: ready && (r ? !!r.enabled : true) };
  });
}

export async function saveProvider(env: Env, id: string, patch: { key?: string | null; model?: string; enabled?: boolean }) {
  const p = providerById(id);
  if (!p) throw new Error('Unknown AI service.');
  const cur = await env.DB.prepare('SELECT * FROM ai_providers WHERE id = ?').bind(id).first<Row>();
  let enc = cur?.enc_key ?? null;
  if (patch.key === null || patch.key === '') enc = null;
  else if (patch.key) enc = await seal(env.APP_KEY, patch.key.trim());
  await env.DB.prepare(
    "INSERT INTO ai_providers (id, enabled, enc_key, model, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now')) ON CONFLICT(id) DO UPDATE SET enabled = ?2, enc_key = ?3, model = ?4, updated_at = datetime('now')"
  ).bind(id, patch.enabled === false ? 0 : patch.enabled === true ? 1 : cur?.enabled ?? 1, enc, (patch.model ?? cur?.model ?? p.defaultModel).trim() || p.defaultModel).run();
}

export interface GenerateOptions {
  task: Task;
  prompt: string;
  system?: string;
  choice?: string;   // 'auto' (default from settings) or a provider id
  model?: string;    // optional override for a manual pick
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  provider: string;
  model: string;
  flags: string[];
  tried: { provider: string; error: string }[];
}

const TIMEOUT: Record<Task, number> = { short: 40_000, ideas: 60_000, rewrite: 60_000, draft: 120_000, svg: 90_000, module: 120_000 };

export async function generate(env: Env, o: GenerateOptions): Promise<GenerateResult> {
  const settings = await getAiSettings(env);
  const choice = o.choice && o.choice !== 'default' ? o.choice : settings.mode;
  const system = `${HOUSE_RULES}\n\nVoice: ${settings.voice}${o.system ? `\n\n${o.system}` : ''}`;

  if (env.MOCK_AI === '1') {
    const text = mockAnswer(o.task, o.prompt);
    return { text: guard(text).text, provider: 'mock', model: 'mock', flags: guard(text).flags, tried: [] };
  }

  const { results } = await env.DB.prepare('SELECT id, enabled, enc_key, model FROM ai_providers').all<Row>();
  const order = choice === 'auto' ? AUTO_ORDER[o.task] : [choice];
  const tried: GenerateResult['tried'] = [];

  for (const id of order) {
    const p = providerById(id);
    if (!p) continue;
    const row = results.find((r) => r.id === id);
    if (row && !row.enabled && choice === 'auto') continue;
    if (p.needsKey && !row?.enc_key) { if (choice !== 'auto') throw new Error(`${p.label} is not set up yet. Add its key under AI providers.`); continue; }
    if (!p.needsKey && !env.AI) { if (choice !== 'auto') throw new Error(`${p.label} is not available here.`); continue; }
    const model = (choice !== 'auto' && o.model) || row?.model || p.defaultModel;
    const started = Date.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT[o.task]);
    try {
      const key = p.needsKey ? await open(env.APP_KEY, row!.enc_key!) : '';
      const raw = await p.run({ system, prompt: o.prompt, task: o.task, maxTokens: o.maxTokens }, { env, key, model, signal: ctl.signal });
      if (!raw.trim()) throw new Error('Empty answer.');
      await log(env, o.task, id, model, true, Date.now() - started);
      const g = guard(raw);
      return { text: g.text, provider: id, model, flags: g.flags, tried };
    } catch (e) {
      const msg = ctl.signal.aborted ? 'Took too long.' : (e as Error).message;
      tried.push({ provider: id, error: msg });
      await log(env, o.task, id, model, false, Date.now() - started, msg);
      if (choice !== 'auto') throw new Error(`${p.label}: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
  if (!tried.length) throw new Error('No AI service is set up yet. Add a key under AI providers.');
  throw new Error(`Every AI service failed. ${tried.map((t) => `${providerById(t.provider)?.label}: ${t.error}`).join(' ')}`);
}

async function log(env: Env, task: string, provider: string, model: string, ok: boolean, ms: number, error?: string) {
  await env.DB.prepare('INSERT INTO ai_log (task, provider, model, ok, ms, error) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(task, provider, model, ok ? 1 : 0, ms, error?.slice(0, 500) ?? null).run().catch(() => {});
}

/** Pull JSON out of a model answer that may be wrapped in a code fence or prose. */
export function extractJson<T = any>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('The AI answer was not in the expected format. Try again.');
  return JSON.parse(body.slice(start, end + 1));
}

// Canned answers so the whole flow can be tested without spending money or needing keys.
function mockAnswer(task: Task, prompt: string) {
  if (task === 'svg') return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#0E1B22"/><text x="32" y="44" text-anchor="middle" font-family="Georgia" font-size="34" fill="#E7EBE8">MG</text><circle cx="52" cy="12" r="4" fill="#B9860B"/></svg>';
  if (task === 'ideas') return JSON.stringify([{ title: 'What ten years in IT taught me about trust', angle: 'Lessons from fixing other people\u2019s worst days.' }, { title: 'A Kiwi small business security checklist', angle: 'Five things to do this week.' }, { title: 'Cooking Thai at home in a Wellington southerly', angle: 'Comfort food and the stories behind it.' }]);
  if (task === 'short') return JSON.stringify(['Why I rebuilt my website from scratch', 'A site that finally feels like me', 'Starting over, on purpose']);
  return `<p>This is a sample answer \u2014 written without a real AI service so the flow can be tested.</p><p>${prompt.slice(0, 120).replace(/</g, '&lt;')}</p>`;
}
