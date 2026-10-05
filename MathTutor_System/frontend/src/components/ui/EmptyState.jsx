import { AlertCircle, FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import { Button } from './Button'

export function EmptyState({
  title = '暂无数据',
  description,
  actionLabel,
  onAction,
  icon: Icon = FolderOpen,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] mb-3.5">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-[var(--color-text-muted)] leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

export function LoadingState({
  text = '加载中...',
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center text-[var(--color-text-muted)] ${className}`}>
      <Loader2 className="h-7 w-7 animate-spin text-[var(--color-brand-500)] mb-3" aria-hidden="true" />
      <p className="text-xs font-medium text-[var(--color-text-muted)]">{text}</p>
    </div>
  )
}

export function Skeleton({
  variant = 'text', // 'text' | 'rect' | 'circle'
  width,
  height,
  className = '',
}) {
  const baseClasses = 'animate-pulse bg-[var(--color-bg-tertiary)] rounded'

  const variantClasses = {
    text: 'h-4 w-full rounded',
    rect: 'h-24 w-full rounded-lg',
    circle: 'rounded-full',
  }[variant] || 'h-4 w-full rounded'

  const style = {
    width: width || undefined,
    height: height || undefined,
  }

  return <div className={`${baseClasses} ${variantClasses} ${className}`} style={style} />
}

export function ErrorState({
  title = '加载失败',
  message = '网络请求出现异常，请稍后重试',
  onRetry,
  className = '',
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] ${className}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-danger)]/15 text-[var(--color-danger-text)] mb-3">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs opacity-90 leading-relaxed">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            icon={RefreshCw}
            className="border-[var(--color-danger-border)] text-[var(--color-danger-text)] hover:bg-[var(--color-danger-bg)]"
          >
            重新加载
          </Button>
        </div>
      )}
    </div>
  )
}
