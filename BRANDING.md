# BRANDING.md

Real brand assets extracted live from `https://www.ueducate.in/` on 2026-08-13. Nothing
below is guessed — every asset and color was pulled directly from the live site's own
files (its compiled JS bundle, compiled CSS, and served image files), documented here
before anything is applied to the app.

## How each asset was obtained

- The site is a React SPA (`static/js/main.148d7d01.js` + `static/css/main.8829f26c.css`).
- The header logo is embedded directly in the JS bundle as a base64 PNG, attached to the
  actual header markup: `className:"ueHeader"` → `className:"HLogoD"` → an `<img alt="UEducate">`
  wrapping the site's home link. That is as close to "the real logo" as it gets — it's
  the exact bytes their own header renders.
- The favicon and app-icon PNGs were fetched directly from `/favicon.png`, `/logo192.png`,
  `/logo512.png` as declared in the site's own `manifest.json`.
- The colors were confirmed two independent ways that agree with each other: (1) pixel-sampling
  the real logo file itself, and (2) grepping the compiled CSS for where those same hex
  values are actually declared — critically, `#3ab2cc` is the literal `background` of
  `.btn-primary` in their stylesheet, not a guess.

## Logo assets (real, downloaded)

| File | Source | Size | Use |
|---|---|---|---|
| `frontend/src/assets/brand/ueducate-logo.png` | Decoded from the header's embedded base64 PNG (webpack module id 2128, the exact image rendered in `ueHeader` → `HLogoD`) | 159×49, transparent background | Sidebar/topbar wordmark (shield + "UEDUCATE" text), login page |
| `frontend/public/favicon.png` | `https://www.ueducate.in/favicon.png`, referenced by their own `<link rel="icon">` | 100×105, transparent | Browser tab favicon |
| `frontend/src/assets/brand/ueducate-mark-512.png` | `https://www.ueducate.in/logo512.png`, their PWA icon | 512×512, transparent | Spare high-res shield-only mark, kept in case a larger icon is needed anywhere (not required by the current plan) |

The shield mark is a monogram: a navy shield divided into four quadrants forming "UC"
twice (mirrored), with one letter picked out in the brand's light-blue accent.

## Colors (confirmed, not guessed)

| Token | Hex | Where it's confirmed | Role in UEducate's own site |
|---|---|---|---|
| **Primary** | `#3AB2CC` | Literal `background` of `.btn-primary` and `.submitBtn` in their compiled CSS (36 occurrences, the single most-used custom color on the site) | Primary buttons / CTAs |
| **Primary (active/hover)** | `#2B9FB7` | Literal `background`/`border` of `.viewMoreBtn` and `.active` state (34 occurrences) | Hover/active state, a section background |
| **Brand ink (dark)** | `#2F383A` | Dominant pixel color of the logo's wordmark text and shield frame (1,425 of 1,588 opaque pixels in the real logo file) | Logo text, dark chrome |
| **Accent (light)** | `#5BC9ED` | Dominant blue pixel in the shield icon's letter cutout, in both the header logo and the 512px mark | Small accent highlight only (used sparingly on the real site, inside the mark itself) |

### Contrast check (measured, not eyeballed)

The brief requires AA contrast throughout, so I computed WCAG ratios rather than
trusting the eye. The authentic brand teal **fails AA for text**:

| Pairing | Ratio | AA text (4.5:1)? |
|---|---|---|
| White text on `#3AB2CC` | **2.49:1** | ❌ fails |
| White text on `#2B9FB7` | **3.11:1** | ❌ fails |
| `#3AB2CC` as text on white | **2.49:1** | ❌ fails |
| `#2F383A` (brand ink) on white | 12.02:1 | ✅ passes easily |

This is normal — plenty of brands use a bright accent that was never meant to sit under
white text at body sizes (on their own site, `.btn-primary` uses white-on-`#3AB2CC` at
16px/600-weight uppercase, which is a real-world accessibility weak point).

**Resolution:** keep the authentic hex wherever contrast doesn't apply, and use a
darkened step of the *exact same hue and saturation* (H 190.7°, S 58.9%) wherever text
contrast does apply. Derived by walking lightness down until it cleared AA:

- `#257B8E` (L 35%) → **4.88:1** against white — clears AA for button fills and link text.

So the token set is:
```
ueducate: {
  primary:  '#3AB2CC',   // authentic brand teal - non-text: gradients, accent bars, chart marks, focus rings
  strong:   '#257B8E',   // AA-safe (4.88:1) - white-on-brand button fills, link/nav text
  hover:    '#2B9FB7',   // authentic hover/active teal - non-text surfaces
  ink:      '#2F383A',   // logo/wordmark charcoal - headings, high-contrast text (12.02:1)
  accent:   '#5BC9ED',   // light accent from inside the shield mark - small highlights only
}
```

The brand stays visually accurate (the eye reads the same teal family everywhere), and
nothing in the UI ships below AA. If leadership specifically wants the raw `#3AB2CC`
under white button text despite the 2.49:1 measurement, say the word and I'll switch it
— but I'd be knowingly shipping an accessibility regression, so I'm defaulting to the
compliant version.

## Typography

Their CSS declares `font-family: Poppins, sans-serif` as the primary UI font (used far
more broadly than any other custom family) — Poppins is a free, open-licensed Google
Font, so I'll load it the same way the current app already loads Inter.

One heading font, `halyard_textblack`, is self-hosted via a licensed TTF file
(`HalyardTextBlack.ttf`) — this is a **commercial/proprietary font**, not something I can
legally bundle or redistribute into this repo. I'm not using it. Poppins alone is a
faithful, legally-clean match for the brand's everyday UI typography.

## Visual tone

- Strongly rounded: buttons use `border-radius: 30px` (pill-shaped), not just soft
  corners — more rounded than this app's current `rounded-xl`/`rounded-2xl`.
- Soft halo shadows on buttons (`box-shadow: 0 0 0 7px hsla(0,0%,100%,.07)`) rather than
  hard drop shadows.
- Header goes from transparent (over hero content) to solid white with rounded bottom
  corners once scrolled — a "floating pill" header feel.
- Overall: airy, rounded, soft-shadowed modern marketing-site aesthetic — compatible
  with, not a departure from, this app's existing glassmorphism direction.

## App name

**Confirmed: the name stays "Bugzilla."** No renaming to "UEducate Bug Tracker" or
similar — this task applies UEducate's logo, colors, and design language only. The
product name in the sidebar, tab title, and login screen remains Bugzilla, presented as
a UEducate-branded internal tool (UEducate logo + brand colors around the Bugzilla name).

## What gets branded in Phase 1

| Area | Change |
|---|---|
| Sidebar | Replace the generic bug-glyph tile + "Bugzilla UI" wordmark with the real UEducate logo, cleanly sized with padding; name reads "Bugzilla" |
| Browser tab | Real UEducate favicon (`/favicon.png`), title "Bugzilla — UEducate" |
| Login page | UEducate logo prominent, brand-teal primary button, subtle brand-teal gradient background |
| Primary buttons / CTAs | `ueducate-strong` fill (AA-safe), `hover` on interaction |
| Active nav state, links, focus rings | Brand teal family |
| Dashboard chart accents | Brand teal replaces the current indigo for the *chrome*; see next row |
| Status / severity badges | **Unchanged.** Red=blocker/critical, green=resolved, amber=in-progress etc. stay semantic — brand colors theme the chrome, never the signals |
| Glassmorphism | Preserved; brand colors tint the existing frosted-glass treatment rather than replacing it |
| Typography | Poppins (the brand's real UI font) loaded alongside the existing stack |

---

## Phase 1 — applied (verified)

### Tailwind tokens

Two things were added to `frontend/tailwind.config.js`:

1. **Named `ueducate-*` tokens** (`primary`, `strong`, `hover`, `ink`, `accent`) — explicit,
   self-documenting, used for decorative brand moments like the login accent bar.
2. **The app's existing `brand-*` scale re-based onto the UEducate teal hue** (H 190.7°,
   S 58.9%). This is what makes the branding land everywhere without touching ~50 call
   sites. Step **500 is exactly the authentic `#3AB2CC`**; step **700 is exactly the
   AA-safe `#257B8E`**.

| Step | Hex | Contrast vs white | Used for |
|---|---|---|---|
| 50 | `#eef9fc` | 1.07:1 | tint backgrounds |
| 100 | `#d8f2f8` | 1.17:1 | avatar / pill backgrounds |
| 500 | `#3ab2cc` | 2.49:1 | **decorative only** (accent bar, gradients) |
| 600 | `#2e9bb2` | 3.26:1 | focus rings, icon fills (≥3:1 non-text) |
| 700 | `#257b8e` | 4.88:1 | **button fills, link text** (≥4.5:1) |
| 800 | `#1c5f6d` | 7.22:1 | gradient end, avatar text |

### Contrast corrections made while applying

Applying the brand surfaced several genuine AA violations, which were fixed rather than
shipped:

- **Primary buttons** were `brand-500→600` (2.49:1 / 3.26:1 under white text — both fail).
  Changed to `brand-700→800` so every point of the gradient is ≥4.88:1.
- **Focus rings** were `brand-500` (2.49:1). WCAG requires ≥3:1 for non-text focus
  indicators → moved to `brand-600` (3.26:1).
- **Avatar** was `brand-700` on `brand-100` (4.18:1) → `brand-800` on `brand-100` (6.18:1).
- **Muted body text** across the app (`slate-400` / `slate-500`) measured 2.4–4.29:1
  against the new tinted glass background — all below AA. Bumped to `slate-600`. Icons,
  spinners, and disabled text were deliberately left lighter (decorative / exempt).

### Logo defect caught and fixed

The first render stretched the wordmark to **215×30** instead of its true **97×30** — a
flex column's default `align-items: stretch` was distorting it. `UEducateLogo` now computes
width explicitly from the intrinsic 159:49 ratio (plus `object-contain` as a safety net),
so the mark can never distort regardless of layout context. Verified by measuring the
rendered box in the live DOM.

### Verification results

- `tsc --noEmit` clean on **both** `backend` and `frontend`.
- No DB driver added — dependency list unchanged (still `cookie-session`, `cors`,
  `dotenv`, `express`, `zod`). Architecture and data flows untouched; this was a
  styling + asset change only.
- **Automated WCAG audit run against the live DOM** (walks every visible text element,
  resolves its true composited background including gradients, computes contrast at the
  correct 4.5:1 / 3:1 threshold for its size and weight):

  | Page | Text elements checked | Below AA |
  |---|---|---|
  | Login | 6 | **0** |
  | Dashboard | 62 | **0** |
  | Bugs | 223 | **0** |
  | Bug detail | 53 | **0** |
  | Create bug | 33 | **0** |
  | Admin users | 22 | **0** |
  | Admin products | 80 | **0** |
  | **Total** | **479** | **0** |

- Logo asset loads on every page (`naturalWidth > 0` asserted, not just "element exists").
- Tab title reads `Bugzilla — UEducate`; favicon is the real UEducate icon.
- Primary button computes to `linear-gradient(rgb(37,123,142), rgb(28,95,109))` =
  `#257B8E → #1C5F6D`, exactly as specified.
- Body font resolves to `Poppins, Inter, ui-sans-serif, system-ui, sans-serif`.
- Zero console errors and zero failed asset requests across all pages.
- **Semantic colors confirmed untouched**: status/severity pills and the dashboard's
  by-status / by-severity charts still use explicit Tailwind `blue`/`amber`/`emerald`/
  `rose`/`violet` values — no brand token reaches them. Red still means critical, green
  still means resolved. Only the neutral "Total bugs" stat tile (not a semantic signal)
  picked up brand teal.
