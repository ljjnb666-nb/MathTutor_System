import { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import {
  Button,
  IconButton,
  Input,
  Select,
  Checkbox,
  Switch,
  Badge,
  StatusBadge,
  Modal,
  Drawer,
  Card,
  Metric,
  EmptyState,
  PageHeader,
} from './index'

describe('TutorPro UI Primitives', () => {
  afterEach(() => {
    cleanup()
  })
  it('renders Button variants and handles click and loading state', () => {
    const handleClick = vi.fn()
    const { rerender } = render(
      <Button variant="primary" onClick={handleClick}>
        创建教案
      </Button>
    )

    const btn = screen.getByRole('button', { name: '创建教案' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(handleClick).toHaveBeenCalledTimes(1)

    // Loading disabled state
    rerender(
      <Button variant="primary" loading onClick={handleClick}>
        创建教案
      </Button>
    )
    expect(btn).toBeDisabled()
  })

  it('renders Input with label, error, and helperText', () => {
    render(
      <Input
        label="备课主题"
        id="theme"
        placeholder="输入主题"
        helperText="请输入本节课核心学习目标"
      />
    )

    expect(screen.getByLabelText('备课主题')).toBeInTheDocument()
    expect(screen.getByText('请输入本节课核心学习目标')).toBeInTheDocument()
  })

  it('renders Select with options and handles change', () => {
    const handleChange = vi.fn()
    render(
      <Select
        label="选择学科"
        id="subject"
        value="physics"
        onChange={handleChange}
        options={[
          { value: 'math', label: '数学' },
          { value: 'physics', label: '物理' },
          { value: 'chemistry', label: '化学' },
        ]}
      />
    )

    const select = screen.getByLabelText('选择学科')
    expect(select.value).toBe('physics')
    fireEvent.change(select, { target: { value: 'chemistry' } })
    expect(handleChange).toHaveBeenCalled()
  })

  it('renders Checkbox and Switch controls', () => {
    const handleCheckbox = vi.fn()
    const handleSwitch = vi.fn()

    render(
      <div>
        <Checkbox label="包含解析" checked={false} onChange={handleCheckbox} />
        <Switch label="自动保存" checked={true} onChange={handleSwitch} />
      </div>
    )

    expect(screen.getByLabelText('包含解析')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('renders Badge and StatusBadge', () => {
    render(
      <div>
        <Badge variant="brand">核心知识点</Badge>
        <StatusBadge status="success" label="已掌握" pulse />
      </div>
    )

    expect(screen.getByText('核心知识点')).toBeInTheDocument()
    expect(screen.getByText('已掌握')).toBeInTheDocument()
  })

  it('OVERLAY-A11Y-01: open moves focus inside modal', () => {
    function ModalOpenHarness() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button data-testid="open-trigger" onClick={() => setOpen(true)}>
            打开模态窗
          </button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="新建教学任务">
            <input data-testid="task-name" placeholder="任务名称" />
            <button data-testid="save-btn">保存</button>
          </Modal>
        </div>
      )
    }

    render(<ModalOpenHarness />)
    const trigger = screen.getByTestId('open-trigger')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '新建教学任务' })
    expect(dialog).toBeInTheDocument()
    // Focus has moved inside dialog
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('OVERLAY-A11Y-02: Tab wraps last → first', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="循环聚焦测试">
        <input data-testid="first-input" placeholder="输入" />
        <button data-testid="last-action">确定操作</button>
      </Modal>
    )

    const lastBtn = screen.getByTestId('last-action')
    lastBtn.focus()
    expect(document.activeElement).toBe(lastBtn)

    // Press Tab on last focusable
    fireEvent.keyDown(window, { key: 'Tab' })

    const dialog = screen.getByRole('dialog')
    const focusables = dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    const firstFocusable = focusables[0]

    expect(document.activeElement).toBe(firstFocusable)
  })

  it('OVERLAY-A11Y-03: Shift+Tab wraps first → last', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="逆向循环聚焦测试">
        <input data-testid="first-input" placeholder="输入" />
        <button data-testid="last-action">确定操作</button>
      </Modal>
    )

    const dialog = screen.getByRole('dialog')
    const focusables = dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    const firstFocusable = focusables[0]
    const lastFocusable = focusables[focusables.length - 1]

    firstFocusable.focus()
    expect(document.activeElement).toBe(firstFocusable)

    // Press Shift+Tab on first focusable
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(lastFocusable)
  })

  it('OVERLAY-A11Y-04: close restores trigger focus', () => {
    function ModalRestoreHarness() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button data-testid="restore-trigger" onClick={() => setOpen(true)}>
            触发按钮
          </button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="焦点恢复测试">
            <button data-testid="modal-content-btn">弹窗内按钮</button>
          </Modal>
        </div>
      )
    }

    render(<ModalRestoreHarness />)
    const trigger = screen.getByTestId('restore-trigger')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    // Open modal
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Close modal via close button
    const closeBtn = within(dialog).getByRole('button', { name: '关闭' })
    fireEvent.click(closeBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Focus should be restored to trigger
    expect(document.activeElement).toBe(trigger)
  })

  it('OVERLAY-A11Y-05: Drawer same contract (open focus, Tab trap, close restore)', () => {
    function DrawerHarness() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button data-testid="drawer-trigger" onClick={() => setOpen(true)}>
            打开侧边抽屉
          </button>
          <Drawer isOpen={open} onClose={() => setOpen(false)} title="教学侧边抽屉">
            <input data-testid="drawer-input" placeholder="输入项" />
            <button data-testid="drawer-last-btn">最后按钮</button>
          </Drawer>
        </div>
      )
    }

    render(<DrawerHarness />)
    const trigger = screen.getByTestId('drawer-trigger')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    // 1. Open drawer -> focus inside
    fireEvent.click(trigger)
    const drawer = screen.getByRole('dialog', { name: '教学侧边抽屉' })
    expect(drawer).toBeInTheDocument()
    expect(drawer.contains(document.activeElement)).toBe(true)

    // 2. Tab trap wrap last -> first
    const lastBtn = screen.getByTestId('drawer-last-btn')
    lastBtn.focus()
    expect(document.activeElement).toBe(lastBtn)
    fireEvent.keyDown(window, { key: 'Tab' })

    const focusables = drawer.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    const firstFocusable = focusables[0]
    expect(document.activeElement).toBe(firstFocusable)

    // 3. Shift+Tab trap wrap first -> last
    firstFocusable.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastBtn)

    // 4. Close drawer -> restore trigger focus
    const closeBtn = within(drawer).getByRole('button', { name: '关闭' })
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('OVERLAY-A11Y-06: Escape closes both Modal and Drawer', () => {
    const handleModalClose = vi.fn()
    const { unmount: unmountModal } = render(
      <Modal isOpen={true} onClose={handleModalClose} title="Escape测试弹窗">
        <p>任务配置表单</p>
      </Modal>
    )

    expect(screen.getByRole('dialog', { name: 'Escape测试弹窗' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleModalClose).toHaveBeenCalledTimes(1)
    unmountModal()

    const handleDrawerClose = vi.fn()
    render(
      <Drawer isOpen={true} onClose={handleDrawerClose} title="Escape测试抽屉">
        <p>抽屉内容</p>
      </Drawer>
    )

    expect(screen.getByRole('dialog', { name: 'Escape测试抽屉' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleDrawerClose).toHaveBeenCalledTimes(1)
  })

  it('OVERLAY-A11Y-07: parent rerender with new callback identity MUST NOT reset focus', () => {
    // 1. Modal regression test
    function ModalRerenderHarness() {
      const [, setDummy] = useState(0)
      return (
        <div>
          <button data-testid="rerender-btn" onClick={() => setDummy((c) => c + 1)}>
            重渲染父组件
          </button>
          <Modal
            isOpen={true}
            // Passing a fresh inline closure each render tests onClose reference decoupling
            onClose={() => {}}
            title="重渲染测试弹窗"
          >
            <input data-testid="modal-first-control" placeholder="第一控件" />
            <input data-testid="modal-second-control" placeholder="第二控件" />
          </Modal>
        </div>
      )
    }

    const { unmount: unmountModal } = render(<ModalRerenderHarness />)
    const modalSecond = screen.getByTestId('modal-second-control')
    modalSecond.focus()
    expect(document.activeElement).toBe(modalSecond)

    // Trigger parent rerender which provides a new inline onClose identity
    fireEvent.click(screen.getByTestId('rerender-btn'))

    // Focus MUST remain on the second control and NOT reset to the first control
    expect(document.activeElement).toBe(modalSecond)
    unmountModal()

    // 2. Drawer regression test
    function DrawerRerenderHarness() {
      const [, setDummy] = useState(0)
      return (
        <div>
          <button data-testid="drawer-rerender-btn" onClick={() => setDummy((c) => c + 1)}>
            重渲染父组件
          </button>
          <Drawer
            isOpen={true}
            onClose={() => {}}
            title="重渲染测试抽屉"
          >
            <input data-testid="drawer-first-control" placeholder="抽屉第一控件" />
            <input data-testid="drawer-second-control" placeholder="抽屉第二控件" />
          </Drawer>
        </div>
      )
    }

    render(<DrawerRerenderHarness />)
    const drawerSecond = screen.getByTestId('drawer-second-control')
    drawerSecond.focus()
    expect(document.activeElement).toBe(drawerSecond)

    fireEvent.click(screen.getByTestId('drawer-rerender-btn'))

    // Focus MUST remain on the second control
    expect(document.activeElement).toBe(drawerSecond)
  })

  it('renders Card with header and content', () => {
    render(
      <Card title="今日备课计划" subtitle="3项待办">
        <p>完成九年级综合复习讲义</p>
      </Card>
    )

    expect(screen.getByText('今日备课计划')).toBeInTheDocument()
    expect(screen.getByText('3项待办')).toBeInTheDocument()
    expect(screen.getByText('完成九年级综合复习讲义')).toBeInTheDocument()
  })

  it('renders Metric with truthful value and trend', () => {
    render(
      <Metric
        label="本周练习完成数"
        value={42}
        hint="来自真实学生作答记录"
      />
    )

    expect(screen.getByText('本周练习完成数')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('来自真实学生作答记录')).toBeInTheDocument()
  })

  it('renders EmptyState with action button', () => {
    const handleAction = vi.fn()
    render(
      <EmptyState
        title="暂无试卷"
        description="您可以点击下方按钮导入第一套教学测评试卷"
        actionLabel="导入试卷"
        onAction={handleAction}
      />
    )

    expect(screen.getByText('暂无试卷')).toBeInTheDocument()
    expect(screen.getByText('您可以点击下方按钮导入第一套教学测评试卷')).toBeInTheDocument()
    const actionBtn = screen.getByRole('button', { name: '导入试卷' })
    fireEvent.click(actionBtn)
    expect(handleAction).toHaveBeenCalled()
  })

  it('renders PageHeader with title and breadcrumbs', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="题库管理"
          description="管理与检索全学科教学题卡与试卷资产"
          breadcrumbs={[
            { label: '首页', to: '/' },
            { label: '题库管理' },
          ]}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: '题库管理' })).toBeInTheDocument()
    expect(screen.getByText('管理与检索全学科教学题卡与试卷资产')).toBeInTheDocument()
  })

  it('PAGEHEADER-SPA-01: click breadcrumb changes router location without native page reload', () => {
    function LocationDisplay() {
      const location = useLocation()
      return <div data-testid="current-pathname">{location.pathname}</div>
    }

    render(
      <MemoryRouter initialEntries={['/questions/edit/123']}>
        <PageHeader
          title="编辑题目"
          breadcrumbs={[
            { label: '题库列表', to: '/questions' },
            { label: '题目详情', to: '/questions/123' },
            { label: '编辑' },
          ]}
        />
        <LocationDisplay />
      </MemoryRouter>
    )

    expect(screen.getByTestId('current-pathname')).toHaveTextContent('/questions/edit/123')

    const breadcrumbLink = screen.getByRole('link', { name: '题库列表' })
    expect(breadcrumbLink).toHaveAttribute('href', '/questions')
    fireEvent.click(breadcrumbLink)

    expect(screen.getByTestId('current-pathname')).toHaveTextContent('/questions')
  })
})
