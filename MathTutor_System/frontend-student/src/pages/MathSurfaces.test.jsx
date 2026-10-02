import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ExamDoPage from './ExamDoPage'
import MistakeBookPage from './MistakeBookPage'
import fixture from '../../../test-fixtures/math-rendering-cases.json'

const api = vi.hoisted(() => ({ getStudentExam: vi.fn(), studentGradeExam: vi.fn(), getStudentMistakes: vi.fn(), studentMistakeReview: vi.fn(), studentMistakeMaster: vi.fn() }))
vi.mock('../services/api', () => api)
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

it.each([false, true])('exam renders formulas before and after grading (graded=%s)', async (graded) => {
  api.getStudentExam.mockResolvedValue({ id: 1, title: '数学练习', questions: [fixture.question], ...(graded ? { graded_at: '2026-10-02T00:00:00Z', grade_results: [{ question_index: 0, student_answer: '$7$', is_correct: true }], grade_summary: { correct: 1, total: 1 } } : {}) })
  const { container } = render(<MemoryRouter initialEntries={['/exams/1']}><Routes><Route path="/exams/:id" element={<ExamDoPage />} /></Routes></MemoryRouter>)
  await waitFor(() => expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(4))
  if (graded) expect(container.querySelectorAll('.katex')).toHaveLength(8)
  expect(container.querySelector('.math-text').textContent).not.toContain('$')
})

it('mistake book renders stem, options and solution from the same fixture', async () => {
  api.getStudentMistakes.mockResolvedValue([{ id: 1, ...fixture.question, solution: fixture.question.analysis, topic: '函数', status: 'pending' }])
  const { container } = render(<MemoryRouter><MistakeBookPage /></MemoryRouter>)
  await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(6))
  expect(container.querySelector('.katex-display')).not.toBeNull()
  expect(screen.getByText('第一步：', { exact: false })).toBeInTheDocument()
})
