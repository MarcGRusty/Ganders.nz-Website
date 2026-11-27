// Outgoing email through Resend. Every send is logged so Studio can show what went out.
import type { Env } from '../types';
import { esc } from '../render/html';

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  kind: string; // 'form' | 'reply' | 'test' | 'welcome'
}

export function mailReady(env: Env) {
  return !!(env.RESEND_API_KEY || env.MOCK_MAIL === '1');
}

export function fromAddress(env: Env, name = 'Marc Gander') {
  return `${name} <${env.MAIL_FROM || 'NoReply@ganders.nz'}>`;
}

/** Plain text to simple, safe HTML paragraphs. */
export function textToHtml(text: string) {
  return text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

export function wrapHtml(inner: string, footer = '') {
  return `<!doctype html><html><body style="margin:0;background:#EDF0EE;padding:24px 12px;font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0E1B22">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #D5DBDA;border-radius:10px;padding:24px">${inner}</div>
${footer ? `<p style="max-width:560px;margin:12px auto 0;color:#55646B;font-size:13px">${footer}</p>` : ''}</body></html>`;
}

export async function sendMail(env: Env, m: Mail, fromName?: string): Promise<{ ok: boolean; error?: string }> {
  const to = Array.isArray(m.to) ? m.to : [m.to];
  let ok = false;
  let error: string | undefined;
  try {
    if (env.MOCK_MAIL === '1') {
      console.log('MOCK MAIL', JSON.stringify({ to, subject: m.subject, replyTo: m.replyTo }));
      ok = true;
    } else if (!env.RESEND_API_KEY) {
      error = 'Email is not set up yet.';
    } else {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: fromAddress(env, fromName),
          to,
          subject: m.subject,
          text: m.text,
          html: m.html || wrapHtml(textToHtml(m.text)),
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        }),
      });
      if (res.ok) ok = true;
      else {
        const body: any = await res.json().catch(() => ({}));
        error = `${res.status}: ${body?.message || body?.error || 'send failed'}`;
      }
    }
  } catch (e) {
    error = (e as Error).message;
  }
  await env.DB.prepare('INSERT INTO mail_log (to_addr, subject, kind, ok, error) VALUES (?, ?, ?, ?, ?)')
    .bind(to.join(', '), m.subject.slice(0, 200), m.kind, ok ? 1 : 0, error?.slice(0, 500) ?? null).run().catch(() => {});
  return { ok, error };
}

/** Where form emails go: the address in Site details, else the Owner email. */
export async function ownerAddress(env: Env, siteEmail?: string) {
  if (siteEmail && /@/.test(siteEmail)) return siteEmail;
  if (env.OWNER_EMAIL) return env.OWNER_EMAIL;
  const r = await env.DB.prepare("SELECT u.email FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.name = 'Owner' AND u.active = 1 ORDER BY u.id LIMIT 1").first<{ email: string }>();
  return r?.email || '';
}
