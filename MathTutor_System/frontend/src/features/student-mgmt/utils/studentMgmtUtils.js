export const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
]

export function getAvatarStyle(name) {
  if (!name || !name.trim()) return AVATAR_COLORS[0]
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

export function getInitial(name) {
  if (!name || !name.trim()) return '?'
  return name.trim()[0]
}

export function getStudentAppUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STUDENT_APP_URL) {
    return import.meta.env.VITE_STUDENT_APP_URL
  }
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return `${window.location.protocol}//${window.location.hostname}:5174`
  }
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/student`
}

export function filterStudents(students, searchTerm) {
  const q = searchTerm.trim().toLowerCase()
  if (!q) return students
  return students.filter((student) => {
    const name = (student.name ?? '').toLowerCase()
    const className = (student.class_name ?? '').toLowerCase()
    const grade = (student.grade ?? '').toLowerCase()
    return name.includes(q) || className.includes(q) || grade.includes(q)
  })
}

export function buildOverviewMap(overviewData) {
  const list = Array.isArray(overviewData?.students) ? overviewData.students : []
  const map = {}
  list.forEach((item) => {
    map[item.student_id] = {
      pending_mistake_count: item.pending_mistake_count ?? 0,
      today_review_count: item.today_review_count ?? 0,
      weak_point_count: item.weak_point_count ?? 0,
    }
  })
  return map
}

export function getDefaultStudentForm() {
  return {
    name: '',
    grade: '八年级',
    class_name: '3班',
    tagsStr: '',
    login_code: '',
    password: '',
  }
}

export function getEditStudentForm(student) {
  return {
    name: student.name ?? '',
    grade: student.grade ?? '八年级',
    class_name: student.class_name ?? '3班',
    tagsStr: Array.isArray(student.tags) ? student.tags.join('，') : '',
    login_code: student.login_code ?? '',
    password: '',
  }
}

export function buildStudentPayload(form, editingStudent) {
  const name = form.name?.trim()
  const tags = form.tagsStr
    ? form.tagsStr
        .split(/[,，\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    : []
  const loginCode = form.login_code?.trim() || null
  const password = form.password?.trim() || null

  return {
    name,
    grade: form.grade?.trim() || '八年级',
    class_name: form.class_name?.trim() || '3班',
    tags,
    ...(editingStudent ? { login_code: loginCode } : loginCode ? { login_code: loginCode } : {}),
    ...(password ? { password } : {}),
  }
}
