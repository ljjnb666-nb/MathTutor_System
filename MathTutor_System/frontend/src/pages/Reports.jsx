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
    <div className="min-h-screen bg-gray-50/60">
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4 sm:py-5">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900">课后与学习报告</h1>
              <p className="mt-0.5 text-xs sm:text-sm text-gray-500">
                生成发给家长的课后评语，或整理今日掌握 / 待攻克 / 预计课时的可视化学习报告
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-1 sm:gap-2 rounded-xl border border-gray-200 bg-gray-50/80 p-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-lg py-2.5 text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
                  tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <t.icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
        {tab === 'after-class' ? <AfterClassReport embedded /> : <LearningReport embedded />}
      </div>
    </div>
  )
}
