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
      className={`rounded-xl border border-slate-800 bg-slate-900/90 shadow-sm transition-all dark:bg-slate-900/90 dark:border-slate-800 light:bg-white light:border-slate-200 ${
        hoverable ? 'hover:border-slate-700 hover:shadow-md' : ''
      } ${className}`}
    >
      {(title || subtitle || actions) && (
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4 dark:border-slate-800/80 light:border-slate-200">
          <div>
            {title && (
              <h3 className="text-sm font-bold text-slate-100 dark:text-slate-100 light:text-slate-900">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`p-5 ${contentClassName}`}>{children}</div>
      {footer && (
        <div className="border-t border-slate-800/80 px-5 py-3 bg-slate-900/40 rounded-b-xl dark:border-slate-800/80 dark:bg-slate-900/40 light:border-slate-200 light:bg-slate-50">
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
      className={`rounded-xl border border-slate-800 bg-slate-900/80 p-4 transition-colors dark:bg-slate-900/80 dark:border-slate-800 light:bg-white light:border-slate-200 ${className}`}
    >
      <div className="flex items-center justify-between text-slate-400">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {loading ? (
          <span className="h-7 w-20 animate-pulse rounded bg-slate-800" />
        ) : (
          <span className="text-2xl font-bold tracking-tight text-slate-100 dark:text-slate-100 light:text-slate-900">
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
                  ? 'text-emerald-400'
                  : trend.direction === 'down'
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              {trend.value}
            </span>
          )}
          {hint && <span className="text-slate-500">{hint}</span>}
        </div>
      )}
    </div>
  )
}
