// Reads the readable text of a web page, for the knowledge base.
export async function pageText(url: string, maxChars = 20_000): Promise<{ title: string; text: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; GandersStudio/1.0; knowledge base)', accept: 'text/html,text/plain' } });
    if (!res.ok) throw new Error(`That page answered ${res.status}.`);
    const raw = (await res.text()).slice(0, 1_500_000);
    if (!/html/i.test(res.headers.get('content-type') || 'html')) return { title: new URL(url).hostname, text: raw.slice(0, maxChars) };
    const title = (raw.match(/<title[^>]*>([^<]{0,200})/i)?.[1] || new URL(url).hostname).replace(/\s+/g, ' ').trim();
    // Prefer the article or main element when there is one.
    const main = raw.match(/<article[\s\S]*?<\/article>/i)?.[0] || raw.match(/<main[\s\S]*?<\/main>/i)?.[0] || raw;
    const text = main
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|br|tr|section|article|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    return { title, text: text.slice(0, maxChars) };
  } catch (e) {
    throw new Error((e as Error).name === 'AbortError' ? 'That page took too long to open.' : (e as Error).message);
  } finally { clearTimeout(t); }
}
