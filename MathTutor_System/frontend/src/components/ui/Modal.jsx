import { useId } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { useOverlayFocusManagement } from './useOverlayFocusManagement'

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
  const generatedId = useId()
  const titleId = title ? `modal-title-${generatedId}` : undefined
  const descriptionId = description ? `modal-desc-${generatedId}` : undefined

  const { dialogRef, onCloseRef } = useOverlayFocusManagement({ isOpen, onClose })

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* 遮罩背景 */}
      <div
        onClick={() => onCloseRef.current?.()}
        className="fixed inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* 模态框主体 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`relative w-full ${sizeClasses} rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-surface-raised)] shadow-2xl transition-all z-10 focus:outline-none ${className}`}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-6 py-4">
          <div>
            {title && (
              <h2 id={titleId} className="text-base font-bold text-[var(--color-text-primary)]">
                {title}
              </h2>
            )}
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {description}
              </p>
            )}
          </div>
          <IconButton
            icon={X}
            label="关闭"
            size="sm"
            onClick={() => onCloseRef.current?.()}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          />
        </div>

        {/* 内容区 */}
        <div className="max-h-[calc(85vh-8rem)] overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* 底部操作区 */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border-default)] px-6 py-3.5 bg-[var(--color-bg-subtle)] rounded-b-2xl">
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
  showHeader = true,
  id,
}) {
  const generatedId = useId()
  const titleId = title ? `drawer-title-${generatedId}` : undefined

  const { dialogRef, onCloseRef } = useOverlayFocusManagement({ isOpen, onClose })

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-xs',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }[size] || 'max-w-md'

  const positionClasses = position === 'left' ? 'left-0' : 'right-0'
  const borderClass = position === 'left' ? 'border-r' : 'border-l'

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
    >
      <div
        onClick={() => onCloseRef.current?.()}
        className="fixed inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        id={id}
        aria-label={!title && !titleId ? '抽屉导航' : undefined}
        aria-labelledby={title ? titleId : undefined}
        className={`fixed inset-y-0 ${positionClasses} flex w-full ${sizeClasses} flex-col ${borderClass} border-[var(--color-border-default)] bg-[var(--color-bg-surface-raised)] shadow-2xl z-10 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] focus:outline-none ${className}`}
      >
        {showHeader && (
          <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4">
            <h2 id={titleId} className="text-sm font-bold text-[var(--color-text-primary)]">
              {title}
            </h2>
            <IconButton icon={X} label="关闭" size="sm" onClick={() => onCloseRef.current?.()} />
          </div>
        )}
        <div className={showHeader ? 'flex-1 overflow-y-auto p-5' : 'flex-1 h-full overflow-hidden flex flex-col'}>
          {children}
        </div>
      </div>
    </div>
  )
}
