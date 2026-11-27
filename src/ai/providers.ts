// One small adapter per AI service. Each takes the same request and returns plain text,
// so the router can swap between them freely.
import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../types';

export type Task = 'draft' | 'rewrite' | 'short' | 'ideas' | 'svg' | 'module';

export interface GenRequest {
  system: string;
  prompt: string;
  task: Task;
  maxTokens?: number;
}

export interface ProviderDef {
  id: string;
  label: string;
  needsKey: boolean;
  defaultModel: string;
  /** Suggestions shown in Studio; any model name the service accepts can be typed in. */
  models: string[];
  keyHint: string;
  run(req: GenRequest, ctx: { env: Env; key: string; model: string; signal: AbortSignal }): Promise<string>;
}

/** Shorter tasks need less thinking; long-form writing gets more. */
const EFFORT: Record<Task, 'low' | 'medium' | 'high'> = { short: 'low', ideas: 'medium', rewrite: 'medium', draft: 'high', svg: 'medium', module: 'high' };
const MAX: Record<Task, number> = { short: 2000, ideas: 6000, rewrite: 8000, draft: 16000, svg: 8000, module: 16000 };

async function postJson(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status}: ${data?.error?.message || data?.error || text.slice(0, 200)}`);
  return data;
}

// OpenAI and xAI share the chat completions format.
const chatCompletions = (base: string) => async (req: GenRequest, { key, model, signal }: { key: string; model: string; signal: AbortSignal }) => {
  const data = await postJson(`${base}/chat/completions`, {
    model,
    messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }],
    max_completion_tokens: req.maxTokens ?? MAX[req.task],
  }, { authorization: `Bearer ${key}` }, signal);
  return String(data.choices?.[0]?.message?.content ?? '');
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    needsKey: true,
    defaultModel: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'],
    keyHint: 'From console.anthropic.com, starts with sk-ant-',
    async run(req, { key, model, signal }) {
      const client = new Anthropic({ apiKey: key, maxRetries: 1 });
      const res = await client.beta.messages.create({
        model,
        max_tokens: req.maxTokens ?? MAX[req.task],
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        output_config: { effort: EFFORT[req.task] },
        // If a request is declined by a safety check, retry on a suitable model inside the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as any, { signal });
      if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.');
      return res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
    },
  },
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    needsKey: true,
    defaultModel: 'gpt-5',
    models: ['gpt-5', 'gpt-5-mini'],
    keyHint: 'From platform.openai.com, starts with sk-',
    run: (req, ctx) => chatCompletions('https://api.openai.com/v1')(req, ctx),
  },
  {
    id: 'grok',
    label: 'Grok (xAI)',
    needsKey: true,
    defaultModel: 'grok-4',
    models: ['grok-4', 'grok-4-fast'],
    keyHint: 'From console.x.ai, starts with xai-',
    run: (req, ctx) => chatCompletions('https://api.x.ai/v1')(req, ctx),
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    needsKey: true,
    defaultModel: 'gemini-2.5-pro',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    keyHint: 'From aistudio.google.com',
    async run(req, { key, model, signal }) {
      const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: { maxOutputTokens: req.maxTokens ?? MAX[req.task] },
      }, { 'x-goog-api-key': key }, signal);
      return (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
    },
  },
  {
    id: 'workers',
    label: 'Cloudflare Workers AI (free backup)',
    needsKey: false,
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    keyHint: 'No key needed. Runs on your Cloudflare account.',
    async run(req, { env, model }) {
      if (!env.AI) throw new Error('Workers AI is not available here.');
      const out: any = await env.AI.run(model as any, {
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }],
        max_tokens: Math.min(req.maxTokens ?? MAX[req.task], 4096),
      } as any);
      return String(out?.response ?? '');
    },
  },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);

/**
 * Which services suit which job, best first. Auto mode walks this list, skipping services
 * that are not set up, and moves on if one fails or takes too long.
 */
export const AUTO_ORDER: Record<Task, string[]> = {
  draft: ['claude', 'openai', 'gemini', 'grok', 'workers'],
  rewrite: ['claude', 'openai', 'gemini', 'grok', 'workers'],
  short: ['claude', 'grok', 'openai', 'gemini', 'workers'],
  ideas: ['claude', 'gemini', 'openai', 'grok', 'workers'],
  svg: ['claude', 'openai', 'gemini', 'grok'],
  module: ['claude', 'openai', 'gemini', 'grok'],
};
