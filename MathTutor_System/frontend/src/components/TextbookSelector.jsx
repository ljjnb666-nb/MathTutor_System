import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { useStudent } from '../contexts/StudentContext'
import { TEXTBOOK_DATA } from '../constants/textbooks'

const PLACEHOLDER = {
  version: '版本',
  grade: '年级',
  chapter: '章',
  section: '小节',
}

/**
 * 单级自定义下拉（非原生 select）
 */
function LevelDropdown({ options, selectedValue, selectedLabel, placeholder, onSelect, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('click', handleClickOutside), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [open])

  const display = selectedLabel || placeholder
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="flex min-w-[100px] items-center justify-between gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600/20"
      >
        <span className={selectedValue ? 'font-medium' : 'text-gray-500'}>{display}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && options.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-56 min-w-[160px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onSelect(opt)
                setOpen(false)
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 ${
                selectedValue === opt.value ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TextbookSelector({ onChange, disabled = false, onAdd }) {
  const { currentStudent, students } = useStudent()

  const [version, setVersion] = useState(null)
  const [grade, setGrade] = useState(null)
  const [chapter, setChapter] = useState(null)
  const [section, setSection] = useState(null)

  const versionOptions = TEXTBOOK_DATA.map((p) => ({ value: p.value, label: p.label }))
  const gradeOptions = version
    ? (TEXTBOOK_DATA.find((p) => p.value === version)?.children ?? []).map((g) => ({ value: g.value, label: g.label }))
    : []
  const gradeNode = version && grade
    ? (TEXTBOOK_DATA.find((p) => p.value === version)?.children ?? []).find((g) => g.value === grade)
    : null
  const chapterOptions = gradeNode?.children?.map((c) => ({ value: c.value, label: c.label })) ?? []
  const sectionOptions = chapter
    ? (() => {
        const pub = TEXTBOOK_DATA.find((p) => p.value === version)
        const gr = pub?.children?.find((g) => g.value === grade)
        const ch = gr?.children?.find((c) => c.value === chapter)
        return (ch?.children ?? []).map((s) => ({ value: s.value, label: s.label }))
      })()
    : []

  const versionLabel = version ? versionOptions.find((o) => o.value === version)?.label : null
  const gradeLabel = grade ? gradeOptions.find((o) => o.value === grade)?.label : null
  const chapterLabel = chapter ? chapterOptions.find((o) => o.value === chapter)?.label : null
  const sectionLabel = section ? sectionOptions.find((o) => o.value === section)?.label : null

  const selectVersion = useCallback((opt) => {
    setVersion(opt.value)
    setGrade(null)
    setChapter(null)
    setSection(null)
  }, [])

  const selectGrade = useCallback((opt) => {
    setGrade(opt.value)
    setChapter(null)
    setSection(null)
  }, [])

  const selectChapter = useCallback((opt) => {
    setChapter(opt.value)
    setSection(null)
  }, [])

  const selectSection = useCallback(
    (opt) => {
      setSection(opt.value)
      onChange?.(opt.label)
    },
    [onChange]
  )

  const currentPathLabel = [versionLabel, gradeLabel, chapterLabel, sectionLabel].filter(Boolean).join(' ')
  const canAdd = Boolean(onAdd && currentPathLabel.trim())

  const handleAdd = useCallback(() => {
    if (!canAdd || !onAdd) return
    onAdd(currentPathLabel.trim())
    setChapter(null)
    setSection(null)
  }, [canAdd, onAdd, currentPathLabel])

  const lastAutoFilledIdRef = useRef(null)

  useEffect(() => {
    if (!currentStudent?.id) {
      lastAutoFilledIdRef.current = null
      return
    }
    if (!Array.isArray(students) || students.length === 0) return
    const full = students.find((s) => s.id === currentStudent.id)
    if (!full) return

    if (lastAutoFilledIdRef.current === currentStudent.id) return
    lastAutoFilledIdRef.current = currentStudent.id

    let nextVersion = null
    let nextGrade = null

    if (full.textbook_version) {
      const v = TEXTBOOK_DATA.find(
        (p) => p.label === full.textbook_version || p.value === full.textbook_version
      )
      if (v) nextVersion = v.value
    }
    if (!nextVersion && TEXTBOOK_DATA.length > 0) nextVersion = TEXTBOOK_DATA[0].value

    if (full.grade) {
      const gradeList = nextVersion
        ? (TEXTBOOK_DATA.find((p) => p.value === nextVersion)?.children ?? []).map((g) => ({ value: g.value, label: g.label }))
        : []
      const match = gradeList.find((g) => g.label.includes(full.grade) || full.grade.includes(g.label))
      if (match) nextGrade = match.value
    }

    setVersion(nextVersion ?? null)
    setGrade(nextGrade ?? null)
    setChapter(null)
    setSection(null)
  }, [currentStudent?.id, students])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <LevelDropdown
        options={versionOptions}
        selectedValue={version}
        selectedLabel={versionLabel}
        placeholder={PLACEHOLDER.version}
        onSelect={selectVersion}
        disabled={disabled}
      />
      <LevelDropdown
        options={gradeOptions}
        selectedValue={grade}
        selectedLabel={gradeLabel}
        placeholder={PLACEHOLDER.grade}
        onSelect={selectGrade}
        disabled={disabled}
      />
      <LevelDropdown
        options={chapterOptions}
        selectedValue={chapter}
        selectedLabel={chapterLabel}
        placeholder={PLACEHOLDER.chapter}
        onSelect={selectChapter}
        disabled={disabled}
      />
      <LevelDropdown
        options={sectionOptions}
        selectedValue={section}
        selectedLabel={sectionLabel}
        placeholder={PLACEHOLDER.section}
        onSelect={selectSection}
        disabled={disabled}
      />
      {onAdd != null && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || !canAdd}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        >
          <Plus className="h-4 w-4" />
          添加知识点
        </button>
      )}
    </div>
  )
}
