export function Card({
  children,
  title,
  subtitle,
  actions,
  footer,
  hoverable = false,
  className = '',
  contentClassName = '',
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-sm transition-all ${
        hoverable ? 'hover:border-[var(--color-border-strong)] hover:shadow-md' : ''
      } ${className}`}
    >
      {(title || subtitle || actions) && (
        <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4">
          <div>
            {title && (
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`p-5 ${contentClassName}`}>{children}</div>
      {footer && (
        <div className="border-t border-[var(--color-border-default)] px-5 py-3 bg-[var(--color-bg-subtle)] rounded-b-xl">
          {footer}
        </div>
      )}
    </div>
  )
}

export function Metric({
  label,
  value,
  hint,
  icon: Icon,
  trend, // { value: '+5%', direction: 'up' | 'down' | 'neutral', label?: string }
  loading = false,
  className = '',
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 transition-colors ${className}`}
    >
      <div className="flex items-center justify-between text-[var(--color-text-muted)]">
        <span className="text-xs font-medium">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden="true" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {loading ? (
          <span className="h-7 w-20 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
        ) : (
          <span className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            {value !== undefined && value !== null ? value : '-'}
          </span>
        )}
      </div>
      {(hint || trend) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {trend && (
            <span
              className={`font-semibold ${
                trend.direction === 'up'
                  ? 'text-[var(--color-success)]'
                  : trend.direction === 'down'
                  ? 'text-[var(--color-danger)]'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              {trend.value}
            </span>
          )}
          {hint && <span className="text-[var(--color-text-muted)]">{hint}</span>}
        </div>
      )}
    </div>
  )
}
