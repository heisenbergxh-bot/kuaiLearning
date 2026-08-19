// Document themes for generated lessons. Each theme is a complete, coherent
// light palette (paper / ink / one accent) plus a font personality. The same
// theme drives BOTH rendering (LessonRenderer injects the vars as the base
// stylesheet, so old lessons re-theme instantly) and generation (the lesson
// prompt tells the AI to design inside these exact vars).

export type ThemeFont = 'serif' | 'sans' | 'kai';

export interface LessonThemeVars {
  bg: string;
  bgCard: string;
  text: string;
  textHeading: string;
  textMuted: string;
  border: string;
  accent: string;
  accentLight: string;
  accentBorder: string;
}

export interface LessonTheme {
  id: string;
  name: { zh: string; en: string };
  font: ThemeFont;
  /** One-phrase design direction handed to the AI when generating. */
  styleHint: string;
  vars: LessonThemeVars;
}

export const FONT_STACKS: Record<ThemeFont, string> = {
  serif: `'Source Serif 4','Noto Serif SC',Georgia,'Songti SC','SimSun',serif`,
  sans: `'Inter','Noto Sans SC',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif`,
  kai: `'Kaiti SC',STKaiti,KaiTi,'Noto Serif SC','Source Serif 4',Georgia,serif`,
};

// Google Fonts import covering every font personality above. CJK subsets load
// on demand via unicode-range, so the cost is only paid for glyphs actually used.
export const THEME_FONT_IMPORT =
  `@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');`;

export const LESSON_THEMES: LessonTheme[] = [
  {
    id: 'scholarly-paper',
    name: { zh: '学术纸墨', en: 'Scholarly Paper' },
    font: 'serif',
    styleHint: 'a quiet academic monograph — warm paper, ink-black text, one restrained oxblood accent, hairline rules, booktabs tables',
    vars: { bg: '#fbf8f0', bgCard: '#f5f0e5', text: '#2d2822', textHeading: '#17130d', textMuted: '#6f6557', border: '#ded4c0', accent: '#9a3b2e', accentLight: '#f4e9e1', accentBorder: '#d8b8ab' },
  },
  {
    id: 'ivory-minimal',
    name: { zh: '米白极简', en: 'Ivory Minimal' },
    font: 'sans',
    styleHint: 'swiss minimalism — near-white ground, monochrome ink, no decoration beyond hairline rules',
    vars: { bg: '#fafafa', bgCard: '#f2f2f0', text: '#262626', textHeading: '#0a0a0a', textMuted: '#737373', border: '#e5e5e0', accent: '#0a0a0a', accentLight: '#ececea', accentBorder: '#cfcfc8' },
  },
  {
    id: 'celadon',
    name: { zh: '青瓷', en: 'Celadon' },
    font: 'serif',
    styleHint: 'song-dynasty celadon porcelain — pale green-grey glaze, deep pine-green accent, calm and cool',
    vars: { bg: '#f2f5f0', bgCard: '#e9efe6', text: '#25311f', textHeading: '#16210f', textMuted: '#5f6f58', border: '#cfdbca', accent: '#3d6b4f', accentLight: '#e3ece1', accentBorder: '#b3c8b4' },
  },
  {
    id: 'indigo-ink',
    name: { zh: '黛蓝', en: 'Indigo Ink' },
    font: 'serif',
    styleHint: 'a library reading room — cool paper, deep indigo accent like fountain-pen ink',
    vars: { bg: '#f7f8fa', bgCard: '#eef1f5', text: '#232a35', textHeading: '#10161f', textMuted: '#5d6673', border: '#d3d9e2', accent: '#2f4b8f', accentLight: '#e6ebf5', accentBorder: '#b3c0da' },
  },
  {
    id: 'cinnabar',
    name: { zh: '朱砂', en: 'Cinnabar' },
    font: 'kai',
    styleHint: 'a classical Chinese manuscript — warm rice paper, cinnabar-red seal accents, calligraphic rhythm',
    vars: { bg: '#fbf3ec', bgCard: '#f6e9df', text: '#33241d', textHeading: '#1d120c', textMuted: '#7a5f52', border: '#e6d3c2', accent: '#c0392b', accentLight: '#f7e3dd', accentBorder: '#e0b3a6' },
  },
  {
    id: 'gamboge',
    name: { zh: '藤黄', en: 'Gamboge' },
    font: 'serif',
    styleHint: 'an aged field notebook — cream paper, deep amber accents, botanical-illustration warmth',
    vars: { bg: '#fbf7ea', bgCard: '#f6efda', text: '#332d1c', textHeading: '#1d190c', textMuted: '#76694a', border: '#e6dab7', accent: '#b07908', accentLight: '#f6ecd2', accentBorder: '#e0cb93' },
  },
  {
    id: 'wisteria',
    name: { zh: '紫藤', en: 'Wisteria' },
    font: 'serif',
    styleHint: 'a poetry chapbook — lilac-tinged paper, muted violet accent, gentle and literary',
    vars: { bg: '#f8f6fa', bgCard: '#f0ecf4', text: '#2a2433', textHeading: '#160f1d', textMuted: '#685f73', border: '#dbd3e2', accent: '#6d4b8f', accentLight: '#ece4f3', accentBorder: '#c5b3d8' },
  },
  {
    id: 'teal-harbor',
    name: { zh: '黛螺', en: 'Teal Harbor' },
    font: 'sans',
    styleHint: 'a maritime field guide — seafoam paper, deep teal accent, crisp and navigational',
    vars: { bg: '#f3f7f6', bgCard: '#e8f0ee', text: '#1f2d2b', textHeading: '#0c1715', textMuted: '#57706c', border: '#c9dcd8', accent: '#1f6f68', accentLight: '#dfeeeb', accentBorder: '#a9ccc5' },
  },
  {
    id: 'rose-letter',
    name: { zh: '玫瑰信笺', en: 'Rose Letter' },
    font: 'serif',
    styleHint: 'a handwritten letter on rose-tinted stationery — dried-rose accent, intimate and warm',
    vars: { bg: '#fbf4f3', bgCard: '#f7e9e7', text: '#352325', textHeading: '#1d0f11', textMuted: '#7d5f63', border: '#ead2cf', accent: '#b04a5e', accentLight: '#f7e2e5', accentBorder: '#e2b5bd' },
  },
  {
    id: 'bamboo',
    name: { zh: '竹青', en: 'Bamboo' },
    font: 'kai',
    styleHint: 'a bamboo-grove studio — pale leaf-green paper, bamboo-green accent, literati freshness',
    vars: { bg: '#f3f7ec', bgCard: '#eaf1de', text: '#26301b', textHeading: '#131b0a', textMuted: '#61704c', border: '#d3dfc0', accent: '#5c7a29', accentLight: '#e8f0d8', accentBorder: '#bfd3a0' },
  },
  {
    id: 'coffee-journal',
    name: { zh: '咖啡手记', en: 'Coffee Journal' },
    font: 'serif',
    styleHint: 'a café notebook — latte paper, espresso-brown accent, unhurried and tactile',
    vars: { bg: '#f7f2ea', bgCard: '#f0e8db', text: '#2e2519', textHeading: '#171006', textMuted: '#6f6046', border: '#dfd2ba', accent: '#7a4a1f', accentLight: '#f0e4d2', accentBorder: '#d3b58f' },
  },
  {
    id: 'graphite',
    name: { zh: '石墨', en: 'Graphite' },
    font: 'sans',
    styleHint: 'a pencil-drawn engineering pad — neutral greys only, precise and textureless',
    vars: { bg: '#f5f5f4', bgCard: '#ebebe9', text: '#29292a', textHeading: '#111112', textMuted: '#6b6b6d', border: '#d7d7d4', accent: '#3f3f46', accentLight: '#e7e7e4', accentBorder: '#c3c3bf' },
  },
  {
    id: 'sea-salt',
    name: { zh: '海盐', en: 'Sea Salt' },
    font: 'sans',
    styleHint: 'a coastal field report — salt-air blue-grey paper, ocean-blue accent, breezy clarity',
    vars: { bg: '#f4f8f9', bgCard: '#e9f1f3', text: '#1f2d33', textHeading: '#0b161b', textMuted: '#587079', border: '#ccdee3', accent: '#2b7a9e', accentLight: '#e0eef3', accentBorder: '#aacfdd' },
  },
  {
    id: 'sakura',
    name: { zh: '樱', en: 'Sakura' },
    font: 'serif',
    styleHint: 'spring ephemera — blush-pink paper, sakura accent, soft but never saccharine',
    vars: { bg: '#fdf5f5', bgCard: '#faeaea', text: '#372426', textHeading: '#1e0f11', textMuted: '#84656a', border: '#f0d6d6', accent: '#c76b7c', accentLight: '#fae3e6', accentBorder: '#eab6bf' },
  },
  {
    id: 'mint',
    name: { zh: '薄荷', en: 'Mint' },
    font: 'sans',
    styleHint: 'a botanical glasshouse label — cool mint paper, leaf-green accent, clean and oxygenated',
    vars: { bg: '#f2f9f5', bgCard: '#e6f3eb', text: '#1d3026', textHeading: '#0a1810', textMuted: '#547061', border: '#c7e2d2', accent: '#2e8b62', accentLight: '#dff0e6', accentBorder: '#a8d7bd' },
  },
  {
    id: 'dune',
    name: { zh: '沙丘', en: 'Dune' },
    font: 'serif',
    styleHint: 'a desert expedition diary — sand paper, burnt-ochre accent, dry and expansive',
    vars: { bg: '#faf5ec', bgCard: '#f4ecdd', text: '#322a1d', textHeading: '#1a1409', textMuted: '#74664c', border: '#e5d8bf', accent: '#a06a2c', accentLight: '#f4e8d2', accentBorder: '#dec69c' },
  },
  {
    id: 'cyanotype',
    name: { zh: '蓝晒', en: 'Cyanotype' },
    font: 'sans',
    styleHint: 'an architect\'s blueprint washed pale — ice-blue paper, prussian-blue accent, technical elegance',
    vars: { bg: '#f2f6f9', bgCard: '#e7eff4', text: '#1d2a38', textHeading: '#0a141f', textMuted: '#54687a', border: '#c8d8e4', accent: '#1f5fa8', accentLight: '#dfeaf6', accentBorder: '#a7c4e3' },
  },
  {
    id: 'forest',
    name: { zh: '墨绿', en: 'Forest' },
    font: 'serif',
    styleHint: 'a naturalist\'s herbarium — moss-tinted paper, deep forest-green accent, dense and organic',
    vars: { bg: '#f3f6f1', bgCard: '#e9efe4', text: '#22301f', textHeading: '#0f180c', textMuted: '#5a6f52', border: '#cfdcc6', accent: '#33652e', accentLight: '#e2ecda', accentBorder: '#b2cba0' },
  },
  {
    id: 'peach',
    name: { zh: '蜜桃', en: 'Peach' },
    font: 'serif',
    styleHint: 'a summer recipe card — peach-cream paper, apricot accent, warm and inviting',
    vars: { bg: '#fdf6f0', bgCard: '#faede2', text: '#362618', textHeading: '#1e1207', textMuted: '#82644e', border: '#f0d9c2', accent: '#c06a2a', accentLight: '#fae6d4', accentBorder: '#ecc39e' },
  },
  {
    id: 'glacier',
    name: { zh: '冰川', en: 'Glacier' },
    font: 'sans',
    styleHint: 'a polar research log — glacial blue-white paper, steel-blue accent, cool precision',
    vars: { bg: '#f4f8fb', bgCard: '#eaf1f7', text: '#1e2c3a', textHeading: '#0b1520', textMuted: '#567084', border: '#cbdce9', accent: '#3a7ca8', accentLight: '#e2eef7', accentBorder: '#accde2' },
  },
  {
    id: 'newsprint',
    name: { zh: '复古报纸', en: 'Newsprint' },
    font: 'serif',
    styleHint: 'a 1920s broadsheet — yellowed newsprint, ink-black accent, editorial gravity',
    vars: { bg: '#f6f1e3', bgCard: '#efe8d4', text: '#2a251a', textHeading: '#12100a', textMuted: '#6e6450', border: '#ddd2b5', accent: '#26303a', accentLight: '#eae2cc', accentBorder: '#cfc09b' },
  },
  {
    id: 'persimmon',
    name: { zh: '秋柿', en: 'Persimmon' },
    font: 'kai',
    styleHint: 'an autumn tea-house menu — persimmon-dyed paper, burnt-orange accent, harvest warmth',
    vars: { bg: '#fbf3ea', bgCard: '#f7e8d8', text: '#332317', textHeading: '#1c1007', textMuted: '#7a5f47', border: '#ecd8bd', accent: '#c2571d', accentLight: '#f8e4d2', accentBorder: '#e8bc93' },
  },
];

export const DEFAULT_LESSON_THEME_ID = 'scholarly-paper';

export function getLessonTheme(id?: string): LessonTheme {
  return LESSON_THEMES.find(t => t.id === id) ?? LESSON_THEMES[0];
}

// `:root{ ... }` block for the generation prompt — the AI copies these values
// verbatim into the lesson's own stylesheet.
export function themeVarsPromptLine(theme: LessonTheme): string {
  const v = theme.vars;
  return `:root{ --bg:${v.bg}; --bg-card:${v.bgCard}; --text:${v.text}; --text-heading:${v.textHeading}; --text-muted:${v.textMuted}; --border:${v.border}; --accent:${v.accent}; --accent-light:${v.accentLight}; --accent-border:${v.accentBorder}; }`;
}
