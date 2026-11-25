# core.log

A single-file programmer notebook and systems journal (`index.html`) featuring a typewriter hero with typo correction, spring-eased hover cards, a hash-routed reader view (`#/slug`), copy-flash code blocks, a `requestAnimationFrame` reading-progress bar, live GitHub star/fork counters with `localStorage` caching, and a 3-state theme switcher (`light`, `dim`, `dark`).

## Features

- **Typewriter Hero DSL:** Executes `type`, `wait`, `del`, and `delAll` steps with randomized keystroke intervals, punctuation pauses, a `buigs` → `bugs` correction sequence, and an idle blinking cursor.
- **Hover-Raise Cards & Hash Reader (`#/slug`):** Featured and numbered entry cards elevate on hover and open a modal reader view with serif drop caps, browser hash/back support, and scroll/focus restoration.
- **Copy-Flash Code Blocks:** Line-numbered, syntax-highlighted snippets in both list and reader views with Clipboard API + `execCommand` fallback, checkmark + `copied` feedback, and a one-shot accent ring pulse.
- **Reading Progress & Live `$ status`:** A `3px` `scaleX` top bar driven by `requestAnimationFrame` that tracks either the main page or the open reader scroll container, paired with live uptime and scroll depth.
- **Live GitHub Counters:** Queries public GitHub repositories with a 9-second timeout, animates star/fork count-ups, and falls back to `localStorage` cached values when offline or rate-limited.
- **3-State Theme Toggle (`light` / `dim` / `dark`):** Smoothly transitions CSS custom properties (including syntax token colors), persists in `localStorage`, respects `prefers-color-scheme` and `prefers-reduced-motion`, and responds to clicking the toggle or pressing `T`.

## Running Locally

Save the HTML source as `index.html` and open it directly in any modern browser, or serve the folder locally:

```bash
python3 -m http.server 8080
