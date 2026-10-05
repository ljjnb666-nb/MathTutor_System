import { forwardRef } from 'react'
import { Check } from 'lucide-react'

export const Checkbox = forwardRef(function Checkbox(
  { label, id, checked, onChange, disabled = false, className = '', ...props },
  ref
) {
  const checkboxId = id || (typeof label === 'string' ? label : undefined)

  return (
    <label
      htmlFor={checkboxId}
      className={`inline-flex items-center gap-2.5 select-none cursor-pointer text-sm text-[var(--color-text-secondary)] ${
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-[var(--color-text-primary)]'
      } ${className}`}
    >
      <div className="relative flex items-center justify-center">
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <div className="h-4 w-4 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-input)] transition-colors peer-checked:border-[var(--color-brand-600)] peer-checked:bg-[var(--color-brand-600)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-brand-500)]/30" />
        <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
      </div>
      {label && <span>{label}</span>}
    </label>
  )
})

export const Switch = forwardRef(function Switch(
  { label, id, checked, onChange, disabled = false, className = '', ...props },
  ref
) {
  const switchId = id || (typeof label === 'string' ? label : undefined)

  return (
    <label
      htmlFor={switchId}
      className={`inline-flex items-center gap-3 select-none cursor-pointer text-sm text-[var(--color-text-secondary)] ${
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-[var(--color-text-primary)]'
      } ${className}`}
    >
      <div className="relative inline-flex items-center">
        <input
          ref={ref}
          id={switchId}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <div className="h-5 w-9 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border-default)] transition-colors peer-checked:bg-[var(--color-brand-600)] peer-checked:border-[var(--color-brand-600)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-brand-500)]/30" />
        <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4 shadow-sm" />
      </div>
      {label && <span>{label}</span>}
    </label>
  )
})
