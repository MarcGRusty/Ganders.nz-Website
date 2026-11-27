// Theme presets. Each one starts from something real (a chart, a notebook, a workshop) so the
// site never falls back on default-looking choices. Custom themes use the same shape.
import type { Theme, Palette } from '../types';

const pal = (paper: string, surface: string, ink: string, muted: string, line: string, accent: string, onAccent: string, accent2: string): Palette =>
  ({ paper, surface, ink, muted, line, accent, onAccent, accent2 });

const base = { maxWidth: 1120, motion: true, mode: 'auto' as const, toggle: true, textureStrength: 0.7, border: 1 };

export const PRESETS: (Theme & { blurb: string })[] = [
  {
    ...base, preset: 'harbour', name: 'Harbour',
    blurb: 'A nautical chart. Pale chart paper, deep navy ink, buoy orange that turns sodium-lamp amber at night.',
    light: pal('#E6ECEE', '#EEF2F3', '#0F2A3D', '#557080', '#B9C9D1', '#E2571E', '#FFFFFF', '#1F6A80'),
    dark: pal('#0A1822', '#0F202C', '#D9E6EC', '#7E98A6', '#1F3746', '#F2A541', '#0A1822', '#5DB6CF'),
    displayFont: 'Archivo', bodyFont: 'Atkinson Hyperlegible', monoFont: 'IBM Plex Mono',
    displayWeight: 800, displayWidth: 125, displayItalic: false, displayUpper: true,
    radius: 0, shadow: 'none', texture: 'contour',
  },
  {
    ...base, preset: 'margin', name: 'Margin',
    blurb: 'A good notebook. White page, ink-blue links, red pencil notes in the margin. Made for writing.',
    light: pal('#FCFCFA', '#F5F5F1', '#1B1F2A', '#6B7080', '#E3E2DC', '#1F4FA8', '#FFFFFF', '#B23A2E'),
    dark: pal('#15171C', '#1B1E24', '#E7E5DF', '#9A9DA6', '#2C3039', '#8DB0F0', '#15171C', '#E58A7E'),
    displayFont: 'Newsreader', bodyFont: 'Newsreader', monoFont: 'IBM Plex Mono',
    displayWeight: 500, displayWidth: 100, displayItalic: true, displayUpper: false,
    radius: 2, shadow: 'none', texture: 'none', maxWidth: 1040,
  },
  {
    ...base, preset: 'bench', name: 'Bench',
    blurb: 'A workshop wall. Grey-green paint, pegboard dots, an oiled timber accent. Good for projects and build logs.',
    light: pal('#DCE0DA', '#E4E7E2', '#1E2420', '#5D675F', '#BCC4BC', '#B46E12', '#FFFFFF', '#3F6B52'),
    dark: pal('#171B18', '#1D221E', '#E3E6E0', '#98A298', '#313932', '#E0A04A', '#171B18', '#7FB394'),
    displayFont: 'Bricolage Grotesque', bodyFont: 'Figtree', monoFont: 'JetBrains Mono',
    displayWeight: 800, displayWidth: 100, displayItalic: false, displayUpper: false,
    radius: 3, shadow: 'none', texture: 'dots',
  },
  {
    ...base, preset: 'contact', name: 'Contact Sheet',
    blurb: 'A darkroom contact sheet. Photo-paper white or black, a safelight amber used sparingly. Lets photos lead.',
    light: pal('#F5F5F3', '#FFFFFF', '#141414', '#6A6A6A', '#DADADA', '#B4561C', '#FFFFFF', '#3A3A3A'),
    dark: pal('#0E0E0E', '#161616', '#ECECEA', '#8C8C8A', '#262626', '#E07A3A', '#0E0E0E', '#BDBDBD'),
    displayFont: 'Big Shoulders Display', bodyFont: 'Geist', monoFont: 'Geist Mono',
    displayWeight: 800, displayWidth: 100, displayItalic: false, displayUpper: true,
    radius: 0, shadow: 'none', texture: 'grain', textureStrength: 0.5,
  },
  {
    ...base, preset: 'bach', name: 'Bach',
    blurb: 'A Kiwi holiday bach. Sun-faded sea green, pohutukawa red, Formica yellow. Playful, good for summer.',
    light: pal('#D9EAE2', '#E6F1EC', '#23312E', '#4F6560', '#B7D0C5', '#C9413B', '#FFFFFF', '#F2C14E'),
    dark: pal('#12201E', '#182A27', '#EAE6DA', '#9DB3AC', '#26403B', '#F07A6A', '#12201E', '#E8B640'),
    displayFont: 'Shrikhand', bodyFont: 'Work Sans', monoFont: 'IBM Plex Mono',
    displayWeight: 400, displayWidth: 100, displayItalic: false, displayUpper: false,
    radius: 999, shadow: 'hard', texture: 'none',
  },
  {
    ...base, preset: 'southerly', name: 'Southerly',
    blurb: 'A Wellington sky before rain, harbour-at-night ink and kowhai gold. The first look built for the site.',
    light: pal('#E7EBE8', '#EEF1EF', '#0E1B22', '#55646B', '#C9D1CD', '#B9860B', '#0E1B22', '#1F5F6B'),
    dark: pal('#0E1B22', '#13232B', '#E2E8E5', '#8FA0A7', '#243840', '#E0B24A', '#0E1B22', '#6DB3C2'),
    displayFont: 'Bricolage Grotesque', bodyFont: 'Hanken Grotesk', monoFont: 'IBM Plex Mono',
    displayWeight: 500, displayWidth: 100, displayItalic: false, displayUpper: false,
    radius: 2, shadow: 'none', texture: 'none',
  },
];

export const DEFAULT_THEME: Theme = (() => { const { blurb, ...t } = PRESETS[0]; void blurb; return t; })();

/** Google Fonts axis specs for fonts we know. Unknown fonts load their regular weight only, which never fails. */
export const FONT_SPECS: Record<string, string> = {
  'Archivo': 'wdth,wght@62..125,400..800',
  'Atkinson Hyperlegible': 'ital,wght@0,400;0,700;1,400;1,700',
  'IBM Plex Mono': 'wght@400;500',
  'Newsreader': 'ital,opsz,wght@0,6..72,400..700;1,6..72,400..700',
  'Bricolage Grotesque': 'opsz,wght@12..96,400..800',
  'Figtree': 'ital,wght@0,400..800;1,400..800',
  'JetBrains Mono': 'wght@400;500',
  'Big Shoulders Display': 'wght@400..900',
  'Geist': 'wght@400..800',
  'Geist Mono': 'wght@400;500',
  'Shrikhand': '',
  'Work Sans': 'ital,wght@0,400..800;1,400..800',
  'Hanken Grotesk': 'ital,wght@0,400..800;1,400..800',
  'Instrument Sans': 'ital,wdth,wght@0,75..100,400..700;1,75..100,400..700',
  'Instrument Serif': 'ital@0;1',
  'Fraunces': 'ital,opsz,wght@0,9..144,400..800;1,9..144,400..800',
  'Syne': 'wght@400..800',
  'Unbounded': 'wght@400..800',
  'DM Serif Display': 'ital@0;1',
  'Familjen Grotesk': 'wght@400..700',
  'Young Serif': '',
  'Gloock': '',
  'Source Serif 4': 'ital,opsz,wght@0,8..60,400..800;1,8..60,400..800',
  'Public Sans': 'ital,wght@0,400..800;1,400..800',
  'DM Mono': 'wght@400;500',
  'Space Mono': 'wght@400;700',
  'Martian Mono': 'wght@400..600',
  'Space Grotesk': 'wght@400..700',
  'Caveat': 'wght@400..700',
};

const HEX = /^#[0-9a-f]{6}$/i;
const KEYS: (keyof Palette)[] = ['paper', 'surface', 'ink', 'muted', 'line', 'accent', 'onAccent', 'accent2'];

/** Accepts anything saved (including the older flat theme) and returns a complete, safe theme. */
export function normalizeTheme(raw: any): Theme {
  if (!raw || typeof raw !== 'object' || !raw.light) return { ...DEFAULT_THEME };
  const from = PRESETS.find((p) => p.preset === raw.preset) || PRESETS[0];
  const cleanPal = (p: any, d: Palette): Palette => Object.fromEntries(KEYS.map((k) => [k, HEX.test(p?.[k]) ? p[k] : d[k]])) as unknown as Palette;
  const font = (v: any, d: string) => (typeof v === 'string' && /^[A-Za-z0-9 ]{2,60}$/.test(v) ? v : d);
  const num = (v: any, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const one = <T extends string>(v: any, list: T[], d: T) => (list.includes(v) ? v : d);
  return {
    preset: typeof raw.preset === 'string' ? raw.preset.slice(0, 60) : from.preset,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : from.name,
    light: cleanPal(raw.light, from.light),
    dark: cleanPal(raw.dark, from.dark),
    displayFont: font(raw.displayFont, from.displayFont),
    bodyFont: font(raw.bodyFont, from.bodyFont),
    monoFont: font(raw.monoFont, from.monoFont),
    displayWeight: num(raw.displayWeight, from.displayWeight, 100, 900),
    displayWidth: num(raw.displayWidth, from.displayWidth, 50, 150),
    displayItalic: !!raw.displayItalic,
    displayUpper: !!raw.displayUpper,
    radius: num(raw.radius, from.radius, 0, 999),
    border: num(raw.border, from.border, 0, 4),
    shadow: one(raw.shadow, ['none', 'hard', 'soft'], from.shadow),
    texture: one(raw.texture, ['none', 'grain', 'contour', 'dots'], from.texture),
    textureStrength: num(raw.textureStrength, from.textureStrength, 0, 1),
    maxWidth: num(raw.maxWidth, from.maxWidth, 720, 1600),
    motion: raw.motion !== false,
    mode: one(raw.mode, ['auto', 'light', 'dark'], 'auto'),
    toggle: raw.toggle !== false,
  };
}

// WCAG contrast, used by Studio to warn before saving a theme that is hard to read.
function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
