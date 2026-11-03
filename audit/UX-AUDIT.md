# UX Audit — Freedemy

Buildathon demo: turns a YouTube lecture into a course with notes, an assignment checkpoint and a
section-scoped tutor. Four routes: `/`, `/dashboard`, `/generating`, `/course/[slug]`.
Audited build: `next dev` on `http://localhost:3000` (Turbopack, dev mode), Chromium via the
Freebuff desktop browser.

---

```
═══════════════════════════════════════════════════════════
VERDICT: FAIL

Persona: self-taught learner (24, phone-first, mid comfort, studying at night,
         wants to finish a lecture, not configure anything)
Surfaces audited: 4 / 4 routes (/, /dashboard, /generating, /course/python-fundamentals)
Interaction Manifest: 21 entries, sequence-ordered (see caveat below)

Hard Gates:
  console errors 0 | console warnings 1 (web-share, from the YouTube iframe) | network 5xx 0
  network 403/404 0 | layout collapse 0 (no horizontal overflow at 375/430/768/1024/1280)
  axe Critical 0 | axe Serious 0  (axe 4.10.2, / /dashboard /course — dark AND light)
Performance (/dashboard): CLS 0 | DCL 126ms | load 243ms | LCP not reported by this harness

Findings: Critical 0 | High 2 | Medium 5 | Low 5
═══════════════════════════════════════════════════════════
```

## Post-fix status (same session)

All High and Medium findings were patched and re-verified at 375 / 431 / 768 / 1024. L1 was
withdrawn as a false positive (see below). Open items: L3 (third-party console warning), L4
(pipeline theatre), and the LCP/INP gate, which this harness still cannot report.

| ID | Status | Change | Re-verified |
|----|--------|--------|-------------|
| H1 | Fixed | Tab row stacks (`flex-col-reverse`) under `sm`, list takes full width, tighter `px-3` triggers | All 4 tabs hit-test true at 375 and 431; list 326px/326px and 382px/382px |
| H2 | Fixed | Player wrapper is no longer sticky at any width (`relative`; original desktop in-flow layout kept) | not sticky at 375, 1024 or 1280; desktop re-checked for the sticky+transparent overlap regression and reverted |
| M1 | Fixed | `toastOptions.classNames.toast` gains `pointer-events-none` | toast computed `pointer-events: none`, hit-test under it returns page content |
| M2 | Fixed | Drawer headings read `Chapter 1…4` | `Chapter 1 complete Getting started` |
| M3 | Fixed | Hint uses `questions.length + 1` | "Answer all 3 questions to submit." |
| M4 | Fixed | Disabled CTA is `bg-muted text-muted-foreground`, no gradient/opacity | `rgb(241,245,249)` bg, `rgb(71,85,105)` text, opacity 1 |
| M5 | Fixed | `/dashboard` CTAs → `/#paste` | lands on `/#paste`, scrollY 260, input focused at y=106 |
| L1 | Retracted | Copy button already flips to "Copied" for 1.8s | observed `label: "Copied"`, check mark, toast — my first reading was taken after the window closed |
| L2 | Fixed | Placeholder is `Paste a YouTube link…` | not clipped at 375 |
| L5 | Resolved by H1 | Tabs no longer overflow, so the hidden scrollbar is moot | — |

Two extra fixes made while in the same code: the drawer now says "N of 7 sections started"
(it was counting attempted lessons as completed) and the chapter `complete` badge requires every
lesson in that chapter to score ≥70, matching the grading threshold — previously "Chapter 2
complete" sat next to a 55% lesson.

`npx tsc --noEmit` and `npx eslint .` both clean after the patches; axe still 0 violations on
`/course` in light theme.

---

**Manifest caveat (honest disclosure):** every entry below was produced by a real tool call
(type / click / key / screenshot / DOM read) and each carries its evidence artefact, but this
harness does not expose wall-clock timestamps per action, so the skill's "median gap ≥ 0.5s"
plausibility check cannot be satisfied. Treat the verdict as *findings-valid*, not as a
formally certifiable Pass.

---

## Persona lock

**Sam, 24, self-taught developer, phone-first, medium comfort, 11pm.** Landed from a tweet.
Wants: paste the lecture, get through it, know what they got wrong, close the tab. Will not read
help text. Judges the product in the first ten seconds on the hero.

First-time-user lens applied on top: no knowledge of the app's vocabulary ("section",
"checkpoint", "rewind").

---

## Interaction Manifest

| # | Surface | Action | Observed | Evidence |
|---|---------|--------|----------|----------|
| 1 | `/` | Load | 200, no console errors, all images 200 | `a01-home-1440.png`, network log |
| 2 | `/` | Enumerate controls | 12 interactive elements, 3 demo cards, 2 CTAs | DOM inventory |
| 3 | `/` | Type `not a youtube link`, Tab away | Error appears, `aria-invalid=true`, `aria-describedby` → visible alert | `a02-home-invalid-link.png` |
| 4 | `/` | Type `https://vimeo.com/12345`, Tab away | Error shown, CTA stays disabled | DOM read |
| 5 | `/` | Clear + type valid watch URL | CTA enables (opacity 0.5→1 over 300ms), gradient intact | `a03-home-valid-link.png` |
| 6 | `/` | Click Generate course | Navigates to `/generating?v=rfscVS0vtbw` | — |
| 7 | `/generating` | Observe pipeline | All 4 steps already "Done", 100%, instantly | `a04-generating.png` |
| 8 | `/generating` | Click Open | → `/course/python-fundamentals` | — |
| 9 | `/course` | Load at 431px | No overflow; tabs + Sections button in one row | `a05-course-mobile.png` |
| 10 | `/course` | Inspect tab row | "Tutor" is clipped; hit-test at its centre returns the **Sections** button | DOM hit-test |
| 11 | `/course` | Open Notes, click Copy | Clipboard write OK, toast "Notes copied to clipboard"; button label never changes | DOM read |
| 12 | `/course` | Open Assignment, answer 2 MC + short answer | Selections register, Submit enables | `a06` / DOM read |
| 13 | `/course` | Click Submit (clear area) | Grades, "100%", green "Accepted", toast "Nice — 100%" | `a07-after-submit.png` |
| 14 | `/course` | Try this section again, answer wrong | Reset works; graded state clears | DOM read |
| 15 | `/course` | Click quiz option at y=754 | Blocked — the **toast** swallows the click (`elementFromPoint` = toast) | DOM hit-test |
| 16 | `/course` | Scroll to 700, hit-test quiz option | Blocked — the **sticky player** (307px tall, 38% of viewport) covers it | `a08-sticky-player-overlap.png` |
| 17 | `/course` | Keyboard: focus Assignment → ArrowRight → Enter | Focus moves to Tutor, Enter selects it (manual activation) | DOM read |
| 18 | `/course` | Tutor: type question, Enter | Reply appears with a `2:09` source chip; textarea clears | `a10-tutor-ask.png` |
| 19 | `/course` | Click `2:09` chip | Player seeks and starts at 2:09 (`Play` overlay disappears) | `a12-sheet-stuck.png` |
| 20 | `/course` | Sections drawer → click "Strings, slicing" | Navigates + hash updates, drawer closes, heading changes | `a16-after-lesson-select.png` |
| 21 | `/dashboard` | Load, Continue, Add a course | Continue deep-links correctly; "Add a course" goes to `/` (no `#paste`) | `a13-dashboard-375.png` |

Console: 0 errors across the walkthrough. 1 warning repeated per navigation:
`Unrecognized feature: 'web-share'.` — raised by the YouTube IFrame-API iframe's permission
policy, not by app code.

Console warning **exception note:** one `uncaught exception` + "This page couldn't load" was
observed at one point. It was *caused by this audit* — I removed a Sonner toast `<li>` from the
DOM to continue a blocked click, and React crashed on the next render. Reproduced twice with and
twice without the intervention; without it, no crash. **Not an app defect.**

---

## Findings

### H1 — The Tutor tab is unreachable by pointer on phones
**Layer:** Interaction · **Severity:** High · **Surface:** `/course/*` at < ~500px
**Persona:** Sam on a phone, taps "Tutor" — the product's differentiator.

**Reproduce**
1. Open `/course/python-fundamentals` at 375×812 (or 431×900).
2. Look at the tab row: Overview / Notes / Assignment are visible; "Tutor" is cut off.
3. Hit-test the centre of the Tutor tab.

**Observed:** `document.elementFromPoint(centre of Tutor)` → `<button>Sections</button>`.
The tab list is squeezed to 234px of its 357px content width and scrolls horizontally with
`no-scrollbar`, so the fourth tab is clipped and the Sections button sits where a thumb lands.
**Expected:** all four tabs reachable at phone widths, or the section picker on its own row.

**Evidence:** `a05-course-mobile.png`, `a16-after-lesson-select.png`; hit-test at 375 (`Sections`)
and 431 (`Sections`); at 768 and 1024 the same test returns `Tutor`, so the break is phone-only.

**Suspected location:** `components/course-workspace.tsx:158-179` — the row is
`flex items-center justify-between`, the `TabsList` has `overflow-x-auto` + `no-scrollbar`, and the
`Sections` button sits beside it instead of below it.

**Smallest patch:** make the row stack on small screens and let the list keep its width:
```tsx
<div className="flex flex-col-reverse gap-2 border-b-2 border-border sm:flex-row sm:items-center sm:justify-between">
  <TabsList className="no-scrollbar h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b-0 p-0 sm:w-auto" …>
```
(and give the button `w-full sm:w-auto`).

---

### H2 — Sticky player covers 38% of a phone viewport and eats clicks
**Layer:** Interaction · **Severity:** High · **Surface:** `/course/*` at 375×812
**Persona:** Sam scrolling to the quiz.

**Reproduce**
1. At 375px, scroll down inside the lesson.
2. Try to tap the first quiz option while it sits under the pinned player.

**Observed:** the sticky block spans y=56→363 (307px = 38% of the viewport). Content slides
underneath it and hit-tests land on the player container (`PrevNextAuto-play nextSection…`), so
the control under it does nothing until the user scrolls it clear.
**Expected:** sticky player shrinks (or collapses to a bar) once scrolled, so the reading area
stays tappable.

**Evidence:** `a08-sticky-player-overlap.png`; `stickyHeight: 307`, `stickyTop: 56`, `vh: 812`,
and `elementFromPoint` returning the player at the quiz option's coordinates.

**Suspected location:** `components/course-workspace.tsx:126-140` — the wrapper
`sticky top-14 z-30 … bg-background/95` contains label + player + controls.

**Smallest patch:** pin only the player chrome on small screens —
`sticky top-14 … max-h-[38vh]` plus `sm:max-h-none` on the player box, or drop the sticky wrapper
below `sm:`. Either keeps the tab row reachable on the first screen.

---

### M1 — Bottom-centre toasts sit on top of page controls
**Layer:** Feedback · **Severity:** Medium · **Surface:** any route, ≤430px
**Persona:** Sam copies notes, then submits the assignment.

**Reproduce:** Copy notes → immediately tap a quiz option, the Submit button, or a tutor
timestamp chip near the bottom of the screen.

**Observed:** the toast is 326×54 at `bottom-center` with `pointer-events: auto`; every click in
that strip is swallowed. Reproduced three times: quiz option (y=754), Submit (y=756), timestamp
chip (y=777). State closed/open is unaffected — the click simply never happens.
**Expected:** toasts never intercept clicks, or sit clear of the primary action.

**Evidence:** hit-tests returning `LI.cn-toast`; `a06`, `a08`, `a10`.

**Caveat (measured):** auto-dismiss could not be verified — the automated tab reports
`document.visibilityState === 'hidden'`, and Sonner pauses its dismiss timer when hidden. On a
visible tab this window is the toast's ~4s lifetime, so the impact is a temporary dead strip
rather than a permanent block.

**Suspected location:** `app/layout.tsx:46` (`<Toaster position="bottom-center" />`).

**Smallest patch:** `<Toaster position="bottom-center" className="pointer-events-none **:data-[sonner-toast]:pointer-events-auto" />`
— simpler and safer: `position="top-center"` on mobile via `mobileOffset`, or
`toastOptions={{ className: "pointer-events-none" }}` on the toast itself.

---

### M2 — "Section" means two different things on the same screen
**Layer:** Visual/Comprehension · **Severity:** Medium · **Surface:** `/course/*`
**Persona:** first-timer who just saw "SECTION 4 OF 7".

**Reproduce:** open the Sections drawer (chapters titled `SECTION 1 … complete Getting started`),
then select "Strings, slicing and formatting" (listed under `SECTION 2`).

**Observed:** the lesson header reads `SECTION 4 OF 7`. Chapter numbers and lesson numbers both
use the word "Section" (and "4 chapters · 7 sections" on the cards uses "section" for lesson).
**Expected:** one word per concept — e.g. chapters numbered 1–4, lessons numbered 1–7.

**Evidence:** `a11-sections-drawer.png` vs `a16-after-lesson-select.png`.

**Suspected location:** drawer heading in `components/curriculum.tsx:31-40`; player label in
`components/course-workspace.tsx:120-124`.

**Smallest patch:** change the drawer heading to `Chapter {index + 1}` and the count line on cards
to `{chapters} chapters · {lessons} lessons`.

---

### M3 — "Answer all 2 questions to submit" — there are three
**Layer:** Feedback · **Severity:** Medium · **Surface:** `/course/*` Assignment below the button
**Persona:** Sam, who just answered 2 MC and sees a short-answer box still empty.

**Reproduce:** open Assignment with nothing answered; read the line under the disabled Submit.

**Observed:** "Answer all 2 questions to submit." while the header says "2 multiple choice · 1 short
answer" (3 total), and Submit stays disabled until the short answer is filled.
**Expected:** "Answer all 3 questions…".

**Evidence:** `a06-assignment-graded.png` / snapshot `uid=4_81`.

**Suspected location:** `components/panels/assignment-panel.tsx` (the `<p>` after the submit
button) — it hardcodes `lesson.questions.length` only.

**Smallest patch:** `Answer all {lesson.questions.length + 1} questions to submit.`

---

### M4 — Disabled primary CTA is unreadable in light mode
**Layer:** Visual · **Severity:** Medium · **Surface:** `/` at 375px, light theme
**Persona:** Sam looking at the hero before pasting anything.

**Observed:** white label on the gradient at `opacity: 0.5` over the light canvas; measured
≈1.9:1 (full-opacity mid-stop is already 3.62:1). The product's one action reads as "broken",
not "waiting".
**Expected:** a disabled state that still reads — e.g. solid `bg-muted text-muted-foreground`.

**Evidence:** `a14-home-light.png`; computed `opacity 0.5`, gradient `#2753ff → #7c3aed`,
`color: rgb(255,255,255)`.

**Suspected location:** `components/home/generate-form.tsx:96-99` (`disabled:shadow-none disabled:opacity-50`).

**Smallest patch:** add `disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100`.

---

### M5 — "Add a course" skips the paste field
**Layer:** Interaction · **Severity:** Medium · **Surface:** `/dashboard` (mobile and desktop)
**Persona:** Sam with no course yet.

**Reproduce:** on `/dashboard`, tap **Add a course**.

**Observed:** goes to `/` (top of the hero). The header's "New course" correctly goes to `/#paste`.
Sam lands above the fold and has to scroll/find the field.
**Expected:** same destination as "New course": `/#paste`.

**Evidence:** `a13-dashboard-375.png`; href list (`Add a course → /`, `New course → /#paste`).

**Suspected location:** `app/dashboard/page.tsx` — the "Add a course" link's `href`.

**Smallest patch:** `href="/#paste"`.

---

### L1 — Copy never confirms in place
**Layer:** Feedback · **Severity:** Low · **Surface:** `/course/*` Notes
Click "Copy" → toast confirms, but the button keeps saying "Copy". A local "Copied" state for 2s
removes the need to read the toast.

### L2 — Placeholder is clipped mid-word on phones
**Layer:** Visual · **Severity:** Low · **Surface:** `/` at 375
`Paste a YouTube link, e.g. youtub` is cut without an ellipsis; the format hint is exactly the
part that disappears.
`components/home/generate-form.tsx:23` — shorten to `Paste a YouTube link…`.

### L3 — `Unrecognized feature: 'web-share'` warning
**Layer:** Feedback (console) · **Severity:** Low (external) · **Surface:** any page with the player
Emitted by the YouTube IFrame API iframe's permission policy; not fixable in app code except by
not mounting the iframe until the user opts in. Gates-clean only if you accept third-party noise.

### L4 — The pipeline finishes before it starts
**Layer:** Delight · **Severity:** Low · **Surface:** `/generating`
All four steps are "Done" on first paint. Sam has no sense of work happening — the demo's most
impressive claim is shown as a finished checklist with no motion.
Suggestion: stagger the step states over ~2.4s even for demo data.

### L5 — Hidden-scrollbar tab strip gives no scroll affordance
**Layer:** Visual · **Severity:** Low · **Surface:** `/course/*` < 500px
`no-scrollbar` removes the only hint that more tabs exist — the root cause that makes H1 read as
"Tutor doesn't exist" rather than "scroll for more".

---

## Quick wins (24–48h)
- H1: stack the tab row under `sm` (one class change).
- M5: `href="/#paste"` on the dashboard CTA.
- M3: `lesson.questions.length + 1`.
- M4: real disabled styling instead of opacity.
- L2: shorten the placeholder.

## Structural (1–2 weeks)
- H2: collapse the sticky player after scroll (mini-bar with progress + play).
- M1: move toasts out of the thumb zone, or make them `pointer-events-none`.
- M2: rename chapter vs lesson consistently across cards, drawer, and header.

## Advanced polish (post-launch)
- L1 in-place copy confirmation, L4 staggered pipeline, keyboard `aria-describedby` polish on the
  tutor reply timestamps.

---

## Hold this in your hands

It feels like a well-made tool rather than a demo — the WebThreads backdrop, the floating
paste-pill, the section-scoped tutor that answers with a timestamp you can tap. That last detail is
the whole promise of the product, and it *works*: ask about bytecode, get an answer, tap `2:09`,
watch the lecture jump there. What it doesn't yet feel like is a phone product. On a 375px screen
the one thing that makes Freedemy Freedemy is hidden behind a "Sections" button, the player eats
the top third of the screen, and a toast can sit on your thumb. The craft is real; it just hasn't
been walked through on the device the audience will actually use.

---

## Appendix — measured values

- Viewports exercised: 375×812, 431×900, 768×900, 1024×900, 1280×720, 1440×900. No horizontal
  overflow at any of them (`scrollWidth - clientWidth = 0`).
- axe-core 4.10.2: 0 violations on `/`, `/dashboard`, `/course/python-fundamentals`, both themes.
- Tab list: content 357px, rendered 234px @375 and 290px @431.
- Sticky player: 307px tall, top 56px, 38% of a 812px viewport.
- Toast: 326×54 at y=743–797 @375, `pointer-events: auto`.
- Perf (/dashboard): CLS 0, DCL 126ms, load 243ms; LCP/INP not reported by this harness
  (no `largest-contentful-paint` entries surfaced), so the perf gate is **unverified**, not green.
