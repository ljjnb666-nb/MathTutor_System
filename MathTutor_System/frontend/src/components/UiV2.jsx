import { AlertTriangle, Loader2, Search } from 'lucide-react'

export function PageShell({ children, className = '', fit = false }) {
  return (
    <div
      className={`v2-page-shell ${fit ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-full'} ${className}`}
    >
      {children}
    </div>
  )
}

export function PageHeader({ title, description, icon: Icon, meta, actions, compact = false }) {
  return (
    <header className={`v2-page-header ${compact ? 'v2-page-header-compact' : ''}`}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="v2-page-header-icon">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="v2-page-title">{title}</h1>
            {meta}
          </div>
          {description && <p className="v2-page-description">{description}</p>}
        </div>
      </div>
      {actions && <div className="v2-page-actions">{actions}</div>}
    </header>
  )
}

export function PageHero({ title, description, stats, actions, artwork }) {
  return (
    <section className="v2-hero">
      <div className="relative z-10 min-w-0">
        <h2 className="text-xl font-black tracking-normal text-white sm:text-2xl">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-sm text-slate-300">{description}</p>}
        {stats?.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-3">
            {stats.map((item) => (
              <span key={item.label} className="v2-hero-chip">
                {item.icon}
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="relative z-10 v2-hero-actions">{actions}</div>}
      {artwork}
    </section>
  )
}

export function Toolbar({ children, className = '' }) {
  return <section className={`v2-toolbar ${className}`}>{children}</section>
}

export function SearchInput({ value, onChange, placeholder = '搜索...', label = '搜索', className = '' }) {
  return (
    <label className={`v2-search ${className}`}>
      <span className="sr-only">{label}</span>
      <Search className="h-4 w-4 shrink-0" />
      <input value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  )
}

export function SectionCard({ title, description, actions, children, className = '' }) {
  return (
    <section className={`v2-section-card ${className}`}>
      {(title || description || actions) && (
        <div className="v2-section-header">
          <div className="min-w-0">
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function MetricCard({ label, value, hint, icon: Icon, tone = 'primary', loading = false, onClick }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={`v2-metric-card v2-tone-${tone}`}>
      <div className="v2-metric-icon">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : Icon && <Icon className="h-5 w-5" />}</div>
      <div className="min-w-0">
        <p className="v2-metric-label">{label}</p>
        <p className="v2-metric-value">{loading ? '...' : value}</p>
        {hint && <p className="v2-metric-hint">{hint}</p>}
      </div>
    </Comp>
  )
}

export function StatusBadge({ children, tone = 'neutral' }) {
  return <span className={`v2-status v2-status-${tone}`}>{children}</span>
}

export function LoadingState({ title = '正在加载', description = '请稍候...' }) {
  return (
    <div className="v2-state">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      <p className="mt-3 text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs">{description}</p>
    </div>
  )
}

export function EmptyState({ icon: Icon, title = '暂无数据', description, action, actionLabel, onAction }) {
  const renderedAction = action ?? (actionLabel && onAction ? (
    <button type="button" onClick={onAction} className="v2-btn-secondary">
      {actionLabel}
    </button>
  ) : null)

  return (
    <div className="v2-state">
      {Icon && <Icon className="h-10 w-10 text-slate-500" />}
      <p className="mt-3 text-sm font-bold">{title}</p>
      {description && <p className="mt-1 text-xs">{description}</p>}
      {renderedAction && <div className="mt-4">{renderedAction}</div>}
    </div>
  )
}

export function ErrorState({ title = '加载失败', description, onRetry, actionLabel = '重试' }) {
  const safeDescription = typeof description === 'string'
    ? description
    : (description && typeof description === 'object' && 'msg' in description)
      ? description.msg
      : String(description?.message || description || '')

  return (
    <div className="v2-state v2-state-error">
      <AlertTriangle className="h-8 w-8 text-amber-400" />
      <p className="mt-3 text-sm font-bold">{title}</p>
      {safeDescription ? <p className="mt-1 text-xs">{safeDescription}</p> : null}
      {onRetry && (
        <button type="button" onClick={onRetry} className="v2-btn-secondary mt-4">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function ResponsiveTable({ columns, rows, rowKey, renderMobile, empty, loading }) {
  if (loading) return <LoadingState />
  if (!rows?.length) return empty || <EmptyState />
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block" style={{ borderColor: 'var(--color-border-primary)' }}>
        <div className="overflow-x-auto">
          <table className="v2-table">
            <thead>
              <tr>{columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={rowKey ? rowKey(row) : row.id ?? index}>
                  {columns.map((column) => <td key={column.key}>{column.render ? column.render(row, index) : row[column.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((row, index) => (
          <div key={rowKey ? rowKey(row) : row.id ?? index} className="v2-mobile-row">
            {renderMobile ? renderMobile(row, index) : columns.map((column) => (
              <div key={column.key} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-slate-500">{column.title}</span>
                <span className="text-right font-semibold text-slate-100">{column.render ? column.render(row, index) : row[column.key]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
