import { useEffect, useRef, useId } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const generatedId = useId()

  const titleId = title ? `modal-title-${generatedId}` : undefined
  const descriptionId = description ? `modal-desc-${generatedId}` : undefined

  useEffect(() => {
    if (!isOpen) return

    // 1. 记录打开前的焦点元素以备关闭时恢复 (OVERLAY-A11Y-04)
    previousFocusRef.current = document.activeElement

    // 2. 锁定页面背景滚动
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 3. 打开后优先聚焦对话框内的第一个可交互控件，若无则聚焦对话框主体 (OVERLAY-A11Y-01)
    function focusInitial() {
      if (!dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        dialogRef.current.focus()
      }
    }
    focusInitial()
    const timer = setTimeout(focusInitial, 0)

    // 4. Tab 焦点循环陷阱 (OVERLAY-A11Y-02, OVERLAY-A11Y-03) 与 Escape 快捷退出 (OVERLAY-A11Y-06)
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return
        const focusables = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
        if (focusables.length === 0) {
          e.preventDefault()
          return
        }

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === dialogRef.current) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(timer)
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)

      // 5. 关闭时恢复此前触发焦点 (OVERLAY-A11Y-04)
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === 'function' &&
        document.contains(previousFocusRef.current)
      ) {
        previousFocusRef.current.focus()
      }
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* 遮罩背景 */}
      <div
        ref={overlayRef}
        onClick={onClose}
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
            onClick={onClose}
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
}) {
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const generatedId = useId()
  const titleId = title ? `drawer-title-${generatedId}` : undefined

  useEffect(() => {
    if (!isOpen) return

    // 1. 记录此前焦点 (OVERLAY-A11Y-05)
    previousFocusRef.current = document.activeElement

    // 2. 锁定滚动
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 3. 打开后移入焦点
    function focusInitial() {
      if (!dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        dialogRef.current.focus()
      }
    }
    focusInitial()
    const timer = setTimeout(focusInitial, 0)

    // 4. Tab 循环陷阱与 Escape 监听
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return
        const focusables = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
        if (focusables.length === 0) {
          e.preventDefault()
          return
        }

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === dialogRef.current) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(timer)
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)

      // 5. 退出时恢复此前焦点
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === 'function' &&
        document.contains(previousFocusRef.current)
      ) {
        previousFocusRef.current.focus()
      }
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
      className="fixed inset-0 z-50 overflow-hidden"
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        className={`fixed inset-y-0 ${positionClasses} flex w-full ${sizeClasses} flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-surface-raised)] shadow-2xl z-10 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] focus:outline-none ${className}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4">
          <h2 id={titleId} className="text-sm font-bold text-[var(--color-text-primary)]">
            {title}
          </h2>
          <IconButton icon={X} label="关闭" size="sm" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
