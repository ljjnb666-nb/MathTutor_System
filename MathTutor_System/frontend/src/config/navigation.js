import {
  LayoutDashboard,
  Sparkles,
  BookOpen,
  Database,
  Presentation,
  FileStack,
  FileUp,
  Calendar,
  ClipboardCheck,
  BookMarked,
  GitBranch,
  FileText,
  Users,
  MessageCircle,
  CreditCard,
  Settings,
  UserCog,
  PenTool,
} from 'lucide-react'

/**
 * TutorPro 统一导航配置 (Subject-Neutral & Teaching-Workflow Oriented)
 * 围绕教学准备、教学执行、学习分析与学生管理构建信息架构
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
        keywords: ['home', 'dashboard', '工作台', '概览', '首页'],
      },
    ],
  },
  {
    title: '教学准备',
    items: [
      {
        to: '/teacher-agent',
        icon: Sparkles,
        label: 'AI 教师助手',
        keywords: ['agent', 'assistant', '备课', '助手', '教学方案'],
      },
      {
        to: '/smart-gen',
        icon: PenTool,
        label: '智能出题',
        keywords: ['generate', 'questions', '智能出题', '习题', '练习生成'],
      },
      {
        to: '/question-bank',
        icon: BookOpen,
        label: '题库管理',
        keywords: ['question', 'bank', '题库', '题目检索', '组卷'],
      },
      {
        to: '/knowledge-base',
        icon: Database,
        label: '教学资料库',
        keywords: ['knowledge', 'base', '资料库', '讲义', '课标', '教案'],
      },
      {
        to: '/ppt',
        icon: Presentation,
        label: 'Magic PPT',
        keywords: ['ppt', 'slides', '课件', '幻灯片', '课件工坊'],
      },
    ],
  },
  {
    title: '教学执行',
    items: [
      {
        to: '/exams',
        icon: FileStack,
        label: '试卷管理',
        end: true,
        keywords: ['exam', 'paper', '试卷', '测验', '考卷'],
      },
      {
        to: '/exams/import',
        icon: FileUp,
        label: '导入试卷',
        keywords: ['import', 'upload', '试卷导入', 'OCR解析'],
      },
      {
        to: '/schedule',
        icon: Calendar,
        label: '排课日程',
        keywords: ['schedule', 'calendar', '课表', '日程', '辅导排课'],
      },
      {
        to: '/homework-progress',
        icon: ClipboardCheck,
        label: '学习任务进度',
        keywords: ['homework', 'progress', '作业', '批改', '任务进度'],
      },
    ],
  },
  {
    title: '学习分析',
    items: [
      {
        to: '/mistake-book',
        icon: BookMarked,
        label: '错题本',
        keywords: ['mistake', 'error', '错题', '靶向复习', '错题归因'],
      },
      {
        to: '/knowledge-graph',
        icon: GitBranch,
        label: '学情图谱',
        keywords: ['graph', 'knowledge', '知识图谱', '能力图谱', '学情分析'],
      },
      {
        to: '/reports',
        icon: FileText,
        label: '学情报告',
        keywords: ['report', 'parent', '报告', '学情快照', '家校沟通'],
      },
    ],
  },
  {
    title: '学生与辅导',
    items: [
      {
        to: '/student-mgmt',
        icon: Users,
        label: '学生档案',
        keywords: ['student', 'management', '学生', '花名册', '班级档案'],
      },
      {
        to: '/chat',
        icon: MessageCircle,
        label: 'AI 教学对话',
        keywords: ['chat', 'conversation', 'AI对话', '教学问答'],
      },
    ],
  },
  {
    title: '系统与服务',
    items: [
      {
        to: '/pricing',
        icon: CreditCard,
        label: '套餐与定价',
        keywords: ['pricing', 'plan', '套餐', '版本', '订阅'],
      },
    ],
  },
  {
    title: '管理后台',
    adminOnly: true,
    items: [
      {
        to: '/admin-users',
        icon: UserCog,
        label: '用户管理',
        end: true,
        adminOnly: true,
        keywords: ['user', 'admin', '用户管理', '教师账号', '权限管控'],
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
  return NAV_GROUPS.map((group) => {
    // 组级权限拦截
    if (group.adminOnly && userRole !== 'admin') {
      return null
    }
    const filteredItems = group.items.filter((item) => !item.adminOnly || userRole === 'admin')
    if (filteredItems.length === 0) return null
    return {
      ...group,
      items: filteredItems,
    }
  }).filter(Boolean)
}

/**
 * 获取可搜索的功能列表
 * @param {string} userRole - 用户角色
 * @returns {Array} 可搜索的功能列表
 */
export function getSearchableFeatures(userRole) {
  const allItems = getAllNavItems(userRole === 'admin')

  // 设置页面在侧栏底部常驻，但也纳入全局搜索
  const settingsItem = {
    label: '系统设置',
    path: '/settings',
    keywords: ['settings', 'config', '设置', '偏好', '模型配置', '外观'],
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
