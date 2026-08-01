import {
  BookMarked,
  CalendarCheck,
  Edit,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  LogIn,
  Trash2,
  Users,
} from 'lucide-react'

import ScoreBadge from './ScoreBadge'
import { getAvatarStyle, getInitial, getStudentAppUrl } from '../utils/studentMgmtUtils'

export default function StudentGrid({
  currentStudentId,
  filtered,
  loading,
  onDelete,
  onDownloadReport,
  onEdit,
  onSearchClear,
  onSelectAndGo,
  overviewMap,
  reportDownloadingId,
  searchTerm,
}) {
  if (loading) {
    return (
      <div className=”flex flex-col items-center justify-center py-16” style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className=”h-10 w-10 animate-spin” style={{ color: 'var(--color-primary-500)' }} />
        <p className=”mt-3 text-sm”>加载中…</p>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className=”flex flex-col items-center justify-center rounded-xl py-16 shadow-sm” style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
        <Users className=”h-14 w-14” style={{ color: 'var(--color-border-strong)' }} />
        <p className=”mt-3 text-sm font-medium” style={{ color: 'var(--color-text-muted)' }}>暂无学生</p>
        <p className=”mt-1 text-xs” style={{ color: 'var(--color-text-muted)' }}>
          {searchTerm.trim() ? '试试调整搜索条件' : '点击”添加学生”录入'}
        </p>
        {searchTerm.trim() && (
          <button type=”button” onClick={onSearchClear} className=”mt-3 text-sm hover:underline” style={{ color: 'var(--color-primary-600)' }}>
            清空搜索
          </button>
        )}
      </div>
    )
  }

  const studentAppUrl = getStudentAppUrl()

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filtered.map((student) => {
        const stats = overviewMap[student.id] || {
          pending_mistake_count: 0,
          today_review_count: 0,
          weak_point_count: 0,
        }
        const isCurrent = currentStudentId === student.id

        return (
          <div
            key={student.id}
            className="group relative rounded-xl p-4 shadow-sm transition-shadow"
            style={
              isCurrent
                ? { border: '1px solid color-mix(in srgb, #a78bfa 50%, transparent)', backgroundColor: 'var(--color-bg-card)', boxShadow: '0 0 0 1px color-mix(in srgb, #a78bfa 20%, transparent)' }
                : { border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}
            onMouseLeave={(e) => {
              if (isCurrent) {
                e.currentTarget.style.boxShadow = '0 0 0 1px color-mix(in srgb, #a78bfa 20%, transparent)'
              } else {
                e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${getAvatarStyle(student.name)}`}
                >
                  {getInitial(student.name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold" style={{ color: 'var(--color-text-primary)' }}>{student.name}</p>
                    {isCurrent && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: 'color-mix(in srgb, #a78bfa 10%, transparent)', color: '#a78bfa' }}>
                        当前
                      </span>
                    )}
                  </div>
                  <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                    {student.grade} / {student.class_name}
                  </p>
                </div>
              </div>
              <ScoreBadge score={student.performance_score} />
            </div>

            <ul className="mt-3 space-y-1.5 pt-3 text-xs" style={{ borderTop: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
              <li className="flex items-center gap-2">
                <BookMarked className="h-3.5 w-3.5 text-amber-500" />
                待攻克错题 <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{stats.pending_mistake_count}</span>
              </li>
              <li className="flex items-center gap-2">
                <CalendarCheck className="h-3.5 w-3.5" style={{ color: 'var(--color-primary-500)' }} />
                今日待复习 <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{stats.today_review_count}</span>
              </li>
              <li className="flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-red-500" />
                弱项知识点 <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{stats.weak_point_count}</span>
              </li>
            </ul>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSelectAndGo(student.id, '/knowledge-graph')}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
                }}
              >
                <GitBranch className="h-3.5 w-3.5" />
                学情图谱
              </button>
              <button
                type="button"
                onClick={() => onSelectAndGo(student.id, '/mistake-book')}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
                }}
              >
                <BookMarked className="h-3.5 w-3.5" />
                错题本
              </button>
              <button
                type="button"
                onClick={() => onSelectAndGo(student.id, '/')}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
                }}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                首页
              </button>
            </div>

            {student.login_code && (
              <div className="mt-3 rounded-lg border border-green-100 bg-green-50/80 px-2.5 py-2 text-xs text-green-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <LogIn className="h-3.5 w-3.5" />
                  学生端登录码：<code className="rounded bg-green-100 px-1 font-mono">{student.login_code}</code>
                </div>
                <p className="mt-1 text-green-700">
                  学生端入口：
                  <a href={studentAppUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {studentAppUrl}
                  </a>
                </p>
              </div>
            )}

            {Array.isArray(student.tags) && student.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {student.tags.slice(0, 3).map((tag, index) => (
                  <span key={index} className="inline-flex rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-600)' }}>
                    {tag}
                  </span>
                ))}
                {student.tags.length > 3 && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>+{student.tags.length - 3}</span>}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 pt-3 opacity-0 transition-opacity group-hover:opacity-100" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <button
                type="button"
                onClick={() => onDownloadReport(student)}
                disabled={reportDownloadingId === student.id}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))' }}
                onMouseEnter={(e) => {
                  if (reportDownloadingId !== student.id) {
                    e.currentTarget.style.opacity = '0.9'
                  }
                }}
                onMouseLeave={(e) => {
                  if (reportDownloadingId !== student.id) {
                    e.currentTarget.style.opacity = '1'
                  }
                }}
                title="下载学习报告"
              >
                {reportDownloadingId === student.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>PDF</span>}
                <span>下载学习报告</span>
              </button>
              <button
                type="button"
                onClick={() => onEdit(student)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--color-primary-600)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
                title="编辑"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(student)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition-colors"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #dc2626 10%, transparent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
                title="删除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
