import type { Transition, Variants } from 'framer-motion';

/** One motion vocabulary for the whole app. */
export const DURATION = 0.2;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const TRANSITION: Transition = { duration: DURATION, ease: EASE_OUT };

/** The matching CSS, for anything animated by Tailwind rather than Framer. */
export const CSS_EASE = 'cubic-bezier(0.16,1,0.3,1)';

/** A modal surface: fades and scales up from just under its final size. */
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

/** Page and panel entrance. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: TRANSITION },
};

/** Staggered children, for a grid of cards settling in. */
export const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } },
};
