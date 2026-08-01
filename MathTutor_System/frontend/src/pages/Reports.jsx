import { useSearchParams } from 'react-router-dom'
import { FileText, BarChart3 } from 'lucide-react'
import AfterClassReport from './AfterClassReport'
import LearningReport from './LearningReport'

const TABS = [
  { id: 'after-class', label: '课后报告', icon: FileText },
  { id: 'learning', label: '学习报告', icon: BarChart3 },
]

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'learning' ? 'learning' : 'after-class'

  const setTab = (id) => {
    setSearchParams(id === 'after-class' ? {} : { tab: id })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 animate-fade-in-up">
      <header className="rounded-3xl p-6 sm:p-8 shadow-sm space-y-5" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shrink-0" style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
            <FileText className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>课后与学情可视化报告</h1>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)' }}>
                REPORTS STUDIO
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              自动生成面向家长的课后评语反馈卡，或导出包含掌握度与预估课时的学情报告
            </p>
          </div>
        </div>

        <div className="flex rounded-2xl p-1" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black transition-all"
              style={
                tab === t.id
                  ? { backgroundColor: 'var(--color-bg-card)', color: 'var(--color-primary-600)', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
                  : { color: 'var(--color-text-secondary)' }
              }
              onMouseEnter={(e) => {
                if (tab !== t.id) {
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t.id) {
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
            >
              <t.icon className="h-4 w-4 shrink-0" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-6">
        {tab === 'after-class' ? <AfterClassReport embedded /> : <LearningReport embedded />}
      </div>
    </div>
  )
}
