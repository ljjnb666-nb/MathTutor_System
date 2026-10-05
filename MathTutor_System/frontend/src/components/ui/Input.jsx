import { forwardRef } from 'react'

export const Input = forwardRef(function Input(
  {
    label,
    id,
    type = 'text',
    error,
    helperText,
    icon: Icon,
    iconPosition = 'left',
    required = false,
    disabled = false,
    className = '',
    inputClassName = '',
    ...props
  },
  ref
) {
  const inputId = id || props.name

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5"
        >
          {label}
          {required && <span className="text-[var(--color-danger)] ml-1" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && iconPosition === 'left' && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--color-text-muted)]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={disabled}
          required={required}
          className={`w-full rounded-lg border bg-[var(--color-bg-input)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:[var(--color-text-muted)] transition-colors focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 disabled:cursor-not-allowed disabled:opacity-60 ${
            Icon && iconPosition === 'left' ? 'pl-9' : ''
          } ${Icon && iconPosition === 'right' ? 'pr-9' : ''} ${
            error
              ? '!border-[var(--color-danger)] !ring-[var(--color-danger-border)]'
              : 'border-[var(--color-border-default)]'
          } ${inputClassName}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />
        {Icon && iconPosition === 'right' && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-text-muted)]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-[var(--color-danger-text)] font-medium" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          {helperText}
        </p>
      ) : null}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea(
  {
    label,
    id,
    rows = 3,
    error,
    helperText,
    required = false,
    disabled = false,
    className = '',
    textareaClassName = '',
    ...props
  },
  ref
) {
  const textareaId = id || props.name

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5"
        >
          {label}
          {required && <span className="text-[var(--color-danger)] ml-1" aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        disabled={disabled}
        required={required}
        className={`w-full rounded-lg border bg-[var(--color-bg-input)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:[var(--color-text-muted)] transition-colors focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 disabled:cursor-not-allowed disabled:opacity-60 ${
          error
            ? '!border-[var(--color-danger)] !ring-[var(--color-danger-border)]'
            : 'border-[var(--color-border-default)]'
        } ${textareaClassName}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${textareaId}-error`} className="mt-1.5 text-xs text-[var(--color-danger-text)] font-medium" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${textareaId}-helper`} className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          {helperText}
        </p>
      ) : null}
    </div>
  )
})

export const Select = forwardRef(function Select(
  {
    label,
    id,
    options = [],
    value,
    onChange,
    error,
    helperText,
    required = false,
    disabled = false,
    className = '',
    selectClassName = '',
    children,
    ...props
  },
  ref
) {
  const selectId = id || props.name

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5"
        >
          {label}
          {required && <span className="text-[var(--color-danger)] ml-1" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={`w-full appearance-none rounded-lg border bg-[var(--color-bg-input)] px-3 py-2 pr-8 text-sm text-[var(--color-text-primary)] transition-colors focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 disabled:cursor-not-allowed disabled:opacity-60 ${
            error
              ? '!border-[var(--color-danger)] !ring-[var(--color-danger-border)]'
              : 'border-[var(--color-border-default)]'
          } ${selectClassName}`}
          aria-invalid={error ? 'true' : 'false'}
          {...props}
        >
          {options.length > 0
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-[var(--color-text-muted)]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {error ? (
        <p id={`${selectId}-error`} className="mt-1.5 text-xs text-[var(--color-danger-text)] font-medium" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${selectId}-helper`} className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          {helperText}
        </p>
      ) : null}
    </div>
  )
})
