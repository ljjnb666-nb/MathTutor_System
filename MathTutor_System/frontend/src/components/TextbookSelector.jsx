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
        className="flex min-w-[100px] items-center justify-between gap-1.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-1"
        style={{
          border: '1px solid var(--color-border-primary)',
          backgroundColor: 'var(--color-bg-card)',
          color: selectedValue ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = 'var(--color-border-hover)'
            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
            e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
          }
        }}
      >
        <span className={selectedValue ? 'font-medium' : ''}>{display}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--color-text-muted)' }} />
      </button>
      {open && options.length > 0 && (
        <div
          className="absolute left-0 top-full z-10 mt-1 max-h-56 min-w-[160px] overflow-y-auto rounded-lg py-1 shadow-lg"
          style={{
            border: '1px solid var(--color-border-primary)',
            backgroundColor: 'var(--color-bg-card)'
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onSelect(opt)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left text-sm transition-colors"
              style={
                selectedValue === opt.value
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
                      color: 'var(--color-primary-700)',
                      fontWeight: '500'
                    }
                  : { color: 'var(--color-text-primary)' }
              }
              onMouseEnter={(e) => {
                if (selectedValue !== opt.value) {
                  e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'
                }
              }}
              onMouseLeave={(e) => {
                if (selectedValue !== opt.value) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2"
          style={{
            border: '1px solid var(--color-primary-600)',
            backgroundColor: 'var(--color-primary-600)'
          }}
          onMouseEnter={(e) => {
            if (!disabled && canAdd) {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled && canAdd) {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
            }
          }}
        >
          <Plus className="h-4 w-4" />
          添加知识点
        </button>
      )}
    </div>
  )
}
