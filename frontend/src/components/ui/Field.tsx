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

/** The red star after a mandatory field's label. */
export function RequiredMark() {
  return (
    <span className="ml-0.5 font-semibold text-rose-600" aria-hidden>
      *
    </span>
  );
}

function FieldShell({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-[0.8667rem] font-medium text-slate-700">
          {label}
          {required && <RequiredMark />}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClasses =
  'w-full rounded-xl border border-line bg-white/85 px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.03)] outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400 hover:border-slate-500/55 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-100/70 disabled:text-slate-500 disabled:hover:border-slate-500/55';
const errorClasses =
  '!border-rose-400 !bg-rose-50/40 hover:!border-rose-500 focus:!border-rose-500 focus:!ring-rose-500/15';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={props.required}>
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={cn(inputClasses, error && errorClasses, className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
Input.displayName = 'Input';

/** A password field with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={props.required}>
        <div className="relative">
          <input
            ref={ref}
            id={fieldId}
            type={visible ? 'text' : 'password'}
            className={cn(inputClasses, 'pr-10', error && errorClasses, className)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((currentVisible) => !currentVisible)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            aria-controls={fieldId}
            disabled={props.disabled}
            className="focus-ring absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </FieldShell>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={props.required}>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={cn(inputClasses, 'min-h-[6rem] resize-y leading-relaxed', error && errorClasses, className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
Textarea.displayName = 'Textarea';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className, id, placeholder, children, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={props.required}>
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={cn(
            inputClasses,
            'app-select cursor-pointer appearance-none bg-no-repeat pr-9',
            error && errorClasses,
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {children}
        </select>
      </FieldShell>
    );
  },
);
Select.displayName = 'Select';
