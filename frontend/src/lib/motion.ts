import type { Transition, Variants } from 'framer-motion';

/**
 * One motion vocabulary for the whole app.
 *
 * Everything that moves uses this curve and this duration, so a dialog, a
 * drawer and a hover all feel like the same product rather than three
 * components each animated by whoever wrote them.
 *
 * 200ms is the brief's, and it is the right number: under ~150ms a transition
 * reads as a jump, and past ~300ms the interface feels like it is waiting on
 * itself. Ease-out means it leaves fast and settles gently - the element
 * arrives where you asked immediately and the motion is only the tail.
 *
 * The curve is `cubic-bezier(0.16, 1, 0.3, 1)` rather than CSS's stock
 * `ease-out`: same character, sharper exit, and it is the easing Linear and
 * Vercel both use for exactly this sort of surface.
 */
export const DURATION = 0.2;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const TRANSITION: Transition = { duration: DURATION, ease: EASE_OUT };

/** The matching CSS, for anything animated by Tailwind rather than Framer. */
export const CSS_EASE = 'cubic-bezier(0.16,1,0.3,1)';

/**
 * A modal surface: fades and scales up from just under its final size.
 *
 * The scale is 0.97 rather than something more dramatic because the dialog is
 * already centred - a big scale reads as the box inflating at you, where a
 * small one reads as it resolving into focus.
 */
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: TRANSITION },
  exit: { opacity: 0, scale: 0.98, y: 2, transition: { duration: 0.12, ease: EASE_OUT } },
};

/** The scrim behind a modal - opacity only; a scrim that moves is a distraction. */
export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION },
  exit: { opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } },
};

/** A drawer or side panel arriving from the right. */
export const drawerVariants: Variants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: TRANSITION },
  exit: { opacity: 0, x: 8, transition: { duration: 0.12, ease: EASE_OUT } },
};

/**
 * Page and panel entrance.
 *
 * Deliberately small (6px): a route change already replaces everything on
 * screen, so a large slide makes the whole app feel like it is sliding around
 * rather than the content having arrived.
 */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: TRANSITION },
};

/**
 * Staggered children, for a grid of cards settling in.
 *
 * 0.035s apart: enough to read as a sequence, short enough that the last tile
 * is in place within ~150ms of the first. Anything slower and the page feels
 * like it is being dealt out to you.
 */
export const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } },
};
