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
      'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 light:bg-indigo-50 light:text-indigo-700 light:border-indigo-200',
    neutral:
      'bg-slate-800 text-slate-300 border border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 light:bg-slate-100 light:text-slate-700 light:border-slate-200',
    success:
      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 light:bg-emerald-50 light:text-emerald-700 light:border-emerald-200',
    warning:
      'bg-amber-500/10 text-amber-400 border border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 light:bg-amber-50 light:text-amber-700 light:border-amber-200',
    danger:
      'bg-rose-500/10 text-rose-400 border border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 light:bg-rose-50 light:text-rose-700 light:border-rose-200',
    info:
      'bg-sky-500/10 text-sky-400 border border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20 light:bg-sky-50 light:text-sky-700 light:border-sky-200',
  }[variant] || 'bg-slate-800 text-slate-300 border border-slate-700'

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
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    danger: 'bg-rose-400',
    info: 'bg-sky-400',
    neutral: 'bg-slate-400',
  }[status] || 'bg-slate-400'

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
