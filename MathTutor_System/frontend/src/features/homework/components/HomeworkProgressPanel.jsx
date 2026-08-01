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
          <div className="rounded-xl p-4 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>总题数</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.total}</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>已提交</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{stats.submitted}</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>答对</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{stats.correct}</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>未提交</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{stats.pending}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="按学生姓名筛选"
            value={filterStudent}
            onChange={(e) => onFilterStudentChange(e.target.value)}
            className="h-9 w-44 rounded-lg pl-9 pr-3 text-sm transition-all sm:w-52"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary-500)'
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-primary-500)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              e.currentTarget.style.boxShadow = ''
            }}
          />
        </div>
        {studentNames.length > 0 && studentNames.length <= 8 && (
          <div className="flex flex-wrap gap-1.5">
            {studentNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onFilterStudentChange(filterStudent === name ? '' : name)}
                className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                style={
                  filterStudent === name
                    ? { backgroundColor: 'var(--color-primary-600)', color: 'white' }
                    : { backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-secondary)' }
                }
                onMouseEnter={(e) => {
                  if (filterStudent !== name) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (filterStudent !== name) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                  }
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <select
          value={filterStatus}
          onChange={(e) => onFilterStatusChange(e.target.value)}
          className="h-9 rounded-lg px-3 text-sm transition-all"
          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary-500)'
            e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-primary-500)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
            e.currentTarget.style.boxShadow = ''
          }}
        >
          <option value="all">全部状态</option>
          <option value="correct">答对</option>
          <option value="wrong">答错</option>
          <option value="pending">未提交</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value)}
          className="h-9 rounded-lg px-3 text-sm transition-all"
          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary-500)'
            e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-primary-500)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
            e.currentTarget.style.boxShadow = ''
          }}
        >
          <option value="time">按布置时间</option>
          <option value="student">按学生</option>
          <option value="status">按状态</option>
        </select>
        <button
          type="button"
          onClick={onToggleViewMode}
          className="h-9 rounded-lg px-3 text-sm font-medium transition-colors"
          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
          }}
        >
          {viewMode === 'table' ? '按作业分组' : '平铺列表'}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
            }
          }}
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
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          共 {filtered.length} 道题
          {questionRows.length !== filtered.length && `（筛选自 ${questionRows.length} 道）`}
        </span>
      </div>

      {assignedExams.length === 0 ? (
        <div className=”rounded-xl border border-dashed py-16 text-center shadow-sm” style={{ borderColor: 'var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
          <ClipboardCheck className=”mx-auto h-12 w-12” style={{ color: 'var(--color-border-strong)' }} />
          <p className=”mt-4 text-sm font-medium” style={{ color: 'var(--color-text-muted)' }}>暂无布置给学生的题目</p>
          <p className=”mt-1 text-xs” style={{ color: 'var(--color-text-muted)' }}>在”作业管理”中组卷并布置后，这里会展示作答情况。</p>
          <Link
            to=”/smart-gen”
            className=”mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition-all”
            style={{ background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
          >
            去智能出题
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className=”rounded-xl py-12 text-center shadow-sm” style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
          <Filter className=”mx-auto h-10 w-10” style={{ color: 'var(--color-border-strong)' }} />
          <p className=”mt-3 text-sm” style={{ color: 'var(--color-text-muted)' }}>没有符合筛选条件的结果</p>
          <button type=”button” onClick={onClearFilters} className=”mt-3 text-sm hover:underline” style={{ color: 'var(--color-primary-600)' }}>
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
              <div key={key} className="overflow-hidden rounded-xl shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
                <button
                  type="button"
                  onClick={() => onToggleGroup(key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" style={{ color: 'var(--color-text-primary)' }}>{group.examTitle} / {group.student_name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
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
                    className="shrink-0 text-sm hover:underline"
                    style={{ color: 'var(--color-primary-600)' }}
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
                    className="shrink-0 rounded p-1.5 text-red-600 transition-colors disabled:opacity-50"
                    onMouseEnter={(e) => {
                      if (deletingExamId !== group.examId) {
                        e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #dc2626 10%, transparent)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                    title="删除该作业"
                    aria-label="删除"
                  >
                    {deletingExamId === group.examId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </button>
                {expanded && (
                  <div style={{ borderTop: '1px solid var(--color-border-subtle)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 50%, transparent)' }}>
                    <ul style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                      {group.rows.map((row) => (
                        <li key={row.key} className="flex items-center gap-4 px-4 py-2.5 pl-12" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                          <span className="w-8 shrink-0 text-xs" style={{ color: 'var(--color-text-muted)' }}>{row.questionIndex}/{row.totalQuestions}</span>
                          <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--color-text-primary)' }}>{row.contentSnippet}</span>
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
          <div className="overflow-hidden rounded-xl shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-bg-panel)' }}>
                  <tr>
                    <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>学生</th>
                    <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>题目</th>
                    <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>所属作业</th>
                    <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>题号</th>
                    <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>对错</th>
                    <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>提交时间</th>
                    <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => (
                    <tr
                      key={row.key}
                      className="transition-colors"
                      style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>{row.student_name}</td>
                      <td className="max-w-[200px] px-4 py-3 sm:max-w-[260px]" style={{ color: 'var(--color-text-primary)' }}>
                        <span className="line-clamp-2" title={row.contentSnippet}>{row.contentSnippet}</span>
                      </td>
                      <td className="max-w-[120px] px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="line-clamp-1" title={row.examTitle}>{row.examTitle}</span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>{row.questionIndex}/{row.totalQuestions}</td>
                      <td className="px-4 py-3">
                        {!row.submitted ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">未提交</span>
                        ) : row.is_correct ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">对</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">错</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>{row.graded_at ? formatDate(row.graded_at) : '--'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link to={`/exams/${row.examId}`} className="hover:underline" style={{ color: 'var(--color-primary-600)' }}>查看</Link>
                          <button
                            type="button"
                            onClick={() => onDeleteExam(row.examId, row.examTitle)}
                            disabled={deletingExamId === row.examId}
                            className="text-red-600 transition-opacity disabled:opacity-50"
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
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  if (currentPage > 1) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentPage > 1) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
                  }
                }}
              >
                上一页
              </button>
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>第 {currentPage} / {totalPages} 页</span>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  if (currentPage < totalPages) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentPage < totalPages) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
                  }
                }}
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
