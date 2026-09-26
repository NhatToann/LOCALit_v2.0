import * as React from 'react';

type InputProps = {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, id, className, ...props },
  ref
) {
  const inputId = id ?? React.useId();
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-group">
      {label ? (
        <label htmlFor={inputId} className="form-label">
          {label}
          {required ? <span aria-hidden="true" className="text-danger">*</span> : null}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={['form-input', error ? 'error' : '', className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
      {hint && !error ? (
        <p id={hintId} className="form-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="form-hint error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

type TextareaProps = {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, id, className, ...props },
  ref
) {
  const inputId = id ?? React.useId();
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-group">
      {label ? (
        <label htmlFor={inputId} className="form-label">
          {label}
          {required ? <span aria-hidden="true" className="text-danger">*</span> : null}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={inputId}
        className={['form-input form-textarea', error ? 'error' : '', className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
      {hint && !error ? (
        <p id={hintId} className="form-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="form-hint error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
