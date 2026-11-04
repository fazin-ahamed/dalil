#!/usr/bin/env node
// WCAG 2.1 contrast report for the Dalil design tokens.
// Reads ../tokens.css (never written), resolves the default :root hex values, checks the
// pairs in PAIRS, and writes contrast-report.md beside this file. Node built-ins only.
// Exits 0 either way; the report carries the verdicts.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS_FILE = resolve(HERE, '..', 'tokens.css');
const REPORT_FILE = resolve(HERE, 'contrast-report.md');

const TEXT = { label: '4.5:1 (text)', min: 4.5 };
const NON_TEXT = { label: '3.0:1 (non-text)', min: 3.0 };

const PAPER = ['color-paper', 'color-paper-2', 'color-paper-3'];
const NOTCH_SURFACES = ['notch-bg', 'notch-raised'];

const PAIRS = [
  ...['color-ink', 'color-ink-2', 'color-muted', 'color-accent'].flatMap((fg) =>
    PAPER.map((bg) => ({ fg, bg, need: TEXT }))),
  { fg: 'color-accent-ink', bg: 'color-accent', need: TEXT },
  ...['color-error', 'color-success', 'color-warn'].map((fg) => ({ fg, bg: 'color-paper-2', need: TEXT })),
  { fg: 'color-signal', bg: 'color-paper', need: NON_TEXT },
  { fg: 'color-rule-strong', bg: 'color-paper', need: NON_TEXT },
  ...['notch-ink', 'notch-ink-2', 'notch-muted', 'notch-accent', 'notch-ok', 'notch-warn', 'notch-error'].flatMap((fg) =>
    NOTCH_SURFACES.map((bg) => ({ fg, bg, need: TEXT }))),
  { fg: 'notch-primary-ink', bg: 'notch-primary', need: TEXT },
  { fg: 'notch-focus', bg: 'notch-bg', need: NON_TEXT },
  { fg: 'notch-rule', bg: 'notch-bg', need: NON_TEXT },
  { fg: 'color-focus', bg: 'color-paper', need: NON_TEXT },
];

const css = readFileSync(TOKENS_FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(body) {
  const map = new Map();
  for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(name, value.trim());
  }
  return map;
}

const rootBlock = css.match(/:root\s*\{([^}]*)\}/);
if (!rootBlock) throw new Error(`No :root block in ${TOKENS_FILE}`);
const tokens = declarations(rootBlock[1]);

const contrastBlock = css.match(/@media\s*\(prefers-contrast:\s*more\)\s*\{\s*:root\s*\{([^}]*)\}/);
const highContrast = contrastBlock ? declarations(contrastBlock[1]) : new Map();

function hexOf(name, source = tokens, chain = []) {
  if (chain.includes(name)) throw new Error(`Circular var() chain: ${[...chain, name].join(' -> ')}`);
  const raw = source.get(name);
  if (raw === undefined) throw new Error(`--${name} is not defined in :root of ${TOKENS_FILE}`);
  const alias = raw.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (alias) return hexOf(alias[1], source, [...chain, name]);
  const m = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) throw new Error(`--${name} is not a hex colour: "${raw}"`);
  const six = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${six.toUpperCase()}`;
}

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb) =>
  `#${rgb
    .map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

function toHsl(hex) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function fromHsl({ h, s, l }) {
  const channel = (p, q, t) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  if (s === 0) return toHex([l, l, l].map((v) => v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return toHex([channel(p, q, h + 1 / 3), channel(p, q, h), channel(p, q, h - 1 / 3)].map((v) => v * 255));
}

const linear = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const passes = (ratio, min) => ratio + 1e-9 >= min;
const shown = (ratio) => (Math.floor(ratio * 10 + 1e-9) / 10).toFixed(1);

function suggest(token) {
  const involved = PAIRS.filter((p) => p.fg === token || p.bg === token);
  const start = toHsl(hexOf(token));
  const holds = (hex) =>
    involved.every((p) =>
      passes(contrast(p.fg === token ? hex : hexOf(p.fg), p.bg === token ? hex : hexOf(p.bg)), p.need.min));
  let best = null;
  for (const dir of [-1, 1]) {
    for (let i = 1; i <= 2000; i++) {
      const l = start.l + dir * i * 0.0005;
      if (l < 0 || l > 1) break;
      const hex = fromHsl({ ...start, l });
      if (holds(hex)) {
        if (!best || i < best.steps) best = { hex, steps: i };
        break;
      }
    }
  }
  return best;
}

const results = PAIRS.map((p) => {
  const fgHex = hexOf(p.fg);
  const bgHex = hexOf(p.bg);
  const ratio = contrast(fgHex, bgHex);
  return { ...p, fgHex, bgHex, ratio, pass: passes(ratio, p.need.min) };
});
const failing = results.filter((r) => !r.pass);
const passCount = results.length - failing.length;

const fixes = [...new Set(failing.map((r) => r.fg))].map((token) => ({
  token,
  current: hexOf(token),
  suggestion: suggest(token),
  pairs: failing.filter((r) => r.fg === token),
}));

const rule = highContrast.has('notch-rule')
  ? (() => {
      const hex = hexOf('notch-rule', highContrast);
      const ratio = contrast(hex, hexOf('notch-bg'));
      return { hex, ratio, pass: passes(ratio, NON_TEXT.min) };
    })()
  : null;

const pairLabel = (r) => `\`--${r.fg}\` (${r.fgHex}) on \`--${r.bg}\` (${r.bgHex})`;
const failureRows = fixes.flatMap((f) =>
  f.pairs.map((r) => {
    const suggested = f.suggestion ? `**${f.suggestion.hex}**` : 'no lightness-only fix';
    const after = f.suggestion ? shown(contrast(f.suggestion.hex, r.bgHex)) : '-';
    return `| \`--${f.token}\` | ${f.current} | ${suggested} | on \`--${r.bg}\` (${r.bgHex}) | ${shown(r.ratio)} | ${after} | ${r.need.label} |`;
  }),
);

const out = [
  '# Contrast report: Dalil design tokens',
  '',
  `Source: \`${TOKENS_FILE}\`, default \`:root\` values. Method: WCAG 2.1 relative luminance.`,
  `Requirements: text ${TEXT.min}:1, non-text ${NON_TEXT.min}:1. No pair is marked as large text, so every text pair is held to ${TEXT.min}:1.`,
  'Ratios are truncated to one decimal, never rounded up, so the shown value and the verdict always agree.',
  '',
  `**${results.length} pairs: ${passCount} pass, ${failing.length} fail.**`,
  '',
  '## Failures',
  '',
];
if (failing.length) {
  out.push(
    '| Token | Current | Suggested | Pair | Ratio now | Ratio after | Requirement |',
    '|---|---|---|---|---|---|---|',
    ...failureRows,
    '',
  );
} else {
  out.push('None.', '');
}
out.push(
  '## All pairs',
  '',
  '| Pair | Ratio | Requirement | Result |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${pairLabel(r)} | ${shown(r.ratio)} | ${r.need.label} | ${r.pass ? 'PASS' : '**FAIL**'} |`),
  '',
  '## Notes',
  '',
  "- Suggested hexes keep each token's hue and saturation and change only lightness, taking the smallest step that passes every listed pair that uses the token. Other uses of the token were not checked.",
  '- WCAG 1.4.11 applies only to non-text that identifies a control or its state, or to graphics needed to understand content. If `--color-rule-strong` or `--notch-rule` only draws decorative dividers, its failure does not apply. If either outlines an input or control, apply the suggestion.',
);
if (rule) {
  out.push(`- \`@media (prefers-contrast: more)\` sets \`--notch-rule\` to ${rule.hex}: ${shown(rule.ratio)}:1 on \`--notch-bg\`, ${rule.pass ? 'pass' : 'fail'}. Default mode uses the base value.`);
}
out.push('', `Regenerate with \`node ${resolve(HERE, 'contrast.mjs')}\` after editing tokens.css.`);
writeFileSync(REPORT_FILE, `${out.join('\n')}\n`, 'utf8');

console.log(`${results.length} pairs: ${passCount} pass, ${failing.length} fail`);
for (const r of failing) {
  const f = fixes.find((x) => x.token === r.fg);
  console.log(`FAIL --${r.fg} ${r.fgHex} on --${r.bg} ${r.bgHex}: ${shown(r.ratio)} < ${r.need.min}; suggested ${f.suggestion ? f.suggestion.hex : 'none'}`);
}
console.log(`Wrote ${REPORT_FILE}`);
