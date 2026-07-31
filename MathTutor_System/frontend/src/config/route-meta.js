/**
 * 路由元数据配置
 *
 * 定义每个路由的布局模式和页面标题
 *
 * layoutMode:
 * - 'default': 标准布局（TopHeader + 可滚动内容）- Dashboard、题库、报告等
 * - 'workspace': 工作区布局（固定高度、无双滚动条）- 智能出题、AI对话、AI教师助手
 * - 'fullCanvas': 全画布布局（不限制宽度）- Magic PPT、学情图谱
 */

export const ROUTE_META = [
  // 首页
  { path: '/', layoutMode: 'default', title: '首页' },

  // 内容与工具 - workspace 模式
  { path: '/smart-gen', layoutMode: 'workspace', title: '智能出题' },
  { path: '/chat', layoutMode: 'workspace', title: 'AI 对话' },
  { path: '/teacher-agent', layoutMode: 'workspace', title: 'AI 教师助手' },

  // 内容与工具 - default 模式
  { path: '/question-bank', layoutMode: 'default', title: '题库管理' },
  { path: '/knowledge-base', layoutMode: 'default', title: '知识库管理' },
  { path: '/exams/import', layoutMode: 'default', title: '导入试卷' },

  // 内容与工具 - fullCanvas 模式
  { path: '/ppt', layoutMode: 'fullCanvas', title: 'Magic PPT' },

  // 教学与学情 - default 模式
  { path: '/schedule', layoutMode: 'default', title: '排课' },
  { path: '/homework-progress', layoutMode: 'default', title: '学生做题情况' },
  { path: '/mistake-book', layoutMode: 'default', title: '错题本' },
  { path: '/reports', layoutMode: 'default', title: '课后与学习报告' },
  { path: '/after-class-report', layoutMode: 'default', title: '课后报告' },
  { path: '/learning-report', layoutMode: 'default', title: '学习报告' },

  // 教学与学情 - fullCanvas 模式
  { path: '/knowledge-graph', layoutMode: 'fullCanvas', title: '学情图谱' },

  // 试卷管理 - default 模式（动态路由优先级：更具体的在前）
  { path: '/exams/:id', layoutMode: 'default', title: '试卷详情' },
  { path: '/exams', layoutMode: 'default', title: '我的试卷' },

  // 系统管理 - default 模式
  { path: '/student-mgmt', layoutMode: 'default', title: '学生管理与总览' },
  { path: '/pricing', layoutMode: 'default', title: '套餐与定价' },
  { path: '/admin-users', layoutMode: 'default', title: '用户管理' },
  { path: '/settings', layoutMode: 'default', title: '设置' },
]

/**
 * 匹配路由元数据
 * 支持精确匹配和动态路由参数匹配
 *
 * @param {string} pathname - 当前路径
 * @returns {object|null} 路由元数据或 null
 */
export function matchRouteMeta(pathname) {
  // 1. 优先精确匹配
  const exactMatch = ROUTE_META.find(meta => meta.path === pathname)
  if (exactMatch) return exactMatch

  // 2. 动态路由匹配（如 /exams/:id）
  for (const meta of ROUTE_META) {
    if (!meta.path.includes(':')) continue

    // 将路由模式转换为正则表达式
    // /exams/:id -> /^\/exams\/[^\/]+$/
    const pattern = meta.path
      .replace(/\//g, '\\/')       // 转义斜杠
      .replace(/:[^\/]+/g, '[^/]+') // :id -> [^/]+

    const regex = new RegExp(`^${pattern}$`)
    if (regex.test(pathname)) {
      return meta
    }
  }

  // 3. 找不到匹配，返回默认值
  return null
}

/**
 * 获取路由布局模式
 *
 * @param {string} pathname - 当前路径
 * @returns {'default'|'workspace'|'fullCanvas'} 布局模式
 */
export function getLayoutMode(pathname) {
  const meta = matchRouteMeta(pathname)
  return meta?.layoutMode || 'default'
}

/**
 * 获取页面标题
 *
 * @param {string} pathname - 当前路径
 * @returns {string} 页面标题
 */
export function getPageTitle(pathname) {
  const meta = matchRouteMeta(pathname)
  return meta?.title || 'MathTutor'
}
