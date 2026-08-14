import { cn } from '../../lib/utils';
import { initials } from '../../lib/utils';

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-xs';
  return (
    <div
      className={cn(
        // brand-800 on brand-100 = 6.18:1; brand-700 would only reach 4.18:1 (below AA)
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800',
        sizeClasses
      )}
      title={name}
    >
      {initials(name || '?')}
    </div>
  );
}
