import { Eye, EyeOff } from 'lucide-react';
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/utils';

function FieldShell({ label, htmlFor, error, hint, children }: { label?: string; htmlFor?: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/*
 * One field look everywhere: a near-white fill on the glass, a hairline border
 * that darkens on hover, and a brand halo on focus (the border carries the
 * colour; the 4px ring is soft so it never looks like an error outline).
 */
const inputClasses =
  'w-full rounded-xl border border-slate-900/10 bg-white/85 px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.03)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-slate-400 hover:border-slate-900/20 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-100/70 disabled:text-slate-500 disabled:hover:border-slate-900/10';
const errorClasses = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, className, id, ...props }, ref) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
      <input ref={ref} id={fieldId} className={cn(inputClasses, error && errorClasses, className)} {...props} />
    </FieldShell>
  );
});
Input.displayName = 'Input';

/**
 * A password field with a show/hide toggle.
 *
 * Separate from `Input` rather than a `showToggle` prop, because the toggle
 * owns state and swaps the input's `type` - behaviour the plain, uncontrolled
 * Input deliberately does not have.
 *
 * Why offer it at all: the alternative to revealing a password is retyping a
 * long one blind, and people cope with that by choosing shorter, simpler
 * passwords. Letting someone check what they typed is the safer default on a
 * sign-in form, which is why browsers and password managers now do the same.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
        <div className="relative">
          <input
            ref={ref}
            id={fieldId}
            // Swapping to `text` is what reveals it. The field keeps its
            // autoComplete/name, so password managers still recognise it.
            type={visible ? 'text' : 'password'}
            className={cn(inputClasses, 'pr-10', error && errorClasses, className)}
            {...props}
          />
          <button
            /*
             * `type="button"` is load-bearing: a bare <button> inside a form
             * defaults to type="submit", so revealing the password would submit
             * the sign-in form instead.
             */
            type="button"
            onClick={() => setVisible((v) => !v)}
            /*
             * Announces the ACTION, and `aria-pressed` announces the state, so a
             * screen-reader user knows whether their password is currently
             * exposed on screen - which matters more here than for a sighted
             * user, who can simply see it.
             */
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            aria-controls={fieldId}
            // Nothing to reveal yet, and it keeps the empty field uncluttered.
            disabled={props.disabled}
            className="focus-ring absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </FieldShell>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, hint, className, id, ...props }, ref) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
      <textarea ref={ref} id={fieldId} className={cn(inputClasses, 'min-h-[6rem] resize-y leading-relaxed', error && errorClasses, className)} {...props} />
    </FieldShell>
  );
});
Textarea.displayName = 'Textarea';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, hint, className, id, placeholder, children, ...props }, ref) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
      {/* `app-select` paints the chevron (index.css); `appearance-none` removes the OS one. */}
      <select ref={ref} id={fieldId} className={cn(inputClasses, 'app-select cursor-pointer appearance-none bg-no-repeat pr-9', error && errorClasses, className)} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
    </FieldShell>
  );
});
Select.displayName = 'Select';
