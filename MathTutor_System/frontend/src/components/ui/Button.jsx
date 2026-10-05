import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

export const Button = forwardRef(function Button(
  {
    children,
    type = 'button',
    variant = 'primary', // 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
    size = 'md',        // 'sm' | 'md' | 'lg'
    loading = false,
    disabled = false,
    icon: Icon,
    iconPosition = 'left',
    className = '',
    onClick,
    ...props
  },
  ref
) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all select-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2'

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-3.5 py-2 gap-2',
    lg: 'text-base px-4 py-2.5 gap-2.5',
  }[size] || 'text-sm px-3.5 py-2 gap-2'

  const variantClasses = {
    primary:
      'bg-[var(--color-brand-600)] text-white shadow-sm hover:bg-[var(--color-brand-500)] active:bg-[var(--color-brand-700)] disabled:opacity-50 disabled:pointer-events-none',
    secondary:
      'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--color-border-strong)] disabled:opacity-50 disabled:pointer-events-none',
    outline:
      'border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-50 disabled:pointer-events-none',
    ghost:
      'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50 disabled:pointer-events-none',
    danger:
      'bg-[var(--color-danger)] text-white shadow-sm hover:opacity-90 active:opacity-100 disabled:opacity-50 disabled:pointer-events-none',
  }[variant] || 'bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)]'

  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
      ) : Icon && iconPosition === 'left' ? (
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : null}
      {children}
      {!loading && Icon && iconPosition === 'right' ? (
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : null}
    </button>
  )
})

export const IconButton = forwardRef(function IconButton(
  {
    icon: Icon,
    label,
    variant = 'ghost',
    size = 'md',
    loading = false,
    disabled = false,
    className = '',
    onClick,
    ...props
  },
  ref
) {
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-10 w-10 text-base',
  }[size] || 'h-9 w-9 text-sm'

  return (
    <Button
      ref={ref}
      variant={variant}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`!p-0 shrink-0 ${sizeClasses} ${className}`}
      {...props}
    >
      {Icon && !loading ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
    </Button>
  )
})
