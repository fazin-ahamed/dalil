# Dalil: Design Brief

Status: v0.1, 2 November 2026. Supersedes the look-and-feel parts of TRD v0.1 (working name Cairn).
Scope of this brief: product identity, the notch, the hand-inked guide cards, the endpoint setup flow, the design system and the motion rules. Engineering stays in the TRD.

## 1. The product in one breath

Dalil is an on-screen guide you talk to. Hold a key, ask a question out loud, and a small blue pointer flies to the exact control on your screen, a hand-drawn card explains the step, and Dalil waits to see you do it. It reads the app's own structure first and pixels second, and it talks only to the AI endpoint you give it.

## 2. Name

**Dalil** (dah-LEEL) is the Arabic word for "guide". The name is the only Arabic in the product. Every string, label, menu and doc is English. The wordmark is Latin, set in the card hand (Gaegu Bold) so the brand and the guide share one voice. No calligraphy, no pattern work, no crescent or lantern clichés.

## 3. Decisions in this brief that change the TRD

| # | TRD said | This brief decides | Why |
|---|---|---|---|
| D1 | Working name Cairn, stones and trails | Dalil. The overlay's `trail.stones` becomes `steps`. Recorded walkthroughs stay called Trails. | One name, one idea: a guide. |
| D2 | Arabic and English first class, RTL overlay, Gulf dialect | English UI only. Layout uses CSS logical properties so a locale can be added later at no cost. Voice input stays language-agnostic. | Product language is English; the name carries the heritage. |
| D3 | Three modes: Local, Private cloud, Cloud, with built-in providers | **One custom endpoint only.** The user enters a base URL and an API key. Dalil fetches the model list and the user picks. Privacy is read off the endpoint: a loopback or LAN host shows "On this computer", anything else shows the host name. | The user brings the model. Fewer modes, nothing to misconfigure. Receipts stay. |
| D4 | cairn-ui is a tray plus settings window | The product chrome is **a notch**: a black shape that hangs from the top centre of the screen and morphs between rest, home, listening, thinking, guiding, setup and receipts. | The reference feels native because the guide lives in one place. |
| D5 | Overlay draws only five primitives | Six: pointer, ring, label, steps, clear, and **sketch card**. Cards are still inert (click-through), except their one follow-up pill. | The reference teaches with drawn cards, not only a pointer. |

## 4. The design idea: two materials, one guide

Dalil speaks in two materials and never mixes them.

1. **Night glass** is the notch. Pure black, flush with the top edge, white Onest type. It is the system voice: listening, status, settings, receipts, errors. It asks for your attention and hands it back fast.
2. **Grid paper** is the guide card. Cool paper with a faint blue grid, blue marker boxes, Gaegu handwriting, a highlighter swipe behind the number that matters. It is the teaching voice: it draws itself as the guide talks, in the order you will do things.

The **pointer** is the guide's fingertip and the only thing that crosses between worlds. It starts in the notch, flies on an arc to the control, lands as a ring, and the card draws in beside it.

One rule keeps the idea honest: **black speaks, paper shows, the pointer touches.** Status never appears on paper, and teaching never appears in the notch.

### Signature

The signature is the flight: ask a question, the notch swells and listens, then a glowing blue pointer leaves the notch, curves across the screen, lands on the right control and rings it, while a grid-paper card draws its first box beside it. It is the first thing the stage demo in the design system shows, and it is the demo for the hackathon too.

## 5. What the reference shows

Read from the screen recording (13.9 s, 848×480) and three screenshots supplied with the brief.

| Observation | Design consequence |
|---|---|
| Three paper cards sit side by side over a PDF reader, each with a small grey title strip ("from decimal", "to decimal", "binary shortcuts"). | Cards are floating sheets with a title strip, placed beside the target, never over it. Title strip text is sentence case, grey, one step smaller than body. |
| Content draws in one box at a time as the guide speaks: `1`, `0`, `1`, `1`, `0`, `1`, then the sum `32 + 8 + 4 + 1 = 45`. A glowing blue dot sits on the box being filled. | Cards are timelines, not static pages. Each block has a `at` time and draws in with a clip-path wipe plus a 2px settle. The pointer dot marks the active block. |
| Handwritten display face with an open-topped 4, thick marker strokes, boxes with 2px blue border and pale blue fill, arrows drawn as slightly wobbly lines. | Gaegu for all card ink. Boxes and arrows get a static hand-roughened edge (SVG displacement filter, scale 1.5, baked, never animated). |
| Pale blue and pale lilac highlighter blobs behind key results (`3 × 8 = 24`, `128 + 24 + 5 = 157`). | Two marker tokens: blue for the working, lilac for the answer. Blobs sit behind text with 6px bleed and a 2 to 3 degree tilt. |
| A pill at the bottom of a card with a speech-bubble glyph: "Let me try 146", "Practise one at a time", "Explain division remainders". | Follow-up pill. Outlined blue, gradient-free, 36px tall, the only reactive region on a card. |
| Screenshot of the home panel: black rounded panel, "Evening, FSquare." in white, "Hold Ctrl + Alt and tell me what to take off your plate." in grey, small controls around it. | The notch's Home state. Greeting by time of day and OS first name, one hint line with keycaps, three small controls. |
| The cards sit over an ordinary app and do not hide the thing being asked about. | Layout engine keeps cards outside the target's bounding box plus a 24px margin, and Esc clears all. |

## 6. Surfaces

### 6.1 The notch

Anchored to the top centre of the primary display, flush with the screen edge (no top corners, bottom corners rounded). Always above everything. Pure `#000` so it reads as one object with the bezel on laptops and as a deliberate black tab on desktops.

| State | Size (w × min h, logical px) | Content | Entered by | Leaves on |
|---|---|---|---|---|
| Rest | 132 × 30 | The Dalil mark, 14px, centred. Collapses to a persistent small island after 10 s idle, Esc or clicking outside. | Default | Hover 200 ms, click, tap of the hotkey |
| Home | 536 × 184 | Greeting, one hint line with keycaps, gear, receipts, endpoint chip | Hover, click, hotkey tap | Esc, click outside, 6 s of no pointer |
| Listening | 300 × 64 | Live waveform (7 bars), live transcript, 1 line | Hotkey down | Hotkey up |
| Thinking | 240 × 46 | Three-bar shimmer, "Reading your screen" | Hotkey up with a transcript | First step parsed |
| Guiding | 440 × 96 (grows to 3 lines) | Step n of N, the spoken line as text, step progress, a skip control | First step parsed | Step verified, Esc |
| Waiting | same as Guiding | Adds "Waiting for your click" with a slow breathing mark | Pointer landed | Event seen, 12 s pulse, 30 s ask |
| Correcting | 440 × 104 | What happened, how to go back, what is next | Wrong event | User back on path, replan |
| Done | 280 × 46 | Check, "Done in 3 steps" | Last step verified | 2.4 s |
| Error | 400 × 84 | What failed, one action ("Fix endpoint", "Try again") | Any failure | Action or Esc |
| Setup | 560 × auto (max 520) | Endpoint form, model list, disclosure line | First run, gear, error action | Save, Esc |
| Receipts | 560 × auto (max 440) | "What left this computer" table | Home control | Esc, Back |

Morph rule: the notch is one persistent shape. States cross-fade their content (opacity plus 2px blur) while the shape changes with a spring. Size is never animated through `width` or `height`: the shape is a fixed-size element at its largest, revealed with `clip-path: inset(... round ...)`, and the content layer uses transforms. The native renderer (GNOME Shell extension) follows the same timing tokens.

Renderers: the compact states (Rest, Listening, Thinking, Guiding, Waiting, Correcting, Done) are inert and drawn by the shell extension. The interactive states (Home, Setup, Receipts, Error with action) are a frameless Tauri window placed at the same coordinates. The pixels are identical; only the input handling differs.

### 6.2 Guide cards

A card is a paper sheet, 360 to 440 px wide, 20px radius, grid background (24px cells, 1px rules), a 28px title strip and a content area that draws in on a timeline.

Four card types, one anatomy:

1. **Steps** (the reference's "Add the place values"): heading, one-line subtitle, marker boxes that fill in order, a worked line, a highlighted answer.
2. **Convert** (the reference's "from decimal"): a rail of arrows between values with the result underlined in blue.
3. **Checklist**: hand-drawn checkboxes that tick themselves as Dalil verifies each step. This is the verification loop made visible.
4. **Explain**: a short paragraph in the hand with one margin arrow pointing at the thing on screen.

Anatomy and rules:

- Title strip: label in Onest 12px, ink-3, sentence case, centred, with a 1px rule beneath. No window buttons. It is a label, not a window.
- Heading: Gaegu Bold, 30px, ink. Subtitle: Gaegu Regular, 20px, muted.
- Boxes: 2px blue stroke, pale blue fill, 6px radius, 44px square minimum, number in Gaegu Bold 26px.
- Highlights: blue marker for working, lilac marker for the answer. Never both on one line.
- Follow-up pill: below the content, left aligned, one per card, label under 32 characters.
- Max 3 cards on screen. A fourth retires the oldest with a fade.
- Click-through everywhere except the pill.

### 6.3 Pointer, ring, label, callout

- **Pointer**: a 20px arrow cursor in signal blue, 2px white outline, 10px glow. It is the guide's fingertip. Flights are arcs, 380 to 720 ms by distance, ease-out, X and Y driven independently so the arc is natural, no overshoot.
- **Ring**: a double keyline around the target (2px ink-dark inside, 2px white outside) with 6px padding, drawn with a stroke sweep, 260 ms. Visible on any background.
- **Label**: a small ink pill beside the ring, 13px Onest, max 24 characters, optional "2 of 5".
- **Callout**: for targets under 16px, a 56px magnified lens beside the target with a short stem.
- **Edge parking**: if the target is off-screen the pointer parks at the nearest edge and the label says "Scroll down".
- **Landing**: the arrow becomes the ring, one 240 ms pulse (scale 0.94 to 1.06 to 1).

### 6.4 Caption

The Windows teacher uses short, paced subtitles at the bottom of the screen on translucent black when speech is unavailable. Captions have pause and dismiss controls; full text remains in chat. During speech, the visual and custom pointer carry the lesson without an extra transcript panel. Visuals start automatically, with replay available in their small title bar. The tiny idle notch stays visible.

## 7. Setup: one custom endpoint

The whole provider story is one form, inside the notch.

**Fields**
1. **Base URL**: placeholder `https://api.example.com/v1`. Accepts a base with or without `/v1`.
2. **API key**: password field with a show toggle. Optional, because local servers often need none. Stored in the OS keychain, never in a config file, never logged.
3. **Advanced** (collapsed): header name (default `Authorization`), scheme (default `Bearer`, or none).

**Normalising the URL**
- Trim, add `https://` unless the host is `localhost`, `127.0.0.1`, `[::1]`, `*.local` or a private IP, which get `http://`.
- Strip a trailing slash and any pasted `/chat/completions` or `/models`.
- Candidate model URLs, in order: if the path ends in `/v1`, then `{base}/models`; otherwise `{base}/v1/models`, then `{base}/models`.

**Fetching models**
- `GET` with `Authorization: Bearer <key>` and `Accept: application/json`, 8 s timeout, one attempt per candidate URL.
- Accept the OpenAI shape `{ data: [{ id }] }`, `{ models: [{ id | name }] }` and a bare array of strings.
- Sort alphabetically, show a search field above 8 models, show model id in Geist Mono.
- The key is sent only to the host the user typed. Redirects to another host are refused.

**States** (all designed): empty, connecting (skeleton rows in the shape of the list), connected (list), error, and saved.

| Failure | Message | Action |
|---|---|---|
| 401 or 403 | "The endpoint rejected this key." | Edit key |
| 404 on all candidates | "This server has no model list." | Type a model ID instead |
| Network, TLS, refused | "Can't reach api.example.com." | Check URL, Retry |
| Timeout | "No answer after 8 seconds." | Retry |
| Not JSON or empty list | "The server answered, but not with a model list." | Type a model ID instead |

**After choosing a model**
- Optional **Send a test message** (one-token request) with a pass or fail result.
- Optional **Use screenshots** toggle, default off: "Send a screenshot only when a control isn't in the app's structure."
- Disclosure line, always visible: for a local host, "Stays on this computer." For anything else, "Your question and the visible controls go to api.example.com. Screenshots only if you turn them on."
- **Save** writes the endpoint, closes the notch to Home and shows the endpoint chip.

## 8. Design system

Source of truth: `design/tokens.css`. No literal colour or font past the token block.

### 8.1 Colour

Two fixed worlds, no theme switch.

**Grid paper**

| Token | Hex | Use |
|---|---|---|
| `--color-paper` | `#EDF1F8` | Card ground, system page ground |
| `--color-paper-2` | `#F6F8FC` | Raised surfaces, card body |
| `--color-paper-3` | `#E3E9F4` | Sunken fields on paper |
| `--color-rule` | `#D5DCEB` | Grid lines, hairlines |
| `--color-ink` | `#1A2236` | Text |
| `--color-ink-2` | `#3F485C` | Secondary text |
| `--color-muted` | `#5F6980` | Title strips, hints (5.1:1 on paper-2) |
| `--color-accent` | `#2456C7` | Blue ink: strokes, links, text on paper (6.1:1) |
| `--color-signal` | `#2F7BFF` | Pointer and glow only, never text |
| `--color-box-fill` | `#C6D9F8` | Marker box fill |
| `--color-hl-blue` / `--color-hl-lilac` | `#BDD3F7` / `#D9D2F5` | Highlighter swipes |

**Night glass**

| Token | Hex | Use |
|---|---|---|
| `--notch-bg` | `#000000` | The notch |
| `--notch-raised` / `--notch-raised-2` | `#111114` / `#1A1A1F` | Fields, rows, buttons |
| `--notch-rule` | `#26262C` | Hairlines |
| `--notch-ink` / `--notch-ink-2` / `--notch-muted` | `#F5F5F7` / `#B4B4BC` / `#8A8A94` | Text |
| `--notch-accent` | `#86AEFF` | Links, active marks |
| `--notch-primary` | `#2A62F5` | Primary button fill, white text (5.1:1) |
| `--notch-ok` / `--notch-warn` / `--notch-error` | `#5BD991` / `#FFC15C` / `#FF7B72` | Semantics, with an icon, never colour alone |

Blue is the only hue. There is no gradient anywhere in the product.

### 8.2 Type

| Role | Face | Sizes |
|---|---|---|
| Card ink and wordmark | Gaegu 300, 400, 700 | 20, 26, 30, 44 |
| UI | Onest 400, 500, 600 | 12, 13, 14, 16, 18, 22 |
| Keys, URLs, model ids | Geist Mono 400, 500 | 12, 13 |

All three are SIL OFL, self-hosted in `design/fonts` so Local use never touches the network. Labels, table heads and captions are Onest a step smaller, sentence case, no tracking, no capitals. Tabular numerals on every figure.

### 8.3 Space, radius, elevation

- 4 px base grid. Controls 36 px, hit target 44 px.
- Radii: 6 field, 10 button, 14 inner card, 20 card, 16 and 28 notch bottom corners, pill 999.
- Elevation: notch gets a 1px white 7% keyline plus a deep soft shadow. Cards get a top highlight, a wide soft shadow and a tight contact shadow. Shadows are tokens.

### 8.4 Iconography

20 px grid, 1.75 px stroke, round caps and joins, `currentColor`. Remix outline icons through `@remixicon/react`, passed as component references. Never an emoji. Glyph list: gear, receipt, microphone, check, x, arrow-right, arrow-left, chevron-down, eye, eye-off, search, refresh, key, link, server, laptop, bubble, pointer, scroll, warning, lock, lock, home, plug, clock, info. Icons come from Remix (`@remixicon/react`), outline family, 20 px.

## 9. Motion rules

Source: Apple's fluid-interface principles and Emil Kowalski's animation decision framework.

| Rule | Value |
|---|---|
| Respond on press, not release | Hotkey down starts Listening immediately, no delay, no animation gating the mic. |
| Frequency decides | Hotkey cycles are tens a day: Listening grows in 160 ms. Setup opens once: 360 ms is fine. |
| Easings | `--ease-out` cubic-bezier(0.23, 1, 0.32, 1) for entrances; `--ease-in-out` cubic-bezier(0.77, 0, 0.175, 1) for on-screen movement; `--ease-drawer` cubic-bezier(0.32, 0.72, 0, 1) for the notch. Never `ease-in`. |
| Durations | Press 100 ms, micro 140 ms, short 220 ms, notch 360 ms, card draw 520 ms. UI under 300 ms except the notch and card draw. |
| Springs | Critically damped (damping 1.0, response 0.35 s) by default. A little bounce (0.85) only after a gesture that carried momentum. |
| Interruptible | Everything retargets from its current value. Hotkey press during any state barges in and restarts Listening. Use transitions, not keyframes, for anything that can be re-triggered. |
| Enter and exit on one path | The notch's content leaves the way it came. Cards retire along the path they arrived. |
| Origin aware | Menus and tooltips scale from their trigger. Cards unfold from the target side. |
| Never from nothing | Entries start at scale 0.95 with opacity 0, never scale 0. |
| Blur as a mask | 2px blur crossfades between notch contents. Under 20px always. |
| Only transform, opacity, clip-path | Never `width`, `height`, `top`, `left`, never `transition: all`. |
| Stagger | 40 ms between boxes on a card, 160 ms between cards. Decorative, never blocks input. |
| Reduced motion | Flight becomes a 160 ms fade at the destination. The notch changes shape with a 120 ms fade. Cards appear with opacity only. Pulses stop. |
| Reduced transparency and more contrast | The caption chip becomes solid; keylines thicken to 2px. |

## 10. Voice and microcopy

Plain, warm, short. First person only when Dalil acts ("I can't see that option"). No exclamation marks, no emoji, no "oops".

| Moment | Copy |
|---|---|
| Greeting | "Evening, FSquare." Morning, Afternoon, Evening, Night by clock. |
| Hint | "Hold Ctrl + Alt and ask what's on your screen." |
| First run | "Connect an AI endpoint to begin." Button: "Connect endpoint" |
| Listening | Live transcript, no label |
| Thinking | "Reading your screen" |
| Waiting | "Waiting for your click" |
| Wrong click | "That opened Display. Press Esc, then pick Network." |
| Not on screen | "I can't see battery saver here. Open Power first, then ask again." |
| Done | "Done in 3 steps." |
| Idle too long | "Still with me? Say skip to move on." |
| Local endpoint | "Stays on this computer." |
| Remote endpoint | "Your question and the visible controls go to api.example.com." |
| Receipts title | "What left this computer" |
| Receipts empty | "Nothing has left this computer." |

## 11. Accessibility

- Every spoken line has a caption. Every status has an icon and a word, never colour alone.
- Text contrast 4.5:1 minimum on both worlds; non-text 3:1. The pointer ring is visible on black, white and mid grey.
- Focus ring: 2px, instant, on every interactive element, `--color-focus` on paper and `--notch-focus` on black.
- Keyboard: tap the hotkey for Home, Tab through the notch, Esc leaves any state, Enter confirms. The whole setup flow works without a mouse.
- Reduced motion, reduced transparency and increased contrast are honoured (section 9).
- Large pointer option: 28 px pointer and 3 px ring.
- Hit targets 44 px including the pill and the notch controls.

## 12. Screen inventory (design system routes)

| Board | Contents |
|---|---|
| 00 Foundations | Colour, type, space, radius, elevation, icons, motion curves |
| 01 Notch states | Rest, Home, Listening, Thinking, Guiding, Waiting, Correcting, Done, Error |
| 02 Setup | Empty, connecting, connected with models, 5 error states, saved, local endpoint, remote endpoint |
| 03 Receipts | Full, empty, expanded row |
| 04 Guide cards | Steps, Convert, Checklist, Explain, follow-up pill, all draw states |
| 05 Pointer kit | Pointer, ring, label, callout, edge parking, large pointer |
| 06 Stage | The signature flight on a fake desktop, interactive |

## 13. Hallmark floor for this build

Every colour and font through a token at `:root`. No `transition: all`, no animated width or height. Focus-visible on every control, instant. Reduced-motion fallbacks everywhere, content visible with scripting off. No eyebrow, no tracked capitals, no middle-dot meta strings, no status dots with no meaning, no emoji icons, no purple-to-blue gradient, no card inside a card (a field inside the notch is not a card). No invented metrics: every figure in the demo is labelled "Sample".

## 14. Implementation and build plan

**Stack.** `ui/` is a Next.js 16 app with Tailwind CSS v4 and **BoardUI** (React, source-owned components under `ui/components`, semantic tokens in `ui/styles`). It is the design system site today and the webview source for the Tauri v2 shell later. Fonts are self-hosted with `next/font/local`.

**Where BoardUI is used and where it is not.**

| Surface | Built with |
|---|---|
| Setup form, model list, Receipts table, Settings rows, toasts, tooltips, skeletons, spinners, keycaps | BoardUI components (`input`, `button`, `switch`, `select`, `data-table`, `chip`, `kbd`, `skeleton`, `spinner`, `tooltip`, `toast`, `tabs`, `segmented-control`) restyled only through tokens |
| The notch shape and its morph, guide cards, pointer kit, caption, stage | Bespoke Dalil components in `ui/components/dalil`, because BoardUI has no equivalent. They still use BoardUI semantic tokens and `cx()`. |

Theme: `ui/styles/dalil.css` re-binds BoardUI's semantic layer. `:root` is grid paper. A `.dark` wrapper is night glass, so any BoardUI component placed inside the notch flips with zero `dark:` classes. The accent ramp is Dalil blue (500 `#2F67EC`, 600 `#2456C7`). `design/tokens.css` is the original static token sheet and stays as reference.

Motion inside BoardUI components follows BoardUI's own language (colour-step press, 150 ms hovers, soft blur-in popovers). Bespoke surfaces follow section 9. Where they differ, the bespoke surface wins only inside the notch, the cards and the pointer.

Contrast report: three pairs fail as text tokens and are decorative only (grid rules, notch hairlines); controls use `--color-control-edge` (`#7D8CAB`) and `--color-notch-edge` (`#585866`) for 3:1 outlines. Success text is `#198252`.

**Desktop shell.** `ui/src-tauri` is a Tauri v2 wrapper. The notch window loads `/shell/notch/`, hovering the rest pill for 200 ms opens Home, and the window ignores the mouse everywhere except over the visible shape (Rust reports the cursor, the page decides). Setup is a face of the same notch, not a window: the black shape grows downward from Home into the endpoint panel, and the window is tall enough to hold it with only the visible shape taking the mouse; requests leave from Rust, so the browser CORS state never appears in the app; the key goes to the OS keychain.

**Run it.** `cd ui && npm run dev`. Routes: `/` stage, `/foundations`, `/notch`, `/cards`, `/setup`, `/receipts`.

| Task | Model, effort |
|---|---|
| Notch component and morph | Sonnet 5.5, high |
| Guide cards and pointer kit | Sonnet 5.5, high |
| Endpoint setup, logic and UI | Sonnet 5.5, high |
| Receipts, settings rows, foundations | Sonnet 5.5, high |
| Stage page (signature) | Sonnet 5.5, high |
| README, checks, small utilities | Haiku, max |
| Review and fixes | Sonnet 5.5, high |

## 15. Open questions

1. Is a resting notch always visible acceptable, or should Rest be hidden by default and appear on hover at the top edge?
2. Greeting uses the OS first name. Acceptable, or should the name be editable in Setup?
3. Does the follow-up pill need to be clickable on the GNOME overlay, or should follow-ups be spoken only? Clickable needs per-actor input regions, which is spike S1.
4. Should "Send a test message" be on by default after choosing a model?
5. Tauri: ship the Next app as a static export inside the shell, or port the components to Vite at packaging time?

## 16. Positioning: a guide that teaches and remembers

Reference product (Clicky, heyclicky): voice and text chat, can act on the screen, a drawing cursor for explanations, live graphics. Dalil matches the parts that serve a learner and goes further on three things. It does not chase "controls your screen"; Dalil points, draws and explains, and the person stays the one who clicks. That is a feature for learning, because doing it yourself is how it sticks.

### 16.1 What is different

| Pillar | What it means | Surface it needs |
|---|---|---|
| Education first | Explains why, not only where. Offers a step, waits, checks the result, then corrects or moves on. Can quiz, say "your turn", and fade its hints as you improve. | Teaching card variants (explain, try it, check, recap), a "show me less" control |
| Long-term memory | Remembers what you learned, what you got wrong, what you asked last week, per topic. All stored locally, readable and deletable. | Memory page (topics, what Dalil knows, forget buttons), "I remember you did X" line in Home |
| Context aware | Knows which app and document you are in, what is on screen now, and what you were doing earlier, without asking again. Says what it used. | Context chip in the notch ("Reading: Figma, Frame 12"), per-app permission list, a receipt for every screen read |
| Text chat as well as voice | Type to Dalil when you cannot talk. Same flight, same cards. | A text field state of the notch (type to ask), history sheet |

### 16.2 Design consequences

- Receipts (section 6) become the memory log too: every lesson step Dalil took is a dated entry you can open, correct or delete.
- A learning session is a first-class object: topic, steps done, what stuck, what to revisit. Home shows "Continue: <topic>" before anything else once one exists.
- Context must be visible and revocable. The notch shows what it is reading right now, and a single control stops it.
- Memory never leaves the machine unless the endpoint the person configured receives a prompt that includes it; Setup states this plainly.

### 16.3 Not yet built

Voice capture, the hold-to-talk hotkey, screen perception, the planner, the memory store and its page, and the text field state. Today the notch, Setup, the guide cards and the pointer flight exist as UI only.

### 16.4 Hotkey on Wayland

There is no global key capture on Wayland, so Ctrl + Alt (hold) cannot be read by the app. Two supported routes: the XDG GlobalShortcuts portal (KDE, GNOME 47+; press and release events), and a compositor binding that runs `dalil --talk` for compositors without the portal (niri, Sway). The Home hint should name the key the current desktop can actually deliver.
