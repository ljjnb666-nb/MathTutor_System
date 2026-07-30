import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { getSchedules, createSchedule, updateSchedule, deleteSchedule, getStudents } from '../../../services/api'
import {
  getMonthBounds,
  getMonthsRange,
  getPastRange,
  getWeekBounds,
  todayStr,
} from '../utils/dateRanges'
import {
  buildConflictMap,
  getDefaultEndTime,
  getNextHour,
  isScheduleEnded,
  isScheduleStillUpcoming,
  sortSchedules,
  timeRangesOverlap,
  timeToMinutes,
} from '../utils/scheduleMath'

function makeFormState(overrides = {}) {
  return {
    student_id: null,
    schedule_date: '',
    start_time: '14:00',
    end_time: '15:00',
    subject: '',
    note: '',
    recurrence_weekdays: [],
    ...overrides,
  }
}

export function useSchedulePageState(currentStudentId) {
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState([])
  const [students, setStudents] = useState([])
  const [scheduleView, setScheduleView] = useState('upcoming')
  const [dateRange, setDateRange] = useState('week')
  const [allRangeSub, setAllRangeSub] = useState('3m')
  const [customFrom, setCustomFrom] = useState(() => todayStr())
  const [customTo, setCustomTo] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().slice(0, 10)
  })
  const [historyRangeSub, setHistoryRangeSub] = useState('month')
  const [historyCustomFrom, setHistoryCustomFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [historyCustomTo, setHistoryCustomTo] = useState(() => todayStr())
  const [filterStudentId, setFilterStudentId] = useState(null)
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formStudentDropdownOpen, setFormStudentDropdownOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState('timeAsc')
  const [form, setForm] = useState(() => makeFormState())

  const params = useMemo(() => {
    const p = {}
    if (filterStudentId != null) p.student_id = filterStudentId

    if (scheduleView === 'history') {
      if (historyRangeSub === 'week') {
        const [from, to] = getPastRange(7)
        p.from_date = from
        p.to_date = to
      } else if (historyRangeSub === 'month') {
        const [from, to] = getPastRange(30)
        p.from_date = from
        p.to_date = to
      } else if (historyRangeSub === '3m') {
        const [from, to] = getPastRange(90)
        p.from_date = from
        p.to_date = to
      } else {
        const from = historyCustomFrom <= historyCustomTo ? historyCustomFrom : historyCustomTo
        let to = historyCustomFrom <= historyCustomTo ? historyCustomTo : historyCustomFrom
        if (to > todayStr()) to = todayStr()
        p.from_date = from
        p.to_date = to
      }
      return p
    }

    if (dateRange === 'week') {
      const [from, to] = getWeekBounds()
      p.from_date = from
      p.to_date = to
    } else if (dateRange === 'month') {
      const [from, to] = getMonthBounds()
      p.from_date = from
      p.to_date = to
    } else if (allRangeSub === '3m') {
      const [from, to] = getMonthsRange(3)
      p.from_date = from
      p.to_date = to
    } else if (allRangeSub === '6m') {
      const [from, to] = getMonthsRange(6)
      p.from_date = from
      p.to_date = to
    } else if (customFrom <= customTo) {
      p.from_date = customFrom
      p.to_date = customTo
    } else {
      p.from_date = customTo
      p.to_date = customFrom
    }

    return p
  }, [
    allRangeSub,
    customFrom,
    customTo,
    dateRange,
    filterStudentId,
    historyCustomFrom,
    historyCustomTo,
    historyRangeSub,
    scheduleView,
  ])

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSchedules(params)
      setSchedules(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(`加载排课失败：${e.response?.data?.detail ?? e.message}`)
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }, [params])

  const fetchStudents = useCallback(async () => {
    try {
      const res = await getStudents()
      setStudents(Array.isArray(res?.data) ? res.data : [])
    } catch {
      setStudents([])
    }
  }, [])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  useEffect(() => {
    if (scheduleView === 'history') setSortOrder('timeDesc')
  }, [scheduleView])

  const openAdd = useCallback(() => {
    if (students.length === 0) {
      toast.error('请先在“学生管理”中添加学生后再排课')
      return
    }

    setEditingSchedule(null)
    setForm(
      makeFormState({
        student_id: currentStudentId ?? students[0]?.id ?? null,
        schedule_date: todayStr(),
        start_time: getNextHour(),
        end_time: getDefaultEndTime(),
      })
    )
    setModalOpen(true)
    setFormStudentDropdownOpen(false)
  }, [currentStudentId, students])

  const openCopy = useCallback((schedule) => {
    setEditingSchedule(null)
    setForm(
      makeFormState({
        student_id: schedule.student_id,
        schedule_date: schedule.schedule_date,
        start_time: schedule.start_time?.slice(0, 5) || '14:00',
        end_time: schedule.end_time?.slice(0, 5) || '15:00',
        subject: schedule.subject ?? '',
        note: schedule.note ?? '',
        recurrence_weekdays: Array.isArray(schedule.recurrence_weekdays)
          ? [...schedule.recurrence_weekdays]
          : [],
      })
    )
    setModalOpen(true)
    setFormStudentDropdownOpen(false)
  }, [])

  const openEdit = useCallback((schedule) => {
    setEditingSchedule(schedule)
    setForm(
      makeFormState({
        student_id: schedule.student_id,
        schedule_date: schedule.schedule_date,
        start_time: schedule.start_time?.slice(0, 5) || '14:00',
        end_time: schedule.end_time?.slice(0, 5) || '15:00',
        subject: schedule.subject ?? '',
        note: schedule.note ?? '',
        recurrence_weekdays: Array.isArray(schedule.recurrence_weekdays)
          ? [...schedule.recurrence_weekdays]
          : [],
      })
    )
    setModalOpen(true)
    setFormStudentDropdownOpen(false)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditingSchedule(null)
  }, [])

  useEffect(() => {
    if (!modalOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeModal, modalOpen])

  const checkFormConflict = useCallback(() => {
    const others = schedules.filter(
      (schedule) =>
        schedule.schedule_date === form.schedule_date &&
        (editingSchedule ? schedule.id !== editingSchedule.id : true)
    )
    return others.some((schedule) =>
      timeRangesOverlap(form.start_time, form.end_time, schedule.start_time, schedule.end_time)
    )
  }, [editingSchedule, form, schedules])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()

      if (form.student_id == null) {
        toast.error('请选择学生')
        return
      }
      if (!form.schedule_date?.trim()) {
        toast.error('请选择日期')
        return
      }
      if (form.start_time && form.end_time && timeToMinutes(form.end_time) <= timeToMinutes(form.start_time)) {
        toast.error('结束时间须晚于开始时间')
        return
      }
      if (checkFormConflict()) {
        const go = window.confirm('该时段与已有排课重叠。是否仍要保存？')
        if (!go) return
      }

      setSaving(true)
      try {
        const body = {
          student_id: form.student_id,
          schedule_date: form.schedule_date,
          start_time: form.start_time,
          end_time: form.end_time,
          subject: form.subject?.trim() || undefined,
          note: form.note?.trim() || undefined,
        }

        if (editingSchedule) {
          body.recurrence_weekdays = form.recurrence_weekdays ?? []
          await updateSchedule(editingSchedule.id, body)
          toast.success('已更新')
        } else {
          if (form.recurrence_weekdays?.length > 0) {
            body.recurrence_weekdays = form.recurrence_weekdays
          }
          await createSchedule(body)
          toast.success('已添加')
        }

        closeModal()
        fetchSchedules()
      } catch (e2) {
        toast.error((e2.response?.data?.detail ?? e2.message) || '保存失败')
      } finally {
        setSaving(false)
      }
    },
    [checkFormConflict, closeModal, editingSchedule, fetchSchedules, form]
  )

  const handleDelete = useCallback(
    async (schedule) => {
      const msg = schedule.is_recurring
        ? '此为每周重复排课，删除将取消所有重复日期。确定删除吗？'
        : '确定删除这条排课吗？'
      if (!window.confirm(msg)) return

      try {
        await deleteSchedule(schedule.id)
        toast.success('已删除')
        fetchSchedules()
      } catch (e) {
        toast.error(`删除失败：${e.response?.data?.detail ?? e.message}`)
      }
    },
    [fetchSchedules]
  )

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === form.student_id),
    [form.student_id, students]
  )

  const filterStudent = useMemo(
    () => (filterStudentId != null ? students.find((student) => student.id === filterStudentId) : null),
    [filterStudentId, students]
  )

  const filteredSchedules = useMemo(() => {
    if (scheduleView === 'upcoming') return schedules.filter(isScheduleStillUpcoming)
    if (scheduleView === 'history') return schedules.filter(isScheduleEnded)
    return schedules
  }, [scheduleView, schedules])

  const sortedSchedules = useMemo(
    () => sortSchedules(filteredSchedules, sortOrder),
    [filteredSchedules, sortOrder]
  )

  const conflictMap = useMemo(() => buildConflictMap(filteredSchedules), [filteredSchedules])

  return {
    actions: {
      closeModal,
      handleDelete,
      handleSubmit,
      openAdd,
      openCopy,
      openEdit,
      refreshSchedules: fetchSchedules,
      setAllRangeSub,
      setCustomFrom,
      setCustomTo,
      setDateRange,
      setFilterStudentId,
      setForm,
      setFormStudentDropdownOpen,
      setHistoryCustomFrom,
      setHistoryCustomTo,
      setHistoryRangeSub,
      setModalOpen,
      setScheduleView,
      setSortOrder,
      setStudentDropdownOpen,
    },
    derived: {
      conflictMap,
      filteredSchedules,
      filterStudent,
      selectedStudent,
      sortedSchedules,
    },
    state: {
      allRangeSub,
      customFrom,
      customTo,
      dateRange,
      editingSchedule,
      filterStudentId,
      form,
      formStudentDropdownOpen,
      historyCustomFrom,
      historyCustomTo,
      historyRangeSub,
      loading,
      modalOpen,
      schedules,
      saving,
      scheduleView,
      sortOrder,
      studentDropdownOpen,
      students,
    },
  }
}
