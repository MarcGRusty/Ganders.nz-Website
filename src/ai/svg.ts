// Cleans SVG produced by AI (or uploaded) so it is safe to serve from the site:
// no scripts, no event handlers, no external references, no embedded HTML.
export function sanitizeSvg(input: string): string {
  const m = input.match(/<svg[\s\S]*?<\/svg>/i);
  if (!m) throw new Error('No SVG found in the answer.');
  let s = m[0];
  s = s.replace(/<\s*(script|foreignObject|iframe|object|embed|audio|video|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(script|foreignObject|iframe|object|embed|audio|video|style)\b[^>]*\/?>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Only same-document references (#id) are allowed in href / xlink:href.
  s = s.replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '');
  s = s.replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none');
  s = s.replace(/<!ENTITY[\s\S]*?>/gi, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (s.length > 200_000) throw new Error('That SVG is too large.');
  return s;
}
