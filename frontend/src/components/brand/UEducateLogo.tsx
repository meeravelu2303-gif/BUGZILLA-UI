import logoUrl from '../../assets/brand/ueducate-logo.png';
import { cn } from '../../lib/utils';

const NATURAL_WIDTH = 159;
const NATURAL_HEIGHT = 49;
const ASPECT = NATURAL_WIDTH / NATURAL_HEIGHT;

/** The real UEducate wordmark (shield + "UEDUCATE"). */
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
