import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'

const navigate = vi.hoisted(() => vi.fn())
const selectStudent = vi.hoisted(() => vi.fn())
const refreshStudents = vi.hoisted(() => vi.fn())

const mockAuthUser = vi.hoisted(() => ({ id: 1, role: 'teacher', username: 'teacher' }))
const mockStudentState = vi.hoisted(() => ({
  currentStudent: null,
  students: [],
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser, logout: vi.fn() }),
}))

vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({
    currentStudent: mockStudentState.currentStudent,
    students: mockStudentState.students,
    selectStudent,
    refreshStudents,
  }),
}))

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ atStudentLimit: false }),
}))

function TestWrapper({ initialEntries = ['/dashboard'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Sidebar />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStudentState.currentStudent = null
  mockStudentState.students = []
})

afterEach(() => {
  cleanup()
})

describe('Sidebar V3-04 regression tests', () => {
  it('1. opens student switcher panel when clicked without student data', async () => {
    render(<TestWrapper />)

    expect(screen.getByText('未选择档案')).toBeInTheDocument()
    expect(screen.queryByText('录入新学生档案')).not.toBeInTheDocument()

    const switcherBtn = screen.getByRole('button', { expanded: false })
    await userEvent.click(switcherBtn)

    expect(screen.getByText('录入新学生档案')).toBeInTheDocument()
  })

  it('2. V3-04: clicking "录入新学生档案" closes panel and navigates to /student-mgmt', async () => {
    render(<TestWrapper />)

    const switcherBtn = screen.getByRole('button', { expanded: false })
    await userEvent.click(switcherBtn)

    const addStudentBtn = screen.getByRole('button', { name: '录入新学生档案' })
    await userEvent.click(addStudentBtn)

    expect(navigate).toHaveBeenCalledWith('/student-mgmt')
    // Assert student panel is completely closed and absent from DOM
    expect(screen.queryByRole('button', { name: '录入新学生档案' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('搜索学生或班级…')).not.toBeInTheDocument()
  })

  it('3. normal student selection works and closes panel', async () => {
    mockStudentState.students = [
      { id: 10, name: '张三', grade: '高一', class_name: '1班' },
    ]

    render(<TestWrapper />)

    const switcherBtn = screen.getByRole('button', { expanded: false })
    await userEvent.click(switcherBtn)

    const optionBtn = screen.getByRole('option', { name: /张三/ })
    await userEvent.click(optionBtn)

    expect(selectStudent).toHaveBeenCalledWith(10)
    expect(screen.queryByRole('option', { name: /张三/ })).not.toBeInTheDocument()
  })
})
