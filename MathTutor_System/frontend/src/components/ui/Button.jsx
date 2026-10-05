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
      'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none',
    secondary:
      'bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700 active:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-800 dark:border-slate-700 light:bg-slate-100 light:text-slate-800 light:border-slate-200 light:hover:bg-slate-200',
    outline:
      'border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white active:bg-slate-900 disabled:opacity-50 disabled:pointer-events-none dark:border-slate-700 dark:text-slate-300 light:border-slate-300 light:text-slate-700 light:hover:bg-slate-100',
    ghost:
      'text-slate-400 hover:bg-slate-800 hover:text-slate-100 active:bg-slate-900 disabled:opacity-50 disabled:pointer-events-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 light:text-slate-600 light:hover:bg-slate-100 light:hover:text-slate-900',
    danger:
      'bg-rose-600 text-white shadow-sm hover:bg-rose-500 active:bg-rose-700 disabled:opacity-50 disabled:pointer-events-none',
  }[variant] || 'bg-indigo-600 text-white hover:bg-indigo-500'

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
