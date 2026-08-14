import logoUrl from '../../assets/brand/ueducate-logo.png';
import { cn } from '../../lib/utils';

/** Intrinsic size of the real asset (see BRANDING.md). */
const NATURAL_WIDTH = 159;
const NATURAL_HEIGHT = 49;
const ASPECT = NATURAL_WIDTH / NATURAL_HEIGHT;

/**
 * The real UEducate wordmark (shield + "UEDUCATE"), extracted from the live site's
 * own header - see BRANDING.md.
 *
 * Width is computed explicitly from the intrinsic aspect ratio rather than left to
 * `width: auto`: inside a flex *column*, the default `align-items: stretch` will
 * otherwise stretch the image to the container's width and visibly distort the
 * brand mark. `object-contain` is a second safety net if a caller constrains both
 * axes.
 */
export function UEducateLogo({ className, height = 28 }: { className?: string; height?: number }) {
  const width = Math.round(height * ASPECT);
  return (
    <img
      src={logoUrl}
      alt="UEducate"
      width={width}
      height={height}
      style={{ width, height }}
      className={cn('max-w-full shrink-0 select-none object-contain', className)}
      draggable={false}
    />
  );
}
