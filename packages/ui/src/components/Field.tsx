import { useId, type InputHTMLAttributes } from 'react';
import { cx } from '../cx';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

/** Campo con etiqueta, ayuda y error asociados para lectores de pantalla. */
export function Field({ label, hint, error, className, id, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={cx('cx-field', className)}>
      <label className="cx-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="cx-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {hint ? (
        <span id={hintId} className="cx-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="cx-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
