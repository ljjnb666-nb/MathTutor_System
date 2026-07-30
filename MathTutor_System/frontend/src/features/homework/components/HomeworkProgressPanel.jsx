import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Filter,
  Loader2,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react'

import { formatDate, formatDateShort } from '../utils/homeworkUtils'

export default function HomeworkProgressPanel({
  assignedExams,
  currentPage,
  deletingExamId,
  expandedGroups,
  filtered,
  filterStatus,
  filterStudent,
  groupedByExam,
  hasFilters,
  loading,
  onClearFilters,
  onDeleteExam,
  onFilterStatusChange,
  onFilterStudentChange,
  onPageChange,
  onRefresh,
  onSortByChange,
  onToggleGroup,
  onToggleViewMode,
  paginatedRows,
  questionRows,
  sortBy,
  stats,
  studentNames,
  totalPages,
  viewMode,
}) {
  return (
    <>
      {assignedExams.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">总题数</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">已提交</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{stats.submitted}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">答对</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{stats.correct}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">未提交</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{stats.pending}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="按学生姓名筛选"
            value={filterStudent}
            onChange={(e) => onFilterStudentChange(e.target.value)}
            className="h-9 w-44 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 sm:w-52"
          />
        </div>
        {studentNames.length > 0 && studentNames.length <= 8 && (
          <div className="flex flex-wrap gap-1.5">
            {studentNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onFilterStudentChange(filterStudent === name ? '' : name)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  filterStudent === name ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <select
          value={filterStatus}
          onChange={(e) => onFilterStatusChange(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">全部状态</option>
          <option value="correct">答对</option>
          <option value="wrong">答错</option>
          <option value="pending">未提交</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="time">按布置时间</option>
          <option value="student">按学生</option>
          <option value="status">按状态</option>
        </select>
        <button
          type="button"
          onClick={onToggleViewMode}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {viewMode === 'table' ? '按作业分组' : '平铺列表'}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <X className="h-3.5 w-3.5" />
            清空筛选
          </button>
        )}
        <span className="text-sm text-gray-500">
          共 {filtered.length} 道题
          {questionRows.length !== filtered.length && `（筛选自 ${questionRows.length} 道）`}
        </span>
      </div>

      {assignedExams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center shadow-sm">
          <ClipboardCheck className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-gray-500">暂无布置给学生的题目</p>
          <p className="mt-1 text-xs text-gray-400">在“作业管理”中组卷并布置后，这里会展示作答情况。</p>
          <Link
            to="/smart-gen"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            去智能出题
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center shadow-sm">
          <Filter className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">没有符合筛选条件的结果</p>
          <button type="button" onClick={onClearFilters} className="mt-3 text-sm text-blue-600 hover:underline">
            清空筛选
          </button>
        </div>
      ) : viewMode === 'group' ? (
        <div className="space-y-2">
          {groupedByExam.map((group) => {
            const key = `${group.examId}-${group.student_name}`
            const expanded = expandedGroups.has(key)
            const correctCount = group.rows.filter((row) => row.is_correct).length
            const totalCount = group.rows.length
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => onToggleGroup(key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-800">{group.examTitle} / {group.student_name}</p>
                    <p className="text-xs text-gray-500">
                      {totalCount} 题
                      {group.submitted ? ` / 已提交 ${correctCount}/${totalCount} 正确 / ${formatDateShort(group.graded_at)}` : ' / 未提交'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      group.submitted ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {group.submitted ? '已提交' : '未提交'}
                  </span>
                  <Link
                    to={`/exams/${group.examId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-sm text-blue-600 hover:text-blue-700"
                  >
                    查看
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteExam(group.examId, `${group.examTitle} / ${group.student_name}`)
                    }}
                    disabled={deletingExamId === group.examId}
                    className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="删除该作业"
                    aria-label="删除"
                  >
                    {deletingExamId === group.examId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </button>
                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    <ul className="divide-y divide-gray-100">
                      {group.rows.map((row) => (
                        <li key={row.key} className="flex items-center gap-4 px-4 py-2.5 pl-12">
                          <span className="w-8 shrink-0 text-xs text-gray-500">{row.questionIndex}/{row.totalQuestions}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{row.contentSnippet}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              !row.submitted
                                ? 'bg-amber-100 text-amber-800'
                                : row.is_correct
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {!row.submitted ? '未提交' : row.is_correct ? '对' : '错'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-700">学生</th>
                    <th className="px-4 py-3 font-medium text-gray-700">题目</th>
                    <th className="px-4 py-3 font-medium text-gray-700">所属作业</th>
                    <th className="px-4 py-3 font-medium text-gray-700">题号</th>
                    <th className="px-4 py-3 font-medium text-gray-700">对错</th>
                    <th className="px-4 py-3 font-medium text-gray-700">提交时间</th>
                    <th className="px-4 py-3 font-medium text-gray-700">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRows.map((row) => (
                    <tr key={row.key} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-medium text-gray-800">{row.student_name}</td>
                      <td className="max-w-[200px] px-4 py-3 text-gray-700 sm:max-w-[260px]">
                        <span className="line-clamp-2" title={row.contentSnippet}>{row.contentSnippet}</span>
                      </td>
                      <td className="max-w-[120px] px-4 py-3 text-gray-600">
                        <span className="line-clamp-1" title={row.examTitle}>{row.examTitle}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{row.questionIndex}/{row.totalQuestions}</td>
                      <td className="px-4 py-3">
                        {!row.submitted ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">未提交</span>
                        ) : row.is_correct ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">对</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">错</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">{row.graded_at ? formatDate(row.graded_at) : '--'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link to={`/exams/${row.examId}`} className="text-blue-600 hover:text-blue-700">查看</Link>
                          <button
                            type="button"
                            onClick={() => onDeleteExam(row.examId, row.examTitle)}
                            disabled={deletingExamId === row.examId}
                            className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                            title="删除该作业"
                            aria-label="删除"
                          >
                            {deletingExamId === row.examId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {!loading && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-sm text-gray-500">第 {currentPage} / {totalPages} 页</span>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
