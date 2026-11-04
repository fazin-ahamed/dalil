// check-style: enforces the Dalil style rules (DESIGN-BRIEF.md sections 8 and 13).
// Node only, no dependencies. Run from ui/ with: npm run check:style
//
// Scans app/, components/dalil/ and lib/ (.ts .tsx .css .json .md) plus ../DESIGN-BRIEF.md.
// Skips node_modules, .next, styles, components/base, components/application and components/foundations.
// Exits 0 when clean. Exits 1 and prints file:line for every violation.
//
// Rules:
//   dash         em dash (U+2014) or en dash (U+2013) in any scanned file
//   palette      raw Tailwind palette class such as text-gray-500, bg-white, border-zinc-200
//   dark-colour  dark: variant on a colour utility (tokens already flip under .dark)
//   transition   the transition-all class
//   hex          #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(, hsl( or oklch( literals in .tsx under app/ and components/dalil/
//   uppercase    uppercase, tracking-wide, tracking-wider, tracking-widest in .tsx

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const UI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BRIEF = resolve(UI_ROOT, "..", "DESIGN-BRIEF.md");
const SCAN_ROOTS = ["app", "components/dalil", "lib"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".json", ".md"]);
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", "styles"]);
const SKIP_DIR_PATHS = new Set(["components/base", "components/application", "components/foundations"]);

const PALETTE_NAMES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

// Dark-variant values that are sizes, widths, styles or BoardUI type utilities, not colours.
const NOT_A_COLOUR =
  /^(?:\d|\[(?:\d|length:)|[xytrblse](?:-\d+)?$|(?:xs|sm|md|lg|xl|base|left|center|right|justify|start|end|ellipsis|clip|balance|pretty|wrap|nowrap|none|solid|dashed|dotted|double|wavy|hidden|inset|reverse|collapse|separate|spacing|offset|auto|cover|contain|fixed|local|scroll|repeat|origin|blend|opacity)(?:-|$)|(?:large-title|display-\d|title-\d|headline|body|caption-\d)(?:-|$))/;

const isTsx = (target) => target.ext === ".tsx";
const isTsxInScope = (target) =>
  isTsx(target) && (target.label.startsWith("app/") || target.label.startsWith("components/dalil/"));

const RULES = [
  {
    id: "dash",
    pattern: /[\u2013\u2014]/g,
    found: (match) => `U+${match[0].codePointAt(0).toString(16).toUpperCase()}`,
    message: "em or en dash, use a comma, colon or full stop",
  },
  {
    id: "palette",
    pattern: new RegExp(
      `(?<![\\w-])(?:text|bg|border|ring-offset|ring|fill|stroke|from|via|to|outline|divide|placeholder|decoration|accent|caret|shadow)-(?:(?:${PALETTE_NAMES})-\\d+|white|black)(?![\\w-])`,
      "g",
    ),
    message: "raw Tailwind palette class, use a BoardUI semantic token",
  },
  {
    id: "dark-colour",
    pattern: /(?<![\w-])dark:(?:[^\s"'`:]+:)*!?(ring-offset|text|bg|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|decoration|accent|caret)-([^\s"'`{}]+)/g,
    accept: (match) => !NOT_A_COLOUR.test(match[2]),
    message: "dark: variant on a colour utility, tokens already flip under .dark",
  },
  {
    id: "transition",
    pattern: /(?<![\w-])transition-all(?![\w-])/g,
    message: "transition-all animates everything, name the properties",
  },
  {
    id: "hex",
    appliesTo: isTsxInScope,
    pattern: /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|(?<![\w.])(?:rgba?|hsla?|oklch)\(/gi,
    message: "colour literal in tsx, use a semantic token",
  },
  {
    id: "uppercase",
    appliesTo: isTsx,
    pattern: /(?<![\w-])(?:uppercase|tracking-(?:wide|wider|widest))(?![\w-])/g,
    message: "tracked capitals are banned (DESIGN-BRIEF.md section 13)",
  },
];

function collect(label, out) {
  for (const entry of readdirSync(join(UI_ROOT, label), { withFileTypes: true })) {
    const childLabel = `${label}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || SKIP_DIR_NAMES.has(entry.name) || SKIP_DIR_PATHS.has(childLabel)) continue;
      collect(childLabel, out);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      out.push(childLabel);
    }
  }
}

function main() {
  const labels = [];
  for (const root of SCAN_ROOTS) {
    if (existsSync(join(UI_ROOT, root))) collect(root, labels);
  }
  const targets = labels.sort().map((label) => ({ label, path: join(UI_ROOT, label), ext: extname(label) }));

  const notes = [];
  let briefText = "";
  if (existsSync(BRIEF)) {
    targets.push({ label: relative(UI_ROOT, BRIEF).split(sep).join("/"), path: BRIEF, ext: ".md" });
    briefText = " and the design brief";
  } else {
    notes.push(`design brief not found at ${BRIEF}, skipped`);
  }

  const violations = [];
  for (const target of targets) {
    const lines = readFileSync(target.path, "utf8").split(/\r?\n/);
    lines.forEach((text, index) => {
      for (const rule of RULES) {
        if (rule.appliesTo && !rule.appliesTo(target)) continue;
        for (const match of text.matchAll(rule.pattern)) {
          if (rule.accept && !rule.accept(match)) continue;
          violations.push({
            file: target.label,
            line: index + 1,
            rule: rule.id,
            found: rule.found ? rule.found(match) : match[0],
            message: rule.message,
          });
        }
      }
    });
  }

  const scanned = `${targets.length} files in ${SCAN_ROOTS.join(", ")}${briefText}`;
  for (const note of notes) console.log(`check-style: note: ${note}`);

  if (violations.length === 0) {
    console.log(`check-style: PASS, ${scanned}, 0 violations.`);
    return 0;
  }

  for (const violation of violations) {
    console.log(`${violation.file}:${violation.line}: [${violation.rule}] ${violation.message}: ${violation.found}`);
  }
  const fileCount = new Set(violations.map((violation) => violation.file)).size;
  console.log("");
  console.log(`check-style: FAIL, ${violations.length} violation(s) in ${fileCount} file(s), ${scanned}.`);
  for (const rule of RULES) {
    const count = violations.filter((violation) => violation.rule === rule.id).length;
    if (count > 0) console.log(`  ${rule.id.padEnd(12)} ${count}`);
  }
  return 1;
}

process.exitCode = main();
