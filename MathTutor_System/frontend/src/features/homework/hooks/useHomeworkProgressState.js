import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import {
  deleteExam,
  getExams,
  saveExam,
  updateExam,
} from '../../../services/api'
import {
  bankItemToQuestion,
  buildQuestionRows,
  buildStats,
  filterQuestionRows,
  flatQuestionsFromExam,
  groupRowsByExam,
  mistakeToQuestion,
  PAGE_SIZE,
  todayStr,
} from '../utils/homeworkUtils'

export function useHomeworkProgressState() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStudent, setFilterStudent] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('time')
  const [viewMode, setViewMode] = useState('table')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [deletingExamId, setDeletingExamId] = useState(null)
  const [mainTab, setMainTab] = useState('manage')
  const [assignmentDate, setAssignmentDate] = useState(todayStr)
  const [draft, setDraft] = useState(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [addBankOpen, setAddBankOpen] = useState(false)
  const [addMistakesOpen, setAddMistakesOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [removingQuestionIndex, setRemovingQuestionIndex] = useState(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    getExams()
      .then((res) => setExams(Array.isArray(res.data) ? res.data : []))
      .catch(() => setExams([]))
      .finally(() => setLoading(false))
  }, [])

  const fetchDraft = useCallback((date) => {
    if (!date) return
    setDraftLoading(true)
    getExams({ assignment_date: date })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : []
        const draftExam = list.find((exam) => exam.student_id == null) || null
        setDraft(draftExam)
      })
      .catch(() => setDraft(null))
      .finally(() => setDraftLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (mainTab === 'manage') fetchDraft(assignmentDate)
  }, [assignmentDate, fetchDraft, mainTab])

  const assignedExams = useMemo(() => exams.filter((exam) => exam.student_id != null), [exams])
  const questionRows = useMemo(() => buildQuestionRows(assignedExams), [assignedExams])
  const filtered = useMemo(
    () => filterQuestionRows(questionRows, filterStudent, filterStatus, sortBy),
    [filterStudent, filterStatus, questionRows, sortBy]
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [currentPage, filtered])
  const groupedByExam = useMemo(() => groupRowsByExam(filtered), [filtered])
  const hasFilters = filterStudent.trim() || filterStatus !== 'all'
  const stats = useMemo(() => buildStats(questionRows), [questionRows])
  const studentNames = useMemo(() => {
    const set = new Set(assignedExams.map((exam) => exam.student_name).filter(Boolean))
    return Array.from(set).sort()
  }, [assignedExams])

  useEffect(() => setCurrentPage(1), [filterStudent, filterStatus, sortBy])

  const toggleGroup = useCallback((key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleDeleteExam = useCallback(
    async (examId, title = '该作业') => {
      if (!window.confirm(`确定删除“${title}”？学生端将不再显示该作业。`)) return
      setDeletingExamId(examId)
      try {
        await deleteExam(examId)
        toast.success('已删除')
        fetchData()
        if (mainTab === 'manage' && draft?.id === examId) fetchDraft(assignmentDate)
      } catch (err) {
        toast.error(err.response?.data?.detail || '删除失败')
      } finally {
        setDeletingExamId(null)
      }
    },
    [assignmentDate, draft?.id, fetchData, fetchDraft, mainTab]
  )

  const ensureDraft = useCallback(async () => {
    if (draft?.id) return { id: draft.id, questions: flatQuestionsFromExam(draft) }
    const title = `${assignmentDate} 作业`
    const res = await saveExam({
      title,
      student_id: null,
      questions: [],
      assignment_date: assignmentDate,
    })
    const created = res.data ?? res
    setDraft(created)
    return { id: created.id, questions: [] }
  }, [assignmentDate, draft])

  const handleAddFromBank = useCallback(
    async (selectedItems) => {
      if (!selectedItems?.length) return
      try {
        const { id, questions: existing } = await ensureDraft()
        const added = selectedItems.map((item) => bankItemToQuestion(item))
        await updateExam(id, { questions: [...existing, ...added] })
        toast.success(`已加入 ${added.length} 道题`)
        fetchDraft(assignmentDate)
        setAddBankOpen(false)
      } catch (err) {
        toast.error(err.response?.data?.detail || '加入失败')
      }
    },
    [assignmentDate, ensureDraft, fetchDraft]
  )

  const handleAddFromMistakes = useCallback(
    async (selectedItems) => {
      if (!selectedItems?.length) return
      try {
        const { id, questions: existing } = await ensureDraft()
        const added = selectedItems.map((item) => mistakeToQuestion(item))
        await updateExam(id, { questions: [...existing, ...added] })
        toast.success(`已加入 ${added.length} 道题`)
        fetchDraft(assignmentDate)
        setAddMistakesOpen(false)
      } catch (err) {
        toast.error(err.response?.data?.detail || '加入失败')
      }
    },
    [assignmentDate, ensureDraft, fetchDraft]
  )

  const handleRemoveFromDraft = useCallback(
    async (index) => {
      if (!draft?.id || removingQuestionIndex != null) return
      const flat = flatQuestionsFromExam(draft)
      if (index < 0 || index >= flat.length) return
      setRemovingQuestionIndex(index)
      try {
        const next = flat.filter((_, i) => i !== index)
        await updateExam(draft.id, { questions: next })
        toast.success('已从当日作业中移除')
        fetchDraft(assignmentDate)
      } catch (err) {
        toast.error(err.response?.data?.detail || '移除失败')
      } finally {
        setRemovingQuestionIndex(null)
      }
    },
    [assignmentDate, draft, fetchDraft, removingQuestionIndex]
  )

  const handleAssignToStudents = useCallback(
    async (students, title) => {
      const questions = flatQuestionsFromExam(draft)
      if (!questions.length) {
        toast.error('当前没有题目，请先从题库或错题本加入')
        return
      }
      const finalTitle = (title || draft?.title || `${assignmentDate} 作业`).trim() || `${assignmentDate} 作业`
      for (const student of students) {
        await saveExam({
          title: finalTitle,
          student_id: student.id,
          questions,
          assignment_date: assignmentDate,
        })
      }
      toast.success(`已布置给 ${students.length} 位学生`)
      setAssignModalOpen(false)
      fetchData()
      fetchDraft(assignmentDate)
    },
    [assignmentDate, draft, fetchData, fetchDraft]
  )

  return {
    actions: {
      fetchData,
      fetchDraft,
      handleAddFromBank,
      handleAddFromMistakes,
      handleAssignToStudents,
      handleDeleteExam,
      handleRemoveFromDraft,
      setAddBankOpen,
      setAddMistakesOpen,
      setAssignModalOpen,
      setCurrentPage,
      setFilterStatus,
      setFilterStudent,
      setMainTab,
      setSortBy,
      setViewMode,
      setAssignmentDate,
      toggleGroup,
    },
    derived: {
      assignedExams,
      filtered,
      groupedByExam,
      hasFilters,
      paginatedRows,
      questionRows,
      stats,
      studentNames,
      totalPages,
    },
    state: {
      addBankOpen,
      addMistakesOpen,
      assignModalOpen,
      assignmentDate,
      currentPage,
      deletingExamId,
      draft,
      draftLoading,
      exams,
      expandedGroups,
      filterStatus,
      filterStudent,
      loading,
      mainTab,
      removingQuestionIndex,
      sortBy,
      viewMode,
    },
  }
}
