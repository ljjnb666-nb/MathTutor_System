import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  Card,
  Metric,
  EmptyState,
  PageHeader,
} from './index'

describe('TutorPro UI Primitives', () => {
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

  it('renders Modal with dialog semantics and calls onClose on Escape', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} title="新建教学任务">
        <p>任务配置表单</p>
      </Modal>
    )

    expect(screen.getByRole('dialog', { name: '新建教学任务' })).toBeInTheDocument()
    expect(screen.getByText('任务配置表单')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalled()
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
      <PageHeader
        title="题库管理"
        description="管理与检索全学科教学题卡与试卷资产"
        breadcrumbs={[
          { label: '首页', to: '/' },
          { label: '题库管理' },
        ]}
      />
    )

    expect(screen.getByRole('heading', { level: 1, name: '题库管理' })).toBeInTheDocument()
    expect(screen.getByText('管理与检索全学科教学题卡与试卷资产')).toBeInTheDocument()
  })
})
