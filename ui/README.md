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

Known limits: Linux hotkeys use compositor bindings below; on GNOME Wayland the notch cannot pin itself to the top without the planned shell extension. The Linux native build is verified; physical input on Windows and Wayland still needs device testing.

For Windows prerequisites, local compilation, an installer and startup logs, see [WINDOWS-BUILD.md](WINDOWS-BUILD.md).

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

### Chat, tools and background tasks

Chat supports longer explanations, formatted examples, code blocks and source links. Search is on by default and can be toggled for the next message. It retrieves public Bing RSS results without a separate search key; throttling or unavailable results are reported in the task activity. Queries go to Bing, and retrieved snippets go to the saved model endpoint.

Enable Screen in chat (or screenshots in Setup) to include screen context. The Screen toggle preserves the endpoint and API key. This setting is checked in both the frontend and the native capture command. Computer control is off by default. The Control button enables a task to click, type, use shortcuts and scroll, inspecting a fresh screenshot after each action. A task stops after twelve actions and must verify the result before reporting success. Opening chat or Setup interrupts desktop input; Stop cancels further work. An in-flight model request may finish on the server after Stop, but its reply cannot start another action.

Computer control uses Windows input APIs, or `ydotool` plus `wtype` on niri Wayland. On Wayland, `ydotoold` must be running and accessible, with one unrotated display at 100% scale and flat pointer acceleration. Other display configurations fail before input rather than guess coordinates. X11 and macOS control are not implemented. Physical input still needs testing on each target desktop.

Up to four explanation/search tasks can run together. Hide chat to continue working and reopen it to read results; computer tasks run alone. Tasks and chat survive dismissal, and remain in memory until the app exits or a new conversation starts. Diagram and 3D replies have a Show button for reopening their panels. Drag panels by their title, or focus the title and use arrow keys (Shift moves farther). Their close buttons remain independent of chat.

After ten seconds without interaction, the notch shrinks to a small floating pill, pauses for one second, then fades away. Listening and speaking keep it open. Escape, clicking outside, or switching focus to another app starts the same transition. Hover the small target at the top centre, or run `dalil --ask`, to bring it back. Hiding retains the draft, conversation and running tasks.

On Windows, left-click the tray icon to open chat; right-click for Settings, shortcuts and Exit Dalil. Closing the notch with Alt+F4 hides it; Exit Dalil quits the process. Launching the executable again reopens the running instance.

| Windows shortcut | Action |
| --- | --- |
| Ctrl+Alt+Space | Show / hide chat |
| Ctrl+Alt+Shift+Space | Toggle voice input |
| Ctrl+Alt+Esc | Hide and stop screen control |

Shortcuts work while another app has focus. The tray menu and chat's keyboard help report bindings already taken by another app; those actions remain available from the tray.

