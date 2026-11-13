/** Day-range helpers for the date filter. */
export type DateField = 'created' | 'updated';

export interface DayRange {
  from?: string;
  to?: string;
}

export function toDay(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

export function parseDay(day: string): Date {
  const [year, monthNumber, dayNumber] = day.split('-').map(Number);
  return new Date(year, monthNumber - 1, dayNumber);
}

function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/** First and last day of the month containing d. */
export function monthOf(date: Date): Required<DayRange> {
  return {
    from: toDay(new Date(date.getFullYear(), date.getMonth(), 1)),
    to: toDay(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

/** YYYY-MM (an <input type="month"> value) -> that month's range. */
export function monthRange(month: string): Required<DayRange> {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthOf(new Date(year, monthNumber - 1, 1));
}

export interface Preset {
  id: string;
  label: string;
  range: () => Required<DayRange>;
}

export const PRESETS: Preset[] = [
  { id: 'today', label: 'Today', range: () => ({ from: toDay(new Date()), to: toDay(new Date()) }) },
  {
    id: 'yesterday',
    label: 'Yesterday',
    range: () => ({ from: toDay(addDays(new Date(), -1)), to: toDay(addDays(new Date(), -1)) }),
  },
  {
    id: 'this-week',
    label: 'This week',
    range: () => {
      const now = new Date();
      return { from: toDay(addDays(now, -((now.getDay() + 6) % 7))), to: toDay(now) };
    },
  },
  {
    id: 'last-7',
    label: 'Last 7 days',
    range: () => ({ from: toDay(addDays(new Date(), -6)), to: toDay(new Date()) }),
  },
  { id: 'this-month', label: 'This month', range: () => ({ from: monthOf(new Date()).from, to: toDay(new Date()) }) },
  {
    id: 'last-month',
    label: 'Last month',
    range: () => {
      const now = new Date();
      return monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    },
  },
  {
    id: 'last-30',
    label: 'Last 30 days',
    range: () => ({ from: toDay(addDays(new Date(), -29)), to: toDay(new Date()) }),
  },
];

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const DAY_NO_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const MONTH_FMT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** "15 Oct 2026", "October 2026", "1 Oct – 14 Oct 2026", "from 3 Sep 2026". */
export function describeRange({ from, to }: DayRange): string {
  if (!from && !to) return 'Any date';
  if (from && !to) return `From ${DAY_FMT.format(parseDay(from))}`;
  if (!from && to) return `Until ${DAY_FMT.format(parseDay(to))}`;
  const day = parseDay(from!);
  const date = parseDay(to!);
  if (from === to) return DAY_FMT.format(day);
  const required = monthOf(day);
  if (required.from === from && required.to === to) return MONTH_FMT.format(day);
  if (day.getFullYear() === date.getFullYear()) return `${DAY_NO_YEAR.format(day)} – ${DAY_FMT.format(date)}`;
  return `${DAY_FMT.format(day)} – ${DAY_FMT.format(date)}`;
}

/** Which preset (if any) a range is exactly, so the popover can highlight it. */
export function matchPreset(range: DayRange): string | undefined {
  return PRESETS.find((preset) => {
    const required = preset.range();
    return required.from === range.from && required.to === range.to;
  })?.id;
}
