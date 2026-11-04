import { readFileSync } from "node:fs";
import path from "node:path";
import { contrastRatio, hexToRgb } from "./contrast";
import type { Rgb } from "./contrast";

/**
 * Reads styles/dalil.css at render time so the Foundations page can never drift from the theme:
 * hex values, the semantic bindings and every contrast ratio come from the file itself.
 */

export interface ContrastCheck {
  fg: string;
  bg: string;
  ratio: string;
  need: number;
  kind: "text" | "non-text";
  pass: boolean;
}

export interface ColourRow {
  name: string;
  cssVar: string;
  hex: string;
  usage: string;
  checks: ContrastCheck[];
  /** Set when a failing ratio is expected because the token is never used for text or controls. */
  exempt?: string;
}

export interface ColourGroup {
  id: string;
  title: string;
  note: string;
  rows: ColourRow[];
}

export interface SemanticRow {
  name: string;
  cssVar: string;
  paperHex: string;
  paperSource: string;
  nightHex: string;
  nightSource: string;
}

export interface ColourData {
  groups: ColourGroup[];
  semantic: SemanticRow[];
}

type CheckSpec = readonly [fg: string, bg: string, need: 4.5 | 3];

interface Meta {
  usage: string;
  checks?: CheckSpec[];
  exempt?: string;
}

const T = 4.5;
const N = 3;
const SELF = "self";

const META: Record<string, Meta> = {
  paper: { usage: "Card ground and system page ground", checks: [["ink", SELF, T]] },
  "paper-2": { usage: "Raised surfaces and card body", checks: [["ink", SELF, T], ["muted", SELF, T]] },
  "paper-3": { usage: "Sunken fields on paper", checks: [["ink", SELF, T]] },
  rule: { usage: "Grid lines and hairlines", checks: [[SELF, "paper", N]], exempt: "Decorative only" },
  "rule-strong": { usage: "Stronger hairlines", checks: [[SELF, "paper", N]], exempt: "Decorative only" },
  "control-edge": { usage: "Outlines of inputs and buttons", checks: [[SELF, "paper-2", N]] },
  ink: { usage: "Text", checks: [[SELF, "paper-2", T], [SELF, "paper", T]] },
  "ink-2": { usage: "Secondary text", checks: [[SELF, "paper-2", T], [SELF, "paper", T]] },
  muted: { usage: "Title strips and hints", checks: [[SELF, "paper-2", T], [SELF, "paper", T]] },
  signal: { usage: "Pointer and glow only, never text", checks: [[SELF, "paper", N]] },
  "box-fill": { usage: "Marker box fill", checks: [["ink", SELF, T]] },
  "hl-blue": { usage: "Highlighter swipe behind the working", checks: [["ink", SELF, T]] },
  "hl-lilac": { usage: "Highlighter swipe behind the answer", checks: [["ink", SELF, T]] },
  "mark-error": { usage: "Error text on paper", checks: [[SELF, "paper-2", T]] },
  "mark-success": { usage: "Success text on paper", checks: [[SELF, "paper-2", T]] },
  "mark-warn": { usage: "Warning text on paper", checks: [[SELF, "paper-2", T]] },

  notch: { usage: "The notch", checks: [["notch-ink", SELF, T]] },
  "notch-raised": { usage: "Fields, rows and buttons", checks: [["notch-ink", SELF, T], ["notch-muted", SELF, T]] },
  "notch-raised-2": { usage: "Hovered rows and raised buttons", checks: [["notch-ink", SELF, T]] },
  "notch-raised-3": { usage: "Pressed rows on black", checks: [["notch-ink", SELF, T]] },
  "notch-raised-4": { usage: "Hovered table cells on black", checks: [["notch-ink", SELF, T]] },
  "notch-placeholder": { usage: "Placeholder text in dark fields", checks: [[SELF, "notch-raised", T]] },
  "notch-rule": { usage: "Hairlines on black", checks: [[SELF, "notch", N]], exempt: "Decorative only" },
  "notch-edge": { usage: "Outlines of controls on black", checks: [[SELF, "notch", N]] },
  "notch-edge-hover": { usage: "Hovered control outlines on black", checks: [[SELF, "notch", N]] },
  "notch-rule-strong": { usage: "Stronger hairlines on black", checks: [[SELF, "notch", N]], exempt: "Decorative only" },
  "notch-quiet": { usage: "Quietest icons on black", checks: [[SELF, "notch", N]] },
  "notch-ink": { usage: "Text", checks: [[SELF, "notch", T], [SELF, "notch-raised", T]] },
  "notch-ink-2": { usage: "Secondary text", checks: [[SELF, "notch", T], [SELF, "notch-raised", T]] },
  "notch-muted": { usage: "Hints and helper lines", checks: [[SELF, "notch", T], [SELF, "notch-raised", T]] },
  "notch-accent": { usage: "Links, active marks and the focus ring", checks: [[SELF, "notch", T], [SELF, "notch-raised", T]] },
  "notch-primary": { usage: "Primary button fill, white text", checks: [["#white", SELF, T]] },
  "notch-ok": { usage: "Success, always with an icon", checks: [[SELF, "notch", T], [SELF, "notch-raised", T]] },
  "notch-warn": { usage: "Warning, always with an icon", checks: [[SELF, "notch", T], [SELF, "notch-raised", T]] },
  "notch-error": { usage: "Error, always with an icon", checks: [[SELF, "notch", T], [SELF, "notch-raised", T]] },
};

const RAMP_USAGE: Record<string, string> = {
  "50": "Faint tint",
  "100": "Tint",
  "200": "Marker box fill",
  "300": "Soft fill",
  "400": "Fill",
  "500": "Primary button start",
  "600": "Blue ink: strokes, links, text on paper, focus ring",
  "700": "Pressed blue",
  "800": "Deep blue",
  "900": "Deepest blue",
  "950": "Near black blue",
};

const WHITE: Rgb = [255, 255, 255];

function block(css: string, header: string): string {
  const start = css.indexOf(header);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  return "";
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

export function getColourData(): ColourData {
  const css = readFileSync(path.join(process.cwd(), "styles", "dalil.css"), "utf8");
  const theme = declarations(block(css, "@theme"));
  const root = declarations(block(css, "\n:root {"));
  const dark = declarations(block(css, "\n.dark {"));

  const hexOf = (varName: string): string => {
    let v = theme.get(varName) ?? root.get(varName);
    let guard = 0;
    while (v && v.startsWith("var(") && guard++ < 8) {
      const ref = v.slice(4, -1).trim();
      v = theme.get(ref) ?? root.get(ref);
    }
    return v && v.startsWith("#") ? v.toLowerCase() : "";
  };

  const rgbOfToken = (token: string, self: string): Rgb => {
    if (token === "#white") return WHITE;
    const key = token === SELF ? self : token;
    return hexToRgb(hexOf(`--color-${key}`));
  };

  const buildRow = (name: string, usage: string, checks: CheckSpec[] | undefined, exempt?: string): ColourRow => {
    const cssVar = `--color-${name}`;
    return {
      name,
      cssVar,
      hex: hexOf(cssVar).toUpperCase(),
      usage,
      exempt,
      checks: (checks ?? []).map(([fg, bg, need]) => {
        const ratio = contrastRatio(rgbOfToken(fg, name), rgbOfToken(bg, name));
        return {
          fg: fg === "#white" ? "white" : fg === SELF ? name : fg,
          bg: bg === SELF ? name : bg,
          ratio: `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`,
          need,
          kind: need === T ? "text" : "non-text",
          pass: ratio >= need,
        } satisfies ContrastCheck;
      }),
    };
  };

  const paperNames = [...theme.keys()].map((k) => k.replace("--color-", "")).filter((n) => META[n] && !n.startsWith("notch"));
  const notchNames = [...theme.keys()].map((k) => k.replace("--color-", "")).filter((n) => META[n] && n.startsWith("notch"));
  const rampNames = [...root.keys()].filter((k) => k.startsWith("--color-accent-")).map((k) => k.replace("--color-accent-", ""));

  const groups: ColourGroup[] = [
    {
      id: "paper",
      title: "Grid paper",
      note: "The teaching world: cards, the design-system page, anything drawn by hand.",
      rows: paperNames.map((n) => buildRow(n, META[n].usage, META[n].checks, META[n].exempt)),
    },
    {
      id: "night",
      title: "Night glass",
      note: "The system world: the notch and everything that hangs from it.",
      rows: notchNames.map((n) => buildRow(n, META[n].usage, META[n].checks, META[n].exempt)),
    },
    {
      id: "accent",
      title: "Dalil blue ramp",
      note: "BoardUI's accent ramp, rebound to Dalil blue. Only 600 and darker carry text on paper.",
      rows: rampNames.map((step) => {
        const name = `accent-${step}`;
        const text = Number(step) >= 500;
        return buildRow(name, RAMP_USAGE[step] ?? "", [[SELF, "paper-2", T]], text ? undefined : "Fill only");
      }),
    },
  ];

  const sourceOf = (raw: string | undefined): string => {
    if (!raw) return "";
    return raw.startsWith("var(") ? raw.slice(4, -1).replace("--color-", "") : "literal";
  };
  const resolve = (raw: string | undefined): string => {
    let v = raw;
    let guard = 0;
    while (v && v.startsWith("var(") && guard++ < 8) {
      const ref = v.slice(4, -1).trim();
      v = theme.get(ref) ?? root.get(ref);
    }
    return v && v.startsWith("#") ? v.toUpperCase() : "";
  };

  const semanticNames = new Set<string>();
  for (const k of root.keys()) if (!k.startsWith("--color-accent-")) semanticNames.add(k);
  for (const k of dark.keys()) semanticNames.add(k);

  const semantic: SemanticRow[] = [...semanticNames].map((cssVar) => {
    const paperRaw = root.get(cssVar);
    const nightRaw = dark.get(cssVar) ?? paperRaw;
    return {
      name: cssVar.replace("--color-", ""),
      cssVar,
      paperHex: resolve(paperRaw),
      paperSource: sourceOf(paperRaw),
      nightHex: resolve(nightRaw),
      nightSource: sourceOf(nightRaw),
    };
  });

  return { groups, semantic };
}
