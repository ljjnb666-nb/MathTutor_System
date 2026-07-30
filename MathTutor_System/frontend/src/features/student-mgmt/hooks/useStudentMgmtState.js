import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import {
  createStudent,
  deleteStudent,
  getStudentReportPdf,
  getStudents,
  getStudentsOverview,
  updateStudent,
} from '../../../services/api'
import {
  buildOverviewMap,
  buildStudentPayload,
  filterStudents,
  getDefaultStudentForm,
  getEditStudentForm,
} from '../utils/studentMgmtUtils'

export function useStudentMgmtState({
  atStudentLimit,
  navigate,
  refreshSubscription,
  selectStudent,
}) {
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const [overviewMap, setOverviewMap] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reportDownloadingId, setReportDownloadingId] = useState(null)
  const [form, setForm] = useState(getDefaultStudentForm())

  const fetchList = async (params = {}) => {
    setLoading(true)
    try {
      const [res, overviewData] = await Promise.all([
        getStudents(params),
        getStudentsOverview().catch(() => ({ students: [] })),
      ])
      setStudents(Array.isArray(res.data) ? res.data : [])
      setOverviewMap(buildOverviewMap(overviewData))
    } catch (e) {
      toast.error(`加载学生列表失败：${e.response?.data?.detail ?? e.message}`)
      setStudents([])
      setOverviewMap({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

  const filtered = useMemo(() => filterStudents(students, searchTerm), [students, searchTerm])

  const openAdd = () => {
    setEditingStudent(null)
    setForm(getDefaultStudentForm())
    setModalOpen(true)
  }

  const openEdit = (student) => {
    setEditingStudent(student)
    setForm(getEditStudentForm(student))
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingStudent(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const name = form.name?.trim()
    if (!name) {
      toast.error('请填写姓名')
      return
    }

    setSaving(true)
    try {
      const payload = buildStudentPayload(form, editingStudent)
      if (editingStudent) {
        await updateStudent(editingStudent.id, payload)
        toast.success('已更新')
      } else {
        await createStudent(payload)
        toast.success('已添加')
      }
      closeModal()
      fetchList()
      refreshSubscription?.()
    } catch (e2) {
      if (e2.upgradeRequired) {
        toast.error(e2.upgradeMessage || '当前套餐学生数已满，请升级套餐')
        navigate('/pricing')
        return
      }
      toast.error((e2.response?.data?.detail ?? e2.message) || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (student) => {
    if (!window.confirm(`确定删除学生“${student.name}”吗？`)) return
    try {
      await deleteStudent(student.id)
      toast.success('已删除')
      fetchList()
    } catch (e) {
      toast.error(`删除失败：${e.response?.data?.detail ?? e.message}`)
    }
  }

  const handleSelectAndGo = (studentId, path) => {
    selectStudent(studentId)
    navigate(path)
  }

  const handleDownloadReport = async (student) => {
    setReportDownloadingId(student.id)
    try {
      const res = await getStudentReportPdf(student.id)
      const blob = res.data
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `学习报告_${(student.name || '学生').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('报告已下载')
    } catch (e) {
      toast.error(`下载失败：${e.response?.data?.detail ?? e.message}`)
    } finally {
      setReportDownloadingId(null)
    }
  }

  return {
    actions: {
      closeModal,
      handleDelete,
      handleDownloadReport,
      handleSelectAndGo,
      handleSubmit,
      openAdd,
      openEdit,
      setForm,
      setSearchTerm,
    },
    derived: {
      filtered,
    },
    state: {
      atStudentLimit,
      editingStudent,
      form,
      loading,
      modalOpen,
      overviewMap,
      reportDownloadingId,
      saving,
      searchTerm,
      students,
    },
  }
}
