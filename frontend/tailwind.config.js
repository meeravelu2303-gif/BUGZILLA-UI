/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  /*
   * LIGHT THEME ONLY - deliberately no `darkMode` key and no `dark:` utilities
   * anywhere in src/. See the note in components/ui/Pill.tsx and the e2e
   * `ui-theme.spec.ts` tripwire.
   */
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        /*
         * Plus Jakarta Sans for headlines only. Its wider apertures and taller
         * x-height give a heading presence at large sizes, but it is looser
         * than Inter at 13px - so body text, and every dense table, stays on
         * Inter. Two faces, each doing the job it is good at.
         */
        display: ['Plus Jakarta Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        /**
         * Royal Blue / Electric Cyan - the product accent system.
         *
         * Replaces the UEducate teal that docs/BRANDING.md documents. That was a
         * deliberate product decision, not drift; see the "Accent system" note
         * in docs/BRANDING.md for what changed and why the teal tokens were kept.
         *
         * Contrast was MEASURED against white, not eyeballed, because the whole
         * point of the previous system was that the authentic brand colour
         * silently failed AA for text. The same split applies here:
         *
         *   primary  #2563EB  5.17:1  AA for text AND as a white-text button fill
         *   accent   #06B6D4  2.43:1  DECORATIVE ONLY - never behind text
         *   strong   #1D4ED8  6.70:1  pressed/active fills, high-emphasis text
         *   deep     #0E7490  5.36:1  the AA-safe cyan, when cyan must carry text
         *
         * Electric Cyan lands at 2.43:1, almost exactly where the old teal sat
         * (2.49:1) - so it inherits the same rule the teal had: gradients,
         * accent bars and chart marks only.
         */
        royal: {
          primary: '#2563EB', // AA 5.17:1 - buttons, links, focus rings
          strong: '#1D4ED8', // AA 6.70:1 - hover/active fills
          accent: '#06B6D4', // 2.43:1 - DECORATIVE ONLY, never behind text
          deep: '#0E7490', // AA 5.36:1 - cyan that must carry text
          ink: '#0F172A', // 17.85:1 - headings and body
        },
        /**
         * The `brand-*` scale every existing component already references, now
         * re-based onto Royal Blue. Keeping the scale NAME means ~45 components
         * inherit the new accent without touching a single import.
         *
         * Measured vs white: 500 = 3.68:1 (large text / UI only), 600 = 5.17:1,
         * 700 = 6.70:1, 800 = 8.72:1, 900 = 10.36:1. Steps 50-400 are below 3:1
         * and are surface tints only - never put text directly on them.
         */
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        /**
         * Electric Cyan, as its own scale so a component can reach for the
         * secondary accent explicitly rather than hoping a brand step reads as
         * cyan. Same rule: 600 is the first step that may sit under text
         * (3.68:1, large/UI), 700+ for body text.
         */
        cyan: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        /**
         * Every non-accent border and divider, built from PURE SLATE #64748B.
         *
         * Two weights, both the same hue - the colour is the brief's, the alpha
         * is what keeps it premium:
         *
         *   hairline  #64748B @ 18%  card edges, dividers, table rules
         *   line      #64748B @ 38%  input and control edges
         *
         * Full-strength #64748B measures 4.76:1 against white. That is TEXT
         * contrast: drawn around every card it reads as a wireframe, which is
         * the opposite of the depth the shadows are doing. Compositing the same
         * slate over white keeps the hue exactly as specified while letting the
         * line sit at the weight an edge wants. Raise the alpha here to go
         * heavier - it is one number, in one place.
         *
         * Controls get the heavier step on purpose: an input's edge is an
         * affordance, and at 18% a field stops looking like somewhere to type.
         */
        hairline: 'rgb(100 116 139 / 0.18)',
        line: 'rgb(100 116 139 / 0.38)',
      },
      /*
       * Elevation, rebuilt for a PRISTINE WHITE surface.
       *
       * The previous shadows were tinted with brand teal and carried an inner
       * white highlight, because they sat on a frosted-glass canvas that needed
       * selling. On pure white that reads as grubby, so these are neutral slate
       * at low alpha - the Linear approach, where elevation is implied by a
       * hairline border plus a barely-there shadow rather than a soft drop.
       *
       *   hairline - resting cards: the border does the work, shadow is a whisper
       *   raised   - hover/interactive surfaces
       *   float    - popovers, dialogs, the save bar, the command palette
       *   ring     - the focus halo, in Royal Blue
       */
      boxShadow: {
        hairline: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        raised: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
        /*
         * Two-layer elevation: a tight contact shadow that reads as the card
         * touching the page, plus a wide soft one that lifts it off.
         *
         * This is what replaces the hairline as the primary depth cue. A single
         * blurred shadow goes muddy on white - it looks like a smudge rather
         * than a lit edge - so the near layer stays short and slightly darker
         * to keep the card's boundary crisp without drawing a line.
         */
        /*
         * Tailwind's own shadow-sm and shadow-md, verbatim.
         *
         * Kept under these names so the ~17 existing call sites did not all have
         * to change, but the VALUES are now stock - a card here and a card in
         * any other Tailwind app cast exactly the same shadow. The bespoke
         * two-layer versions that used to live here were heavier, and two
         * slightly-different custom elevations are how a design system starts
         * drifting.
         */
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        lifted: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        float: '0 10px 32px -12px rgb(15 23 42 / 0.18), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
        overlay: '0 24px 64px -20px rgb(15 23 42 / 0.28), 0 4px 12px -4px rgb(15 23 42 / 0.08)',
        ring: '0 0 0 3px rgb(37 99 235 / 0.16)',
        /*
         * Kept under their old names so existing components do not break while
         * the redesign rolls out page by page. They now resolve to the neutral
         * values above rather than the teal-tinted originals.
         */
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        glass: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
        glow: '0 8px 20px -6px rgb(37 99 235 / 0.35)',
      },
      borderColor: {
        DEFAULT: 'rgb(100 116 139 / 0.18)',
      },
      /*
       * A tighter type scale than Tailwind's default at the small end: a
       * high-density bug table lives at 12-13px, and the stock `text-xs`
       * (12px/16px) leaves too much leading for a compact row.
       */
      /*
       * Leading opened up across the scale - roughly 1.5-1.6x at body sizes,
       * where it was 1.55 at best and 1.45 at `base`. Dense tables were the
       * reason it was tight; the tables set their own row height, so the scale
       * no longer has to pay for them.
       */
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
        xs: ['0.75rem', { lineHeight: '1.25rem' }],
        sm: ['0.8125rem', { lineHeight: '1.375rem' }],
        base: ['0.875rem', { lineHeight: '1.5rem' }],
        md: ['0.9375rem', { lineHeight: '1.625rem' }],
        lg: ['1.0625rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        xl: ['1.25rem', { lineHeight: '1.875rem', letterSpacing: '-0.015em' }],
        '2xl': ['1.5rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '2.375rem', letterSpacing: '-0.02em' }],
      },
      /*
       * One curve and one duration for the whole app - see lib/motion.ts.
       *
       * Set as DEFAULT so every `transition`, `transition-colors`,
       * `transition-all` already written across the app picks up 200ms ease-out
       * with no edit. Tailwind's own defaults are 150ms and `ease`, which is
       * both quicker and flatter than the brief asks for.
       *
       * Deliberately NOT done as a global `* { transition-duration: 200ms }`:
       * CSS defaults `transition-property` to `all`, so that rule would animate
       * every property on every element - including layout - and turn ordinary
       * reflows into visible drifting.
       */
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
        premium: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
        premium: '200ms',
      },
      keyframes: {
        'toast-in': { from: { opacity: '0', transform: 'translateY(0.5rem) scale(0.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'page-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        indeterminate: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(300%)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-20px)' } },
        blob: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(30px,-40px) scale(1.12)' },
          '66%': { transform: 'translate(-25px,25px) scale(0.92)' },
        },
        'gradient-x': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        drift: { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '60px 60px' } },
        'ring-pulse': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { opacity: '0' },
        },
        /* Radix mounts/unmounts popovers, dialogs and menus with data-state. */
        'overlay-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'content-in': {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.97)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.97) translateY(-2px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
      },
      animation: {
        'toast-in': 'toast-in 0.22s cubic-bezier(0.22,1,0.36,1)',
        'page-in': 'page-in 0.35s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.5s infinite',
        indeterminate: 'indeterminate 1.2s ease-in-out infinite',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.9s ease-out both',
        float: 'float 7s ease-in-out infinite',
        'float-slow': 'float 11s ease-in-out infinite',
        blob: 'blob 20s ease-in-out infinite',
        'blob-slow': 'blob 28s ease-in-out infinite',
        'gradient-x': 'gradient-x 6s ease infinite',
        drift: 'drift 3s linear infinite',
        /*
         * Ambient version of the same keyframe, for a background grid.
         * 3s is a progress-indicator speed; behind a sign-in form it reads as
         * the page twitching. The keyframe travels exactly 60px, so any grid
         * using this MUST be 60px too or the pattern jumps at each loop
         * instead of tiling seamlessly.
         */
        'drift-slow': 'drift 40s linear infinite',
        'ring-pulse': 'ring-pulse 2.4s ease-out infinite',
        'overlay-in': 'overlay-in 0.15s ease-out',
        'content-in': 'content-in 0.18s cubic-bezier(0.22,1,0.36,1)',
        'pop-in': 'pop-in 0.14s cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
};
