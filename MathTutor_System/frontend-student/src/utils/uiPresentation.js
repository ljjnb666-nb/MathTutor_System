/**
 * 学生端 UI 状态呈现权威源（与教师端 frontend/src/utils/uiPresentation.js 同语义）。
 *
 * machine value（API / DB / 内部状态）保持稳定英文；
 * 只有 user-facing 呈现转换为中文；未登记的值一律安全兜底，不透出原始值。
 */

const UNKNOWN_LABEL = '未知状态'

const STATUS_TABLES = {
  mistake: {
    pending: { label: '待攻克', tone: 'warning' },
    mastered: { label: '已掌握', tone: 'success' },
  },
  examState: {
    ungraded: { label: '去做题', tone: 'warning' },
    graded: { label: '已完成', tone: 'success' },
  },
}

export const UNKNOWN_STATUS_PRESENTATION = Object.freeze({ label: UNKNOWN_LABEL, tone: 'neutral' })

/**
 * 按域查询 machine 状态的中文呈现。
 * @param {keyof typeof STATUS_TABLES} domain 状态域（必须显式声明，避免同值异义）
 * @param {string} value 后端 machine value
 * @returns {{ label: string, tone: string }}
 */
export function getStatusPresentation(domain, value) {
  const table = STATUS_TABLES[domain]
  if (!table) return { ...UNKNOWN_STATUS_PRESENTATION }
  const hit = value != null ? table[String(value)] : undefined
  if (hit) return { ...hit }
  return { ...UNKNOWN_STATUS_PRESENTATION }
}

const ROLE_LABELS = {
  admin: '管理员',
  teacher: '教师',
  student: '学生',
}

export function getRolePresentation(value) {
  const hit = value != null ? ROLE_LABELS[String(value)] : undefined
  return hit || '未知角色'
}

/**
 * 试卷批改状态由 graded_at 派生（后端无独立 status 字段）：
 * graded_at 非空 → 已批改。
 */
export function getExamStatePresentation(gradedAt) {
  return getStatusPresentation('examState', gradedAt ? 'graded' : 'ungraded')
}
