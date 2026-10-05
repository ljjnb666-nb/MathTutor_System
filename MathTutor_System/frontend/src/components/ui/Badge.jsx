export function Badge({
  children,
  variant = 'neutral', // 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  size = 'md',        // 'sm' | 'md'
  icon: Icon,
  className = '',
  ...props
}) {
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  }[size] || 'text-xs px-2.5 py-1 gap-1.5'

  const variantClasses = {
    brand:
      'bg-[var(--color-brand-subtle)] text-[var(--color-brand-text)] border border-[var(--color-brand-300)]',
    neutral:
      'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border-default)]',
    success:
      'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border border-[var(--color-success-border)]',
    warning:
      'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] border border-[var(--color-warning-border)]',
    danger:
      'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] border border-[var(--color-danger-border)]',
    info:
      'bg-[var(--color-info-bg)] text-[var(--color-info-text)] border border-[var(--color-info-border)]',
  }[variant] || 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border-default)]'

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full select-none ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  )
}

export function StatusBadge({
  status = 'neutral', // 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  pulse = false,
  label,
  className = '',
  ...props
}) {
  const dotClasses = {
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger)]',
    info: 'bg-[var(--color-info)]',
    neutral: 'bg-[var(--color-text-muted)]',
  }[status] || 'bg-[var(--color-text-muted)]'

  return (
    <Badge variant={status} className={className} {...props}>
      <span className="relative flex h-2 w-2 shrink-0">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClasses}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClasses}`} />
      </span>
      <span>{label}</span>
    </Badge>
  )
}
