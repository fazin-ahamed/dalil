# Dalil UI

The design system site for Dalil, and later the webview source for the Tauri v2 shell.
Built with Next.js 16, Tailwind CSS v4 and BoardUI. The plan is in ../DESIGN-BRIEF.md.

## Run it

    cd ui
    npm install        (first time only)
    npm run dev

Open http://localhost:3000 (default port). Override with `npm run dev -- -p 3001`.

Routes (boards from DESIGN-BRIEF.md section 12): / stage (06), /foundations (00),
/notch (01), /setup (02), /receipts (03), /cards (04).

## Stack

- Next.js 16 (App Router), React 19, TypeScript in strict mode.
- Tailwind CSS v4 through the @tailwindcss/turbopack loader (next.config.ts).
- BoardUI: source-owned components on react-aria-components. Icons: @remixicon/react.
- Self-hosted fonts via next/font/local: Onest (sans), Gaegu (hand ink), Geist Mono.

## Theme

- styles/globals.css imports Tailwind, then theme.css (BoardUI tokens), typography.css
  (composite text styles) and dalil.css last.
- dalil.css re-binds the semantic tokens. :root is grid paper. The .dark class is night
  glass: wrap a subtree in .dark (the notch does) and BoardUI components inside flip
  with no dark: classes.
- Accent ramp: Dalil blue (500 #2F67EC, 600 #2456C7). design/tokens.css, one folder up,
  is the original token sheet, kept as reference.
- Use tokens (text-text-primary, bg-background-primary-default) and type utilities
  (text-title-2-medium, text-body-regular). No palette classes, no dark: colour overrides.

## BoardUI or bespoke

- BoardUI, restyled only through tokens: setup form, model list, receipts table,
  settings rows, toasts, tooltips, skeletons, spinners, keycaps.
- Bespoke, in components/dalil (no BoardUI equivalent): notch shape and morph, guide
  cards, pointer kit, caption, stage.

## Add a BoardUI component

    npx boardui@latest add <name> --yes

Source lands in components/. Import through the @/ alias, for example
`import { Button } from "@/components/base/buttons/button";`. Do not hand-build a
lookalike. Merge classes with cx() from @/utils/cx.

## Scripts

- npm run dev: dev server on port 3000
- npm run build, npm run start: production build, then serve it
- npm run lint: ESLint (eslint.config.mjs)
- npm run typecheck: TypeScript, no output files
- npm run test:logic: Node test runner over lib/
- npm run check:style: style guard, exits 1 with file:line output for em or en
  dashes, raw palette classes (text-gray-500, bg-white), dark: on colour utilities,
  transition-all, colour literals in .tsx under app/ and components/dalil, and uppercase
  or wide tracking in .tsx. It scans app/, components/dalil/, lib/ and the design brief.

## File map

- app/                     routes, root layout, fonts/ (self-hosted woff2)
- components/base/         BoardUI primitives
- components/application/  BoardUI composed pieces (agent-thinking, data-table)
- components/foundations/  BoardUI foundations (direction, icons, template-copy)
- components/dalil/        bespoke Dalil pieces: notch, cards, pointer, setup, receipts,
                           settings, foundations, plus brand-mark, notch-panel, site-nav
- lib/                     copy.json (UI copy), logic modules, *.test.ts tests
- styles/                  globals.css, theme.css, typography.css, dalil.css
- utils/                   cx.ts and small helpers
- public/                  avatars and static images
- scripts/check-style.mjs  style guard (Node, no dependencies)
- AGENTS.md, .cursor/      rules for coding agents

## Desktop shell (Tauri v2)

`src-tauri/` wraps the same app in one window, `notch` (`/shell/notch/`, frameless, transparent, always on top, click-through except over its own shape). Home and the endpoint Setup panel are faces the notch grows into, not separate windows. On Wayland compositors with layer-shell (niri, Sway, Hyprland, KDE) it is pinned to the top edge as an overlay surface. The webview makes no network calls itself: model lists and test messages go through the Rust command `http_request` (no CORS, redirects returned not followed). The API key is stored in the OS keychain and is never returned to the webview.

Needs Rust and, on Fedora: `sudo dnf install webkit2gtk4.1-devel librsvg2-devel`.

```bash
npm run shell:dev     # GDK_BACKEND=x11 tauri dev (Wayland ignores client window positions)
npm run shell:build   # static export, then tauri build
```

Known limits: no global hotkey yet (modifier-only chords need the platform work in TRD spike S1); on GNOME Wayland the notch cannot pin itself to the top without the planned shell extension. `src-tauri/src/lib.rs` has not been compiled in the build environment that wrote it.

### Keybinding

Dalil cannot capture global keys on Wayland, so bind a compositor key that runs `dalil` (on your PATH) with a flag. The running notch receives the flag, and the second process exits. The flags:

- `--ask`: open the ask box
- `--talk`: start or stop listening
- `--quit`: quit Dalil

niri, inside `binds { }` in `~/.config/niri/config.kdl`:

```kdl
binds {
    Mod+Space { spawn "dalil" "--ask"; }
}
```

Sway and Hyprland:

```conf
# Sway, in ~/.config/sway/config
bindsym $mod+space exec dalil --ask

# Hyprland, in ~/.config/hypr/hyprland.conf
bind = SUPER, space, exec, dalil --ask
```

A compositor bind fires on key press only, so hold-to-talk is not possible: `--talk` toggles listening on each press instead. A flag given before Dalil is running applies once the notch is up.

