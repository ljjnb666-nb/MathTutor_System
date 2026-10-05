import { useEffect, useRef } from 'react'

export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Overlay 焦点管理 Hook (Modal / Drawer 统一权威)
 * 1. 记录打开前的 activeElement，关闭时恢复触发元素焦点
 * 2. 锁定/还原 body 滚动
 * 3. 初始焦点移入对话框内第一个可交互控件（无则聚焦对话框容器）
 * 4. 键盘 Tab 环形焦点陷阱（Tab 从末尾回头部，Shift+Tab 从头部回末尾）
 * 5. Escape 按键快捷关闭
 * 6. 解耦 onClose 回调身份：父组件重渲染生成新的内联回调不会重置焦点 (UI-OVERLAY-LIFECYCLE-02)
 */
export function useOverlayFocusManagement({ isOpen, onClose }) {
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    // 1. 记录此前焦点元素 (OVERLAY-A11Y-04 / 06)
    previousFocusRef.current = document.activeElement

    // 2. 锁定页面背景滚动
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 3. 打开后移入焦点 (OVERLAY-A11Y-01)
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
        onCloseRef.current?.()
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

      // 5. 关闭时恢复此前触发焦点
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === 'function' &&
        document.contains(previousFocusRef.current)
      ) {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen])

  return {
    dialogRef,
    onCloseRef,
    previousFocusRef,
  }
}
