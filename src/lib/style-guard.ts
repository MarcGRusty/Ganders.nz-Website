/**
 * Style guard. Every piece of text that is saved or produced by AI passes
 * through here. Rule one: no em dashes, ever. Rule two: flag stock phrasing
 * that makes writing sound machine-made, so it can be rewritten.
 */


/** Phrases that read as generic or AI-written. Matched case-insensitively. */
export const STOCK_PHRASES = [
  'delve', 'tapestry', 'testament to', 'in today\'s fast-paced', 'ever-evolving',
  'game-changer', 'game changer', 'unlock the power', 'unleash', 'elevate your',
  'seamless', 'seamlessly', 'navigate the complexities', 'in the realm of',
  'it\'s important to note', 'rest assured', 'embark on a journey', 'look no further',
  'whether you\'re', 'cutting-edge', 'harness the power', 'at the end of the day',
  'a deep dive', 'dive into', 'treasure trove', 'synergy', 'revolutionize',
];

export interface GuardResult {
  text: string;
  changed: boolean;
  flags: string[];
}

/** Replace em dashes (and spaced en dashes used as em dashes) with natural punctuation. */
export function stripDashes(input: string): string {
  let out = input;
  // Number ranges like 2019–2024 become 2019-2024.
  out = out.replace(/(\d)\s*(?:–|&ndash;|&#8211;|&#x2013;)\s*(\d)/gi, '$1-$2');
  // Dash at the start of a line (dialogue or list) becomes nothing.
  out = out.replace(/(^|\n)[ \t]*(?:\u2014|–|&mdash;|&ndash;|&#821[12];|&#x201[34];)[ \t]*/gi, '$1');
  // Dash right before closing punctuation or end of text is dropped.
  out = out.replace(/[ \t]*(?:\u2014|&mdash;|&#8212;|&#x2014;)[ \t]*(?=[.,;:!?)\]"'\n<]|$)/gi, '');
  // Any remaining em dash, spaced or not, becomes a comma.
  out = out.replace(/[ \t]*(?:\u2014|&mdash;|&#8212;|&#x2014;)[ \t]*/gi, ', ');
  // Spaced en dash used as a pause becomes a comma.
  out = out.replace(/[ \t]+(?:–|&ndash;|&#8211;|&#x2013;)[ \t]+/gi, ', ');
  // Tidy doubled punctuation the swaps can create.
  out = out.replace(/,\s*,/g, ',').replace(/,\s*([.;:!?])/g, '$1');
  return out;
}

export function findStockPhrases(input: string): string[] {
  const lower = input.toLowerCase();
  return STOCK_PHRASES.filter((p) => lower.includes(p));
}

export function guard(input: string): GuardResult {
  const text = stripDashes(input);
  return { text, changed: text !== input, flags: findStockPhrases(text) };
}

/** Deeply apply the dash rule to every string inside a JSON-like value. */
export function guardDeep<T>(value: T): T {
  if (typeof value === 'string') return stripDashes(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => guardDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = guardDeep(v);
    return out as T;
  }
  return value;
}

export const hasDash = (s: string) => /\u2014|&mdash;|&#8212;|&#x2014;/i.test(s);
