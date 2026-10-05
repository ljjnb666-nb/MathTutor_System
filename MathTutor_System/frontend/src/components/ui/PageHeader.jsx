import { ChevronRight } from 'lucide-react'

export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
  compact = false,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${
        compact ? 'mb-4' : 'mb-6'
      } ${className}`}
    >
      <div>
        {breadcrumbs.length > 0 && (
          <nav aria-label="面包屑导航" className="mb-1.5 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="h-3 w-3 text-[var(--color-border-strong)]" aria-hidden="true" />}
                {crumb.to ? (
                  <a href={crumb.to} className="hover:text-[var(--color-text-primary)] transition-colors">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-[var(--color-text-secondary)] font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)] max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </div>
  )
}

const AVATAR_PALETTE = [
  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'bg-violet-500/15 text-violet-400 border-violet-500/30',
  'bg-rose-500/15 text-rose-400 border-rose-500/30',
  'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
]

export function Avatar({
  name = '',
  src,
  size = 'md', // 'sm' | 'md' | 'lg'
  className = '',
}) {
  const sizeClasses = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
  }[size] || 'h-8 w-8 text-xs'

  const initial = name ? String(name).trim()[0] || '?' : '?'
  const charCode = name ? name.charCodeAt(0) || 0 : 0
  const colorClass = AVATAR_PALETTE[charCode % AVATAR_PALETTE.length]

  if (src) {
    return (
      <img
        src={src}
        alt={name || '头像'}
        className={`rounded-full object-cover shrink-0 border border-[var(--color-border-default)] ${sizeClasses} ${className}`}
      />
    )
  }

  return (
    <div
      aria-label={name || '头像'}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold border select-none ${colorClass} ${sizeClasses} ${className}`}
    >
      {initial}
    </div>
  )
}
