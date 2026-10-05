import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className = '',
}) {
  const overlayRef = useRef(null)

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose?.()
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    full: 'max-w-4xl',
  }[size] || 'max-w-md'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* 遮罩背景 */}
      <div
        ref={overlayRef}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* 模态框主体 */}
      <div
        className={`relative w-full ${sizeClasses} rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl transition-all z-10 dark:bg-slate-900 dark:border-slate-700/80 light:bg-white light:border-slate-200 ${className}`}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 dark:border-slate-800 light:border-slate-200">
          <div>
            {title && (
              <h2 id="modal-title" className="text-base font-bold text-slate-100 dark:text-slate-100 light:text-slate-900">
                {title}
              </h2>
            )}
            {description && (
              <p id="modal-description" className="mt-0.5 text-xs text-slate-400">
                {description}
              </p>
            )}
          </div>
          <IconButton
            icon={X}
            label="关闭"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white dark:hover:text-white light:hover:text-slate-900"
          />
        </div>

        {/* 内容区 */}
        <div className="max-h-[calc(85vh-8rem)] overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* 底部操作区 */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-3.5 bg-slate-900/50 rounded-b-2xl dark:border-slate-800 dark:bg-slate-900/50 light:border-slate-200 light:bg-slate-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  position = 'right', // 'right' | 'left'
  size = 'md',        // 'sm' | 'md' | 'lg'
  className = '',
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose?.()
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-xs',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }[size] || 'max-w-md'

  const positionClasses = position === 'left' ? 'left-0' : 'right-0'

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />
      <div
        className={`fixed inset-y-0 ${positionClasses} flex w-full ${sizeClasses} flex-col border-l border-slate-800 bg-slate-900 shadow-2xl z-10 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] dark:bg-slate-900 dark:border-slate-800 light:bg-white light:border-slate-200 ${className}`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 dark:border-slate-800 light:border-slate-200">
          <h2 className="text-sm font-bold text-slate-100 dark:text-slate-100 light:text-slate-900">
            {title}
          </h2>
          <IconButton icon={X} label="关闭" size="sm" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
