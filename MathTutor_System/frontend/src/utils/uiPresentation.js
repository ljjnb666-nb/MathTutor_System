/**
 * UI 状态呈现唯一权威源（SSOT）。
 *
 * 原则：
 * - machine value（数据库 / API / URL / 内部状态）继续使用稳定英文值，本文件绝不修改它们；
 * - 只有 user-facing 呈现层转换为中文；
 * - 任何未登记的 machine value 一律回退到安全的中文占位（不得把原始值透出给用户）；
 * - 调试需要原始值时，由调用方在 development 环境自行 console.debug。
 */

const UNKNOWN_LABEL = '未知状态'

const STATUS_TABLES = {
  agentRun: {
    created: { label: '已创建', tone: 'neutral' },
    running: { label: '运行中', tone: 'warning' },
    needs_input: { label: '需要补充信息', tone: 'warning' },
    completed: { label: '已完成', tone: 'success' },
    failed: { label: '失败', tone: 'danger' },
  },
  agentArtifact: {
    draft: { label: '草稿待完善', tone: 'warning' },
    ready_for_confirmation: { label: '待确认保存', tone: 'warning' },
    saving: { label: '正在保存', tone: 'warning' },
    saved: { label: '已保存', tone: 'success' },
    cancelled: { label: '已取消', tone: 'neutral' },
  },
  agentAction: {
    pending_confirmation: { label: '等待确认', tone: 'warning' },
    executing: { label: '正在保存', tone: 'warning' },
    completed: { label: '保存完成', tone: 'success' },
    failed: { label: '保存失败', tone: 'danger' },
    cancelled: { label: '已取消', tone: 'neutral' },
  },
  agentIntent: {
    lesson_preparation: { label: '备课规划', tone: 'neutral' },
    review_plan: { label: '复习规划', tone: 'neutral' },
    practice_plan: { label: '练习规划', tone: 'neutral' },
    student_analysis: { label: '学情分析', tone: 'neutral' },
    exam_preparation_plan: { label: '备考规划', tone: 'neutral' },
    general_teaching: { label: '通用教学', tone: 'neutral' },
  },
  agentSafetyMode: {
    read_only: { label: '只读模式', tone: 'success' },
  },
  draftQuestionType: {
    choice: { label: '单选题', tone: 'neutral' },
    fill: { label: '填空题', tone: 'neutral' },
    solution: { label: '解答题', tone: 'neutral' },
    true_false: { label: '判断题', tone: 'neutral' },
  },
  draftDifficulty: {
    easy: { label: '简单', tone: 'neutral' },
    medium: { label: '中等', tone: 'neutral' },
    hard: { label: '较难', tone: 'neutral' },
    mixed: { label: '混合', tone: 'neutral' },
  },
  ragUpload: {
    pending: { label: '等待处理', tone: 'neutral' },
    processing: { label: '正在解析', tone: 'warning' },
    done: { label: '导入完成', tone: 'success' },
    failed: { label: '导入失败', tone: 'danger' },
  },
  mistake: {
    pending: { label: '待攻克', tone: 'warning' },
    mastered: { label: '已掌握', tone: 'success' },
  },
  order: {
    pending: { label: '待支付', tone: 'warning' },
    paid: { label: '已支付', tone: 'success' },
    failed: { label: '支付失败', tone: 'danger' },
  },
}

// 允许各域自定义未知值兜底文案；缺省统一为「未知状态」。
const UNKNOWN_FALLBACK_LABELS = {
  agentIntent: '教学规划',
  agentSafetyMode: '受限模式',
  draftQuestionType: '题目',
  draftDifficulty: '未设定',
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
  return { label: UNKNOWN_FALLBACK_LABELS[domain] || UNKNOWN_LABEL, tone: 'neutral' }
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

const PLAN_LABELS = {
  free: '免费版',
  basic: '基础版',
  pro: '专业版',
  admin: '管理员版',
}

export function getPlanPresentation(value) {
  const hit = value != null ? PLAN_LABELS[String(value)] : undefined
  return hit || '未知版本'
}

const AGENT_RUN_ERROR_MESSAGES = {
  intent_extraction_failed: '无法理解教学目标，请换个说法后重试',
  student_not_found: '未找到该学生，请确认学生信息后重试',
  plan_composition_failed: '生成教学计划失败，请稍后重试',
  plan_missing: '未能生成教学计划，请稍后重试',
  unsafe_tool: '计划包含未授权的操作，已停止执行',
  unsafe_plan: '计划未通过安全校验，已停止执行',
}

const AGENT_ACTION_ERROR_MESSAGES = {
  save_failed: '保存到题库失败，请稍后重试',
}

function containsCJK(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text || '')
}

/**
 * Agent 运行失败的中文呈现：优先按 error_code 映射；
 * 后端若已返回中文业务消息则原样保留；其余一律安全兜底。
 */
export function getAgentRunErrorPresentation(run) {
  const code = run?.error_code
  if (code && AGENT_RUN_ERROR_MESSAGES[code]) return AGENT_RUN_ERROR_MESSAGES[code]
  const message = (run?.error_message || '').trim()
  if (message && containsCJK(message)) return message
  return '运行失败，请稍后重试'
}

export function getAgentActionErrorPresentation(action) {
  const code = action?.error_code
  if (code && AGENT_ACTION_ERROR_MESSAGES[code]) return AGENT_ACTION_ERROR_MESSAGES[code]
  const message = (action?.error_message || '').trim()
  if (message && containsCJK(message)) return message
  return '操作失败，请稍后重试'
}

const WILL_NOT_MESSAGES = {
  'publish homework': '不会发布作业',
  'create exam': '不会创建考试',
  'send notifications': '不会发送通知',
  'charge payment': '不会发起扣费',
  'create PPTX': '不会生成 PPTX 课件',
}

/**
 * 确认弹窗 summary.will_not 的中文呈现。
 * 后端返回的是稳定英文短语；未登记的值一律返回 null（由调用方过滤，不展示）。
 */
export function getWillNotPresentation(value) {
  return WILL_NOT_MESSAGES[value] || null
}

const DRAFT_VALIDATION_MESSAGES = {
  question_count_mismatch: '题目数量与生成要求不一致',
  unsafe_safety_mode: '草稿安全标记异常，请重新生成',
  duplicate_client_question_id: '草稿内存在重复的题目编号，请重新生成',
  empty_stem: '存在题干为空的题目，请补充题干',
  stem_too_long: '题干过长，请精简后重试',
  invalid_question_type: '存在不支持的题型，请调整后重试',
  invalid_difficulty: '存在不支持的难度，请调整后重试',
  invalid_source_basis: '题目来源标记异常，请重新生成',
  unavailable_source_basis: '题目引用的素材不可用，请重新生成',
  invalid_score: '分值必须大于 0',
  missing_knowledge_points: '存在未填写知识点的题目',
  empty_answer: '存在答案为空的题目，请补充答案',
  empty_explanation: '存在解析为空的题目，请补充解析',
  unsafe_text: '题目内容包含不允许的文字，请修改后重试',
  invalid_choice_option_count: '选择题需要 2-6 个选项',
  duplicate_choice_options: '选择题选项不能重复',
  invalid_choice_answer: '选择题答案必须匹配某个选项',
  invalid_fill_answer: '填空题答案不明确，请补充完整',
  invalid_true_false_answer: '判断题答案无效',
  duplicate_stem: '存在重复题干的题目，请修改后重试',
}

export const DRAFT_VALIDATION_FALLBACK = '草稿校验未通过，请检查题目内容'

/**
 * 草稿校验错误项的中文呈现：按 item.code 映射；未知 code 一律安全兜底，不透出内部消息。
 */
export function getDraftValidationMessage(item) {
  if (!item || typeof item !== 'object') return DRAFT_VALIDATION_FALLBACK
  const code = typeof item.code === 'string' ? item.code : ''
  if (code && DRAFT_VALIDATION_MESSAGES[code]) return DRAFT_VALIDATION_MESSAGES[code]
  const message = typeof item.message === 'string' ? item.message.trim() : ''
  if (message && containsCJK(message)) return message
  return DRAFT_VALIDATION_FALLBACK
}

const TARGET_QUESTION_BANK_LABELS = {
  'current teacher private question bank': '当前教师私有题库',
}

/**
 * 确认弹窗保存目标的中文呈现：后端 target_label 已是中文则直接使用；
 * target_question_bank 是英文 machine 短语，按已知值映射，未知值安全兜底。
 */
export function getSaveTargetPresentation(summary) {
  const label = (summary?.target_label || '').trim()
  if (label && containsCJK(label)) return label
  const bank = (summary?.target_question_bank || '').trim()
  if (bank) {
    return TARGET_QUESTION_BANK_LABELS[bank] || '教师私有题库'
  }
  return '教师私有题库'
}

const CONFIG_SOURCE_LABELS = {
  server: '服务器配置',
}

export function getConfigSourcePresentation(value) {
  const hit = value != null ? CONFIG_SOURCE_LABELS[String(value)] : undefined
  return hit || '未知来源'
}

/**
 * 知识库文档就绪状态：由 document_id / chunk_count 派生的客户端状态（后端无对应 machine enum）。
 */
export function getRagDocumentStatePresentation(doc) {
  if (!doc?.document_id) return { label: '待迁移', tone: 'warning' }
  if ((doc?.chunk_count ?? 0) <= 0) return { label: '待向量化', tone: 'warning' }
  return { label: '已完成', tone: 'success' }
}
