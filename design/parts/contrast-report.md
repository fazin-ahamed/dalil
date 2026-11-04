# Contrast report: Dalil design tokens

Source: `/home/fazinahamed/Documents/Dalil/design/tokens.css`, default `:root` values. Method: WCAG 2.1 relative luminance.
Requirements: text 4.5:1, non-text 3:1. No pair is marked as large text, so every text pair is held to 4.5:1.
Ratios are truncated to one decimal, never rounded up, so the shown value and the verdict always agree.

**36 pairs: 33 pass, 3 fail.**

## Failures

| Token | Current | Suggested | Pair | Ratio now | Ratio after | Requirement |
|---|---|---|---|---|---|---|
| `--color-success` | #1B8A57 | **#198252** | on `--color-paper-2` (#F6F8FC) | 4.0 | 4.5 | 4.5:1 (text) |
| `--color-rule-strong` | #BFC9DE | **#768BB8** | on `--color-paper` (#EDF1F8) | 1.4 | 3.0 | 3.0:1 (non-text) |
| `--notch-rule` | #26262C | **#585866** | on `--notch-bg` (#000000) | 1.3 | 3.0 | 3.0:1 (non-text) |

## All pairs

| Pair | Ratio | Requirement | Result |
|---|---|---|---|
| `--color-ink` (#1A2236) on `--color-paper` (#EDF1F8) | 13.9 | 4.5:1 (text) | PASS |
| `--color-ink` (#1A2236) on `--color-paper-2` (#F6F8FC) | 14.8 | 4.5:1 (text) | PASS |
| `--color-ink` (#1A2236) on `--color-paper-3` (#E3E9F4) | 12.9 | 4.5:1 (text) | PASS |
| `--color-ink-2` (#3F485C) on `--color-paper` (#EDF1F8) | 8.0 | 4.5:1 (text) | PASS |
| `--color-ink-2` (#3F485C) on `--color-paper-2` (#F6F8FC) | 8.6 | 4.5:1 (text) | PASS |
| `--color-ink-2` (#3F485C) on `--color-paper-3` (#E3E9F4) | 7.5 | 4.5:1 (text) | PASS |
| `--color-muted` (#5F6980) on `--color-paper` (#EDF1F8) | 4.8 | 4.5:1 (text) | PASS |
| `--color-muted` (#5F6980) on `--color-paper-2` (#F6F8FC) | 5.1 | 4.5:1 (text) | PASS |
| `--color-muted` (#5F6980) on `--color-paper-3` (#E3E9F4) | 4.5 | 4.5:1 (text) | PASS |
| `--color-accent` (#2456C7) on `--color-paper` (#EDF1F8) | 5.7 | 4.5:1 (text) | PASS |
| `--color-accent` (#2456C7) on `--color-paper-2` (#F6F8FC) | 6.1 | 4.5:1 (text) | PASS |
| `--color-accent` (#2456C7) on `--color-paper-3` (#E3E9F4) | 5.3 | 4.5:1 (text) | PASS |
| `--color-accent-ink` (#FFFFFF) on `--color-accent` (#2456C7) | 6.4 | 4.5:1 (text) | PASS |
| `--color-error` (#C8372D) on `--color-paper-2` (#F6F8FC) | 4.8 | 4.5:1 (text) | PASS |
| `--color-success` (#1B8A57) on `--color-paper-2` (#F6F8FC) | 4.0 | 4.5:1 (text) | **FAIL** |
| `--color-warn` (#A35F00) on `--color-paper-2` (#F6F8FC) | 4.7 | 4.5:1 (text) | PASS |
| `--color-signal` (#2F7BFF) on `--color-paper` (#EDF1F8) | 3.4 | 3.0:1 (non-text) | PASS |
| `--color-rule-strong` (#BFC9DE) on `--color-paper` (#EDF1F8) | 1.4 | 3.0:1 (non-text) | **FAIL** |
| `--notch-ink` (#F5F5F7) on `--notch-bg` (#000000) | 19.2 | 4.5:1 (text) | PASS |
| `--notch-ink` (#F5F5F7) on `--notch-raised` (#111114) | 17.3 | 4.5:1 (text) | PASS |
| `--notch-ink-2` (#B4B4BC) on `--notch-bg` (#000000) | 10.1 | 4.5:1 (text) | PASS |
| `--notch-ink-2` (#B4B4BC) on `--notch-raised` (#111114) | 9.1 | 4.5:1 (text) | PASS |
| `--notch-muted` (#8A8A94) on `--notch-bg` (#000000) | 6.1 | 4.5:1 (text) | PASS |
| `--notch-muted` (#8A8A94) on `--notch-raised` (#111114) | 5.5 | 4.5:1 (text) | PASS |
| `--notch-accent` (#86AEFF) on `--notch-bg` (#000000) | 9.5 | 4.5:1 (text) | PASS |
| `--notch-accent` (#86AEFF) on `--notch-raised` (#111114) | 8.5 | 4.5:1 (text) | PASS |
| `--notch-ok` (#5BD991) on `--notch-bg` (#000000) | 11.7 | 4.5:1 (text) | PASS |
| `--notch-ok` (#5BD991) on `--notch-raised` (#111114) | 10.5 | 4.5:1 (text) | PASS |
| `--notch-warn` (#FFC15C) on `--notch-bg` (#000000) | 13.0 | 4.5:1 (text) | PASS |
| `--notch-warn` (#FFC15C) on `--notch-raised` (#111114) | 11.6 | 4.5:1 (text) | PASS |
| `--notch-error` (#FF7B72) on `--notch-bg` (#000000) | 8.3 | 4.5:1 (text) | PASS |
| `--notch-error` (#FF7B72) on `--notch-raised` (#111114) | 7.4 | 4.5:1 (text) | PASS |
| `--notch-primary-ink` (#FFFFFF) on `--notch-primary` (#2A62F5) | 5.0 | 4.5:1 (text) | PASS |
| `--notch-focus` (#86AEFF) on `--notch-bg` (#000000) | 9.5 | 3.0:1 (non-text) | PASS |
| `--notch-rule` (#26262C) on `--notch-bg` (#000000) | 1.3 | 3.0:1 (non-text) | **FAIL** |
| `--color-focus` (#2456C7) on `--color-paper` (#EDF1F8) | 5.7 | 3.0:1 (non-text) | PASS |

## Notes

- Suggested hexes keep each token's hue and saturation and change only lightness, taking the smallest step that passes every listed pair that uses the token. Other uses of the token were not checked.
- WCAG 1.4.11 applies only to non-text that identifies a control or its state, or to graphics needed to understand content. If `--color-rule-strong` or `--notch-rule` only draws decorative dividers, its failure does not apply. If either outlines an input or control, apply the suggestion.
- `@media (prefers-contrast: more)` sets `--notch-rule` to #5A5A63: 3.0:1 on `--notch-bg`, pass. Default mode uses the base value.

Regenerate with `node /home/fazinahamed/Documents/Dalil/design/parts/contrast.mjs` after editing tokens.css.
