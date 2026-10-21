import { cn } from '../../lib/utils';
import { initials } from '../../lib/utils';

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[0.6667rem]' : size === 'md' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';
  return (
    <div
      className={cn(
        // brand-800 on brand-100 = 6.18:1; brand-700 would only reach 4.18:1 (below AA)
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 font-semibold text-brand-800 ring-1 ring-inset ring-brand-300/50',
        sizeClasses
      )}
      title={name}
    >
      {initials(name || '?')}
    </div>
  );
}
