import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookOpen } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState, MetricCard, ResponsiveTable, SearchInput, StatusBadge } from './UiV2'

describe('UiV2 shared components', () => {
  it('renders loading, empty, error, metric, and status states', () => {
    render(
      <div>
        <LoadingState title="加载中" description="读取真实接口" />
        <EmptyState icon={BookOpen} title="暂无题目" description="调整筛选后重试" />
        <ErrorState title="加载失败" description="网络错误" />
        <MetricCard label="题库总量" value="12" hint="来自 API" icon={BookOpen} />
        <StatusBadge tone="success">已完成</StatusBadge>
      </div>
    )

    expect(screen.getByText('加载中')).toBeInTheDocument()
    expect(screen.getByText('暂无题目')).toBeInTheDocument()
    expect(screen.getByText('加载失败')).toBeInTheDocument()
    expect(screen.getByText('题库总量')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toBeInTheDocument()
  })

  it('exposes a labelled search input and updates value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchInput value="" onChange={onChange} label="搜索学生" placeholder="搜索姓名" />)

    await user.type(screen.getByLabelText('搜索学生'), '张')
    expect(onChange).toHaveBeenCalled()
  })

  it('renders responsive table rows and mobile cards from the same data', () => {
    render(
      <ResponsiveTable
        columns={[
          { key: 'name', title: '姓名' },
          { key: 'status', title: '状态', render: (row) => <StatusBadge>{row.status}</StatusBadge> },
        ]}
        rows={[{ id: 1, name: '张同学', status: '正常' }]}
        renderMobile={(row) => <span>{row.name}</span>}
      />
    )

    expect(screen.getAllByText('张同学')).toHaveLength(2)
    expect(screen.getByText('状态')).toBeInTheDocument()
  })
})
