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
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 dark:bg-slate-900/40 dark:border-slate-800 light:bg-slate-50 light:border-slate-300 ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400 mb-3.5 dark:bg-slate-800/80 light:bg-slate-200 light:text-slate-600">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-bold text-slate-200 dark:text-slate-200 light:text-slate-800">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-slate-400 leading-relaxed">
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
    <div className={`flex flex-col items-center justify-center p-12 text-center text-slate-400 ${className}`}>
      <Loader2 className="h-7 w-7 animate-spin text-indigo-500 mb-3" aria-hidden="true" />
      <p className="text-xs font-medium text-slate-400">{text}</p>
    </div>
  )
}

export function Skeleton({
  variant = 'text', // 'text' | 'rect' | 'circle'
  width,
  height,
  className = '',
}) {
  const baseClasses = 'animate-pulse bg-slate-800 rounded dark:bg-slate-800 light:bg-slate-200'

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
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-rose-900/30 bg-rose-950/20 text-rose-300 dark:bg-rose-950/20 light:bg-rose-50 light:border-rose-200 light:text-rose-700 ${className}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 mb-3">
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
            className="border-rose-800/60 text-rose-300 hover:bg-rose-900/30 dark:border-rose-800/60 light:border-rose-300 light:text-rose-700 light:hover:bg-rose-100"
          >
            重新加载
          </Button>
        </div>
      )}
    </div>
  )
}
