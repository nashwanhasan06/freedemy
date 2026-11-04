# Freedemy — UI, Accessibility & Overall Quality Audit

**Date:** 3 November 2026  
**Build:** current working tree (`next dev`, Turbopack) at `http://localhost:3000`  
**Surfaces:** `/` and `/course/python-fundamentals`  
**Viewports:** 1440×900, 720×450 (200% zoom), 390×844, 320×568  
**Themes:** light + dark  
**Also checked:** reduced motion, forced colours, keyboard order, 200% reflow

**Verdict: PASS WITH FIXES.** The visual direction is strong and the build is structurally sound — no page-level overflow at 320 px, no horizontal reflow at 200% zoom, correct theme persistence, and the WebGL hero correctly freezes under reduced motion. It is not demo-ready until the two P1 issues are fixed, and the P2 accessibility gaps should be closed before calling the build WCAG 2.2 AA complete.

---

## Scorecard

| Area | Rating | Notes |
| --- | --- | --- |
| Visual design | **Strong** | Distinctive WebThreads hero, coherent blue/violet system, unusually good light/dark parity. |
| Responsive layout | **Good** | 390/720/1440 pass; 320 has one clipped tab row. |
| Accessibility | **Good foundation, not AA-complete** | Lighthouse a11y 100, but manual checks found focus-contrast, forced-colour, label and heading issues. |
| Performance | **Good** | Home trace: LCP 494 ms, CLS 0. Course CLS comes from the YouTube iframe, not app layout. |
| Content/consistency | **Needs polish** | “4 sections” for 4 chapters; “1 lessons”; some tab copy. |
| Demo readiness | **Blocked by P1s** | Invalid-link dead end and clipped mobile tabs are visible in the core flow. |

Lighthouse (mobile, dev server):

| Run | Accessibility | Best Practices | SEO | Agentic | Notes |
| --- | --- | --- | --- | --- | --- |
| Home, light | 100 | 100 | **92** | **67** | missing `robots.txt`, `llms.txt` |
| Home, dark | 100 | 100 | 100 | 100 | later run; `robots.txt` still 404 on direct request |
| Course, light | 100 | **96** | 100 | **90** | CLS 0.134; `label-content-name-mismatch` |
| Course, dark | 100 | **96** | 100 | **90** | same |

Reports: `audit/lighthouse/report.json`, `audit/lighthouse-course/report.json`, `audit/lighthouse-home-dark/report.json`, `audit/lighthouse-course-dark/report.json`.

> Lighthouse still shows accessibility 100 on the course even though `label-content-name-mismatch` fails; that audit has no scoring weight. Automated scores are a floor, not a pass.

---

## What is working well

- **The hero is the strongest part of the product.** The WebThreads background, grid texture, large balanced headline and centred input form a clear focal sequence. The light and dark versions are both intentional rather than one being a recolour of the other.
- **The course screen is well composed.** Video first, section title second, tabs third, curriculum sidebar on desktop: the hierarchy matches how a learner uses the page.
- **Theme handling is robust.** The pre-paint script avoids a flash, `color-scheme` is kept in sync, the toggle persists, and the view-transition reveal is disabled under `prefers-reduced-motion`.
- **Reduced-motion support is mostly real, not cosmetic.** Verified the hero canvas stops animating, the intro is skipped and click pulses are disabled.
- **No layout collapse.** `scrollWidth === innerWidth` at 320, 390, 720 and 1440. No horizontal page scroll at 200% zoom.
- **Core structure is clean.** `tsc --noEmit` and ESLint pass; route titles/metadata are present; the YouTube iframe is correctly titled by YouTube; the form has `aria-invalid`, `aria-describedby` and a `role="alert"` error path.

---

# Findings

## P1 — fix before demo

### P1-1. Invalid links silently do nothing on the home page

**Files:** `components/home/generate-form.tsx:37`, `39–49`, `88–91`, `98–109`

The submit button is `disabled={!videoId}`. A disabled button cannot dispatch a submit event, so for non-empty invalid input the only path that sets `submitted` never runs. The error message therefore only appears after the field loses focus. Pressing Enter or clicking “Generate course” does nothing and gives no reason.

Reproduced at 1440 px:

| Step | Error visible? | `aria-invalid` | Button |
| --- | --- | --- | --- |
| Type `not a youtube link` | no | `false` | disabled |
| Press Enter | no | `false` | disabled |
| Click “Generate course” | no | `false` | disabled |
| Blur the input | **yes** | `true` | disabled |

This is the primary conversion path on the landing page, so it should be fixed first.

**Fix:** disable only when the field is empty; validate on submit; focus/keep the input in view and expose the error immediately. For example:

```tsx
const isEmpty = value.trim().length === 0;
const showError = !videoId && !isEmpty && (touched || submitted);

function handleSubmit(event: React.FormEvent) {
  event.preventDefault();
  setSubmitted(true);
  setTouched(true);
  if (!videoId) {
    inputRef.current?.focus();
    return;
  }
  router.push(`/generating?v=${videoId}`);
}
```

and `disabled={isEmpty}` on the button. Keep the existing `role="alert"`. Also re-check the inline error live when the user edits after a failed submit.

---

### P1-2. Course tabs clip at 320 px, and the active indicator is invisible at every width

**Files:** `components/course-workspace.tsx:152–166`, `components/ui/tabs.tsx:26`, `60–63`

Two separate defects in the same component:

1. At **320 px**, the four tabs are wider than the 288 px content area. The Tutor tab’s right edge is at **336 px** and a hit-test at its centre returns `MAIN`, because the tab is outside the visible area. The list is `overflow-x-auto` with `no-scrollbar`, so there is no visual cue that more tabs exist. At 390 px all four fit.

2. At **all widths**, the active underline is clipped. The tab is 40 px tall, but the tab list resolves to **32 px** high (`group-data-horizontal/tabs:h-8` in the shared `TabsList`), with `overflow-x-auto`. The active `::after` is positioned at `bottom: -2px` relative to the tab, i.e. about 498 px while the list ends at 492 px. It is clipped, so the only active-state cue is a colour change from grey to white.

Evidence: `audit/shots/audit-08-course-320.png`, `audit/shots/audit-12-tabs-viewport.png`, `audit/shots/audit-17-tab-focus.png`.

**Fix:**
- Make the list at least as tall as the trigger (`h-10`/`h-auto`) and place the indicator at `bottom-0` inside the list, or use a border on the active trigger.
- At `<sm`, either reduce horizontal padding/text size so all four fit, use a 2×2 grid, or keep the scroller but add a visible edge fade/scroll hint and ensure the final tab can be scrolled fully into view.
- Make the active state non-colour-only (underline/border + weight).

---

## P2 — close before calling the build accessible

### P2-1. The gradient word “Easier” disappears in forced-colors mode and is below 3:1 at its lightest stops

**Files:** `components/home/hero.tsx:77–83`, `app/globals.css:309–313`

`.text-gradient-logo` uses `background-clip: text` with `-webkit-text-fill-color: transparent`. Under Windows High Contrast / `forced-colors: active`, the background is removed but the text fill stays transparent. The H1 renders as **“Studying made .”** — the word “Easier” is completely invisible.

Evidence: `audit/shots/audit-14-forced-colors.png`.

The same gradient is a contrast risk in light mode. The first stop is `#60a5fa`; against the light hero background that is **2.40:1**. Rendered samples of the E and final R were **2.54:1** and **2.63:1**. The H1 is large text, so WCAG 1.4.3 requires **3:1**; the middle of the gradient passes, the ends do not.

**Fix:**

```css
@media (forced-colors: active) {
  .text-gradient-logo {
    background: none;
    -webkit-text-fill-color: currentColor;
    color: CanvasText;
  }
}
```

Use a darker light-mode ramp (start around `#3b82f6`/`#2563eb`, end around `#7c3aed`/`#9333ea`) and re-measure both ends. Keep the existing dark-theme ramp, which reads well.

---

### P2-2. Placeholder text fails 4.5:1 in both themes

**File:** `components/home/generate-form.tsx:81`

The input uses `placeholder:text-muted-foreground/70`, producing:

| Theme | Measured | Required |
| --- | --- | --- |
| Light | **3.56:1** | 4.5:1 |
| Dark | **4.15:1** | 4.5:1 |

The placeholder is the only visible instruction in the field, so this is real text, not decoration. Lighthouse/axe colour-contrast does not test placeholders, which is why the score stayed 100.

**Fix:** drop the `/70` (`placeholder:text-muted-foreground`), or introduce a dedicated `--placeholder` token that is at least 4.5:1 in both themes. This is a two-character change and should ship with P1-1.

---

### P2-3. The play overlay’s accessible name does not contain its visible label (WCAG 2.5.3)

**File:** `components/course-player.tsx:145`, `157`

- Visible: **“Play section · 0:00”**
- Accessible name: **“Play Why Python, and what it's good for from 0:00”**

A voice-control user saying “click Play section” cannot activate it. Lighthouse flags `label-content-name-mismatch`; the accessibility score remains 100 because the audit is unweighted.

**Fix:** make the accessible name start with the visible string, for example:

```tsx
aria-label={`Play section · ${formatClock(lesson.start)} — ${lesson.title}`}
```

or make the visible label include the lesson title. Re-run Lighthouse after the change; the mismatch item should disappear.

---

### P2-4. Content focus outlines are only 50% opacity — 2.18:1 light / ≈1.6:1 dark

**Files:** `app/globals.css:174–176`, `191–194`; `components/ui/tabs.tsx:60`

The universal rule applies `outline-ring/50`, which resolves to half-opacity accent. On keyboard focus, links/cards/tab triggers compute to an outline colour of `color-mix(in oklab, var(--ring) 50%, transparent)`:

| Theme | Composited outline vs page | Required for focus indicator |
| --- | --- | --- |
| Light | **2.18:1** | 3:1 |
| Dark | **≈1.6:1** | 3:1 |

The header brand link and most buttons additionally get a full-opacity border/ring, so focus is visible there; the problem is the content-level links, cards and tabs that rely on the faint outline. The tab outline is also clipped vertically by the 32 px list (see P1-2).

**Fix:** remove `outline-ring/50` from the `*` base rule, keep the `:focus-visible` rule at full `var(--ring)` with offset, and audit components that set `focus-visible:ring-ring/50` (tabs, buttons). If a softer halo is wanted, use a second full-opacity 1 px outline rather than dropping the whole indicator to 50%.

---

### P2-5. Autofocus skips the header and opens the mobile keyboard on load

**Files:** `components/home/hero.tsx:91`, `components/home/generate-form.tsx:84`

`GenerateForm` is always mounted with `autoFocus`. On load, focus is in the URL field. The first Tab therefore goes to **“Try a sample course”**, skipping the brand, “My courses” and the theme toggle. On a phone this also requests the virtual keyboard immediately, covering the hero the user just landed on. At 320 px the field is at y≈368 in a 568 px viewport, so the keyboard covers the CTA and feature pills.

This is a UX issue rather than a hard WCAG failure, but it is a poor first impression and it makes keyboard order start mid-page.

**Fix:** remove `autoFocus`; let the user choose the field. If autofocus is important on desktop, gate it behind `matchMedia("(pointer: fine)")` and a post-hydration effect, and never on touch devices.

---

### P2-6. Course panel headings are inconsistent or missing

**Files:** `components/panels/overview-panel.tsx:21`, `32`, `50`; `components/panels/tutor-panel.tsx:136`

The course page has a clean H1 → H2 → H3 outline for the curriculum (H1 lesson, H2 “Course content”, H3 chapters). But inside the tabs:

- “What this section covers”, “Key terms” and “In the video” are `CardTitle` **divs**, not headings.
- “Section tutor” is a `<p>`.
- Notes and Assignment correctly use `<h2>`.

A screen-reader user can navigate the curriculum by heading but cannot jump to the main content blocks of the active tab. Heading navigation also gives no indication that the tab content changed.

**Fix:** render the Overview card titles and “Section tutor” as `h2`/`h3` (add an `as`/`asChild` option to `CardTitle` or use a plain heading with the same classes). Keep the notes/assignment headings as the reference pattern.

---

### P2-7. Tutor chat has a placeholder-only field and no live announcement

**File:** `components/panels/tutor-panel.tsx:147–197`, `214–237`

- The textarea has no `<label>` or `aria-label`; its accessible name is the placeholder **“Ask about this section…”**. The name disappears visually as soon as the user types, and placeholder-as-label is fragile across assistive tech.
- The message list is a generic `<div>` with no `role="log"`/`aria-live`. The tutor reply is appended after a 650 ms timer, and focus stays in the textarea, so a screen-reader user gets no announcement that an answer arrived. The three bouncing dots are also silent.

**Fix:** add a persistent label (visually hidden is fine, e.g. “Ask the section tutor”), wrap the message list in `role="log" aria-live="polite" aria-relevant="additions text"`, and add an `sr-only` status (“Tutor is replying…”) for the pending state. This is a core product feature, so the chat should be fully usable without sight.

---

## P3 — polish and consistency

### P3-1. Course progress has no accessible semantics, especially on mobile

**File:** `components/course-workspace.tsx:94–115`

The desktop meter is a `div` with a width style and a visible “71%”; the mobile version is a 2 px line with the percentage hidden. Neither exposes `role="progressbar"`, `aria-valuenow` or a label. On mobile, a screen reader receives no progress information at all.

**Fix:** add `role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}` (or use `<progress>`), and keep the visible percentage on mobile or add an `sr-only` equivalent.

### P3-2. “Try a sample course” is distinguished by colour alone

**File:** `components/home/generate-form.tsx:119–124`

The link has `text-decoration: none`; its only non-hover distinction from the surrounding “No link?” sentence is hue. The link colour and surrounding muted text have almost identical luminance, so the 3:1 “colour + contrast” exception in WCAG 1.4.1 does not apply. Hover underline is not a persistent cue.

**Fix:** add `underline underline-offset-4` by default (the hover style already exists). This also makes the link easier to spot in the light theme.

### P3-3. No skip link

**Files:** `app/layout.tsx`, `app/page.tsx`, `components/course-workspace.tsx`

Keyboard users must traverse the sticky header on every page. The header is small, but a skip link is cheap and expected on a content site.

**Fix:** add a “Skip to content” link as the first focusable element in the layout, visible on focus, targeting `#main-content`; give the `<main>` elements that id.

### P3-4. Course copy contradicts itself: “4 sections” vs four chapters, and “1 lessons”

**Files:** `components/course-workspace.tsx:208`, `components/curriculum.tsx:52`

The sidebar header says **“4 sections · 53 min”**, but the course has 4 chapters / 7 sections and the card says “4 chapters · 7 sections”. The chapter rows say **“1 lessons”** for Chapter 4.

**Fix:** “4 chapters · 7 sections · 53 min” and `${count} ${count === 1 ? "lesson" : "lessons"}`. Also label the “5/7” counter (e.g. `aria-label="5 of 7 sections started"`).

### P3-5. Demo-card accessible names start with metadata

**File:** `components/home/demo-courses.tsx:36–46`

The first text in each card link is the badge “4 chapters · 7 sections”, so the accessible name begins with numbers before the course title. It is not wrong, but it is noisy and makes a list of courses harder to scan with a screen reader.

**Fix:** give the link an `aria-labelledby` pointing at the course title, or add a concise `aria-label` such as “Python Fundamentals: Types, Control Flow & Functions — Beginner, 53 min”. Keep the badge visible; it does not need to lead the name.

### P3-6. Theme toggle is 28×28 px

**File:** `components/theme-toggle.tsx:100–112`

It meets the WCAG 2.2 AA minimum of 24×24, but it is the smallest control in the header and below the 44 px touch guidance. The icon-only button is easy to miss on a phone.

**Fix:** use `size-9`/`size-10` at least at `<sm`, keeping the 16 px icon; the header has room.

### P3-7. `/robots.txt` is missing; `/llms.txt` is missing

`GET /robots.txt` → 404 and `GET /llms.txt` → 404 at audit time. One home Lighthouse run lost 8 SEO points for the missing robots file; a later run scored 100, but the direct 404 confirms the gap. `/llms.txt` is an experimental agentic-browsing suggestion, not a standard requirement.

**Fix:** add `app/robots.ts` with an allow-all rule and a sitemap if one exists. Optionally add a short `public/llms.txt` with an H1 and a link to the main product pages if the agentic score matters.

### P3-8. YouTube iframe accounts for the course CLS and the 96 Best Practices score

**File:** `components/course-player.tsx`

The course trace shows LCP 665 ms and CLS **0.12** from the `<video class="video-stream html5-main-video">` created inside the YouTube iframe; the main frame CLS is **0**. Best Practices 96 comes from a YouTube cookie inspector issue, not app code.

**Fix (optional, larger):** use a click-to-load facade (thumbnail + play button) and create the iframe only on play. This removes the cookie/third-party noise, removes the layout shift and is better for privacy and mobile data. If the player must be ready for timestamp seeking, reserve the iframe area and keep the facade until the user presses play.

### P3-9. Reduced motion still leaves two decorative animations running

**Files:** `components/panels/tutor-panel.tsx:188`, `app/globals.css:417–433`

The WebGL canvas, theme reveal, `animate-rise/fade/pop` and smooth scrolling are correctly disabled. The tutor typing dots use `animate-bounce` (decorative, and not in the reduced-motion block), and loaders use `animate-spin` (functional, acceptable). Add `.animate-bounce` to the reduce block, or switch the dots to a static “…” when reduced motion is requested.

---

## Visual review notes

- **Home, light:** the palette is cohesive but very pale. The hero’s only strong colour is the gradient word, so when that word is low-contrast or invisible (forced colours) the page loses its focal point. Darkening the light-mode gradient is worth it for both contrast and hierarchy.
- **Home, mobile:** the hero is long but the reading order is clear. The product preview is intentionally cut by the fold; it works as a teaser. The demo section starts cleanly.
- **Demo cards:** the YouTube thumbnails are inconsistent — two carry large “25 Million Views” / “1.8 Million Views” badges and unrelated cover text, while a failed thumbnail falls back to a plain blue gradient. Consider a consistent branded cover treatment (or a stronger overlay) so the row reads as one product rather than three embeds.
- **Course, desktop:** the video/sidebar split is balanced; the sidebar has the right amount of chrome. The only visible state problem is the missing active-tab underline.
- **Course, mobile:** the player and section title fit; the tab row is the weak point. The “Sections” button competes with the tabs for attention; consider moving it into the sticky header or reducing it to an icon with a label only on wider screens.
- **Both themes:** spacing, radii and border weights are consistent. The light theme’s white cards on lavender are clean; the dark theme’s violet-tinted charcoal is distinctive without being loud.

---

## Verification log

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | pass |
| ESLint (`app`, `components`, `lib`) | pass |
| 320 px reflow | pass for page; tabs clip internally (P1-2) |
| 390 px mobile | pass |
| 720 px (200% zoom) | pass; no horizontal page scroll |
| 1440 px desktop | pass |
| Light/dark parity | pass visually; see gradient/placeholder issues |
| `prefers-reduced-motion` | canvas static; theme reveal off; bounce dots remain |
| `forced-colors: active` | “Easier” invisible (P2-1) |
| Keyboard tab order | autofocus starts in input (P2-5); no skip link |
| Focus visibility | header/brand/buttons visible; content outlines 50% (P2-4) |
| Lighthouse a11y (4 runs) | 100; still has 2.5.3 failure on course |
| Lighthouse BP (course) | 96; third-party YouTube cookie issue |
| Home trace | LCP 494 ms, CLS 0 (local, unthrottled) |
| Course trace | LCP 665 ms, CLS 0.12 from iframe video (main frame 0) |

**Caveats:** the audit ran against `next dev`, not a production build; Lighthouse/performance numbers will differ in production. The presence of the Next.js dev “N” badge in screenshots is not part of the product. Accessibility-tree checks used Chrome DevTools, not a live NVDA/VoiceOver session.

**Artifacts:** screenshots and traces are in `audit/shots/` and `audit/`; the key evidence is `audit-14-forced-colors.png` (gradient disappearance), `audit-08-course-320.png` (clipped Tutor tab), `audit-12-tabs-viewport.png` (missing active indicator), and `audit-10-home-390-full.png` / `audit-11-course-390-full.png` (full mobile pages).

---

## Suggested order of work

1. **P1-1** invalid-link feedback (form) — ~30 min.
2. **P1-2** tab height, active indicator, 320 px fit — ~45 min.
3. **P2-2** placeholder contrast + **P2-3** play label — ~15 min.
4. **P2-1** gradient forced colours + light-mode contrast — ~30 min.
5. **P2-4** focus outline token — ~20 min.
6. **P2-5** remove mobile autofocus — ~5 min.
7. **P2-6/P2-7** course headings + tutor label/live region — ~45 min.
8. P3 items as polish.

No application source was changed as part of this audit.
