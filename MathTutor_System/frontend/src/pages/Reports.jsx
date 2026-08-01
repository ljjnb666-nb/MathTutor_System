import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, CalendarDays, FileText, GraduationCap, RefreshCw, Users } from 'lucide-react'
import { getStudents } from '../services/api'
import { EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'
import AfterClassReport from './AfterClassReport'
import LearningReport from './LearningReport'

const TABS = [
  { id: 'after-class', label: '课后报告', icon: FileText },
  { id: 'learning', label: '学习报告', icon: BarChart3 },
]

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'learning' ? 'learning' : 'after-class'
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [period, setPeriod] = useState('4w')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchStudents = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await getStudents()
      const list = Array.isArray(response?.data) ? response.data : []
      setStudents(list)
      setSelectedStudentId((prev) => prev || (list[0]?.id ? String(list[0].id) : ''))
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || '加载学生失败')
      setStudents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStudents()
  }, [])

  const selectedStudent = useMemo(
    () => students.find((item) => String(item.id) === String(selectedStudentId)) || null,
    [selectedStudentId, students]
  )

  const setTab = (id) => setSearchParams(id === 'after-class' ? {} : { tab: id })

  if (loading) {
    return (
      <PageShell>
        <LoadingState title="正在加载报告工作台" description="读取学生档案与报告筛选条件。" />
      </PageShell>
    )
  }

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="课后与学习报告"
        description="围绕学生、时间范围和报告类型组织课后反馈与学习总结，不伪造趋势或历史报告。"
        icon={FileText}
        meta={<StatusBadge tone="primary">{tab === 'learning' ? '综合学习报告' : '课后反馈报告'}</StatusBadge>}
        actions={(
          <button type="button" className="v2-btn-secondary" onClick={fetchStudents}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        )}
      />

      <section className="v2-report-filterbar">
        <label>
          <span>学生</span>
          <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
            {students.length === 0 ? <option value="">暂无学生</option> : students.map((student) => (
              <option key={student.id} value={student.id}>{student.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>时间范围</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="1w">近 1 周</option>
            <option value="4w">近 4 周</option>
            <option value="term">本学期</option>
          </select>
        </label>
        <div className="v2-report-tabs" role="tablist" aria-label="报告类型">
          {TABS.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <ErrorState title="报告工作台加载失败" description={error} onRetry={fetchStudents} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="学生档案" value={students.length} hint="来自学生 API" icon={Users} />
            <MetricCard label="当前学生" value={selectedStudent?.name || '-'} hint="用于生成报告抬头" icon={GraduationCap} tone="success" />
            <MetricCard label="报告周期" value={period === '1w' ? '近 1 周' : period === '4w' ? '近 4 周' : '本学期'} hint="仅作为前端筛选上下文" icon={CalendarDays} tone="warning" />
            <MetricCard label="真实历史报告" value="0" hint="当前无报告列表 API" icon={FileText} tone="danger" />
          </div>

          <div className="v2-report-layout">
            <div className="min-w-0 space-y-4">
              {students.length === 0 ? (
                <EmptyState icon={Users} title="暂无学生档案" description="添加学生后即可生成面向家长或学习规划的报告。" />
              ) : tab === 'after-class' ? (
                <AfterClassReport embedded studentNameHint={selectedStudent?.name || ''} reportPeriod={period} />
              ) : (
                <LearningReport embedded studentNameHint={selectedStudent?.name || ''} reportPeriod={period} />
              )}
            </div>

            <aside className="v2-report-side">
              <SectionCard title="报告列表" description="当前后端没有持久化报告列表接口。">
                <EmptyState icon={FileText} title="暂无真实报告记录" description="生成结果只在当前页面展示；没有可持久化列表时不展示虚假历史。" />
              </SectionCard>
              <SectionCard title="趋势区域" description="等待真实趋势或报告统计 API 接入。">
                <div className="v2-report-empty-chart">
                  <BarChart3 className="h-8 w-8" />
                  <p>暂无真实趋势数据</p>
                </div>
              </SectionCard>
              <SectionCard title="报告结构" description="根据当前报告类型显示真实可产出的内容块。">
                <div className="v2-report-outline">
                  {(tab === 'after-class'
                    ? ['课堂表现', '掌握情况', '关键词', '家长评语']
                    : ['已掌握', '待攻克', '预计课时', '学习建议']
                  ).map((item, index) => (
                    <div key={item}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{item}</strong>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </aside>
          </div>
        </>
      )}
    </PageShell>
  )
}
