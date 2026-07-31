import {
  LayoutDashboard,
  Home,
  BookOpen,
  Users,
  Settings,
  FileStack,
  FileUp,
  Presentation,
  BookMarked,
  GitBranch,
  Database,
  MessageCircle,
  FileText,
  Calendar,
  ClipboardCheck,
  Sparkles,
  CreditCard,
  UserCog,
} from 'lucide-react'

/**
 * 统一导航配置
 * 用于 Sidebar 和 TopHeader 的导航项
 */

export const NAV_GROUPS = [
  {
    title: null,
    items: [
      {
        to: '/',
        icon: LayoutDashboard,
        label: '首页',
        end: true,
        keywords: ['home', 'dashboard', '仪表盘'],
      },
    ],
  },
  {
    title: '出题与内容',
    items: [
      {
        to: '/smart-gen',
        icon: Home,
        label: '智能出题',
        keywords: ['ai', 'generate', '生成'],
      },
      {
        to: '/chat',
        icon: MessageCircle,
        label: 'AI 对话',
        keywords: ['chat', 'conversation', '聊天'],
      },
      {
        to: '/teacher-agent',
        icon: Sparkles,
        label: 'AI 教师助手',
        keywords: ['agent', 'assistant', '助手', '助理'],
      },
      {
        to: '/question-bank',
        icon: BookOpen,
        label: '题库管理',
        keywords: ['question', 'bank', '题目'],
      },
      {
        to: '/knowledge-base',
        icon: Database,
        label: '知识库管理',
        keywords: ['knowledge', 'base', '知识'],
      },
      {
        to: '/exams/import',
        icon: FileUp,
        label: '导入试卷',
        keywords: ['import', 'upload', '上传'],
      },
      {
        to: '/ppt',
        icon: Presentation,
        label: 'Magic PPT',
        keywords: ['ppt', 'presentation', '幻灯片', '课件'],
      },
    ],
  },
  {
    title: '学情与练习',
    items: [
      {
        to: '/schedule',
        icon: Calendar,
        label: '排课',
        keywords: ['schedule', 'calendar', '日程', '课表'],
      },
      {
        to: '/homework-progress',
        icon: ClipboardCheck,
        label: '学生做题情况',
        keywords: ['homework', 'progress', '作业', '进度'],
      },
      {
        to: '/mistake-book',
        icon: BookMarked,
        label: '错题本',
        keywords: ['mistake', 'error', '错题', '错误'],
      },
      {
        to: '/knowledge-graph',
        icon: GitBranch,
        label: '学情图谱',
        keywords: ['graph', 'knowledge', '图谱', '知识'],
      },
      {
        to: '/reports',
        icon: FileText,
        label: '课后与学习报告',
        keywords: ['report', 'analysis', '报告', '分析'],
      },
      {
        to: '/exams',
        icon: FileStack,
        label: '我的试卷',
        end: true,
        keywords: ['exam', 'paper', '试卷', '考试'],
      },
    ],
  },
  {
    title: '系统管理',
    items: [
      {
        to: '/student-mgmt',
        icon: Users,
        label: '学生管理与总览',
        keywords: ['student', 'management', '学生', '管理'],
      },
      {
        to: '/pricing',
        icon: CreditCard,
        label: '套餐与定价',
        keywords: ['pricing', 'plan', '套餐', '定价', '价格'],
      },
      {
        to: '/admin-users',
        icon: UserCog,
        label: '用户管理',
        end: true,
        adminOnly: true,
        keywords: ['user', 'admin', '用户', '管理员'],
      },
    ],
  },
]

/**
 * 获取扁平化的所有导航项
 * @param {boolean} includeAdminOnly - 是否包含仅管理员可见的项
 * @returns {Array} 导航项数组
 */
export function getAllNavItems(includeAdminOnly = false) {
  return NAV_GROUPS.flatMap((group) => group.items).filter((item) =>
    includeAdminOnly ? true : !item.adminOnly
  )
}

/**
 * 获取过滤后的导航组（根据用户角色）
 * @param {string} userRole - 用户角色 ('admin' | 'teacher')
 * @returns {Array} 过滤后的导航组
 */
export function getVisibleNavGroups(userRole) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || userRole === 'admin'),
  })).filter((group) => group.items.length > 0)
}

/**
 * 获取可搜索的功能列表
 * @param {string} userRole - 用户角色
 * @returns {Array} 可搜索的功能列表
 */
export function getSearchableFeatures(userRole) {
  const allItems = getAllNavItems(userRole === 'admin')

  // 添加设置页面（不在 NAV_GROUPS 中）
  const settingsItem = {
    label: '设置',
    path: '/settings',
    keywords: ['settings', 'config', '设置', '配置'],
  }

  return [
    ...allItems.map((item) => ({
      label: item.label,
      path: item.to,
      keywords: item.keywords || [],
    })),
    settingsItem,
  ]
}
