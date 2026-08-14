import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

function FieldShell({ label, htmlFor, error, hint, children }: { label?: string; htmlFor?: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : hint ? <p className="text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}

const inputClasses =
  'focus-ring w-full rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 backdrop-blur-sm disabled:bg-slate-100/70 disabled:text-slate-500';

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
      <input ref={ref} id={fieldId} className={cn(inputClasses, error && 'border-rose-400', className)} {...props} />
    </FieldShell>
  );
});
Input.displayName = 'Input';

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
      <textarea ref={ref} id={fieldId} className={cn(inputClasses, 'min-h-[6rem] resize-y', error && 'border-rose-400', className)} {...props} />
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
      <select ref={ref} id={fieldId} className={cn(inputClasses, 'appearance-none bg-no-repeat pr-8', error && 'border-rose-400', className)} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
    </FieldShell>
  );
});
Select.displayName = 'Select';
