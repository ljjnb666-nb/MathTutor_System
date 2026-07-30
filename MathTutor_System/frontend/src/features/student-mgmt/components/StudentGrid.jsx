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
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <p className="mt-3 text-sm">加载中…</p>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 shadow-sm">
        <Users className="h-14 w-14 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-500">暂无学生</p>
        <p className="mt-1 text-xs text-gray-400">
          {searchTerm.trim() ? '试试调整搜索条件' : '点击“添加学生”录入'}
        </p>
        {searchTerm.trim() && (
          <button type="button" onClick={onSearchClear} className="mt-3 text-sm text-blue-600 hover:underline">
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
            className={`group relative rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
              isCurrent ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'
            }`}
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
                    <p className="truncate font-semibold text-gray-800">{student.name}</p>
                    {isCurrent && (
                      <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                        当前
                      </span>
                    )}
                  </div>
                  <p className="flex items-center gap-1 text-xs text-gray-500">
                    <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                    {student.grade} / {student.class_name}
                  </p>
                </div>
              </div>
              <ScoreBadge score={student.performance_score} />
            </div>

            <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs text-gray-600">
              <li className="flex items-center gap-2">
                <BookMarked className="h-3.5 w-3.5 text-amber-500" />
                待攻克错题 <span className="font-medium text-gray-800">{stats.pending_mistake_count}</span>
              </li>
              <li className="flex items-center gap-2">
                <CalendarCheck className="h-3.5 w-3.5 text-blue-500" />
                今日待复习 <span className="font-medium text-gray-800">{stats.today_review_count}</span>
              </li>
              <li className="flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-red-500" />
                弱项知识点 <span className="font-medium text-gray-800">{stats.weak_point_count}</span>
              </li>
            </ul>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSelectAndGo(student.id, '/knowledge-graph')}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <GitBranch className="h-3.5 w-3.5" />
                学情图谱
              </button>
              <button
                type="button"
                onClick={() => onSelectAndGo(student.id, '/mistake-book')}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <BookMarked className="h-3.5 w-3.5" />
                错题本
              </button>
              <button
                type="button"
                onClick={() => onSelectAndGo(student.id, '/')}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
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
                  <span key={index} className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {tag}
                  </span>
                ))}
                {student.tags.length > 3 && <span className="text-xs text-gray-400">+{student.tags.length - 3}</span>}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onDownloadReport(student)}
                disabled={reportDownloadingId === student.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                title="下载学习报告"
              >
                {reportDownloadingId === student.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>PDF</span>}
                <span>下载学习报告</span>
              </button>
              <button
                type="button"
                onClick={() => onEdit(student)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50"
                title="编辑"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(student)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
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
