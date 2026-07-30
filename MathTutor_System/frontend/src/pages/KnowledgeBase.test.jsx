import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import KnowledgeBase from './KnowledgeBase'

const navigate = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
}))
const api = vi.hoisted(() => ({
  listRagDocuments: vi.fn(),
  deleteRagDocument: vi.fn(),
  uploadRagDocument: vi.fn(),
  uploadRagDocumentAsync: vi.fn(),
  getRagUploadStatus: vi.fn(),
  getRagDocumentChunks: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)

beforeEach(() => {
  vi.clearAllMocks()
  window.confirm = vi.fn(() => true)
  api.listRagDocuments.mockResolvedValue({
    documents: [
      { document_id: 'doc-a', source: 'same.pdf', chunk_count: 2, knowledge_points: ['a'] },
      { document_id: 'doc-b', source: 'same.pdf', chunk_count: 1, knowledge_points: ['b'] },
    ],
  })
  api.getRagDocumentChunks.mockResolvedValue({ chunks: ['chunk b'] })
  api.deleteRagDocument.mockResolvedValue({ chunk_count: 1 })
})

afterEach(() => {
  cleanup()
})

describe('KnowledgeBase document identity', () => {
  it('uses document_id for same-name preview and delete operations', async () => {
    render(<KnowledgeBase />)

    await screen.findAllByText('same.pdf')
    const previewButtons = screen.getAllByText('切片预览')
    const deleteButtons = screen.getAllByText('清除')

    await userEvent.click(previewButtons[1])
    expect(api.getRagDocumentChunks).toHaveBeenCalledWith('doc-b')

    await userEvent.click(deleteButtons[1])
    await waitFor(() => expect(api.deleteRagDocument).toHaveBeenCalledWith('doc-b'))
    expect(api.deleteRagDocument).not.toHaveBeenCalledWith('same.pdf')
  })

  it('disables management actions when document_id is missing', async () => {
    api.listRagDocuments.mockResolvedValue({
      documents: [{ source: 'legacy.pdf', chunk_count: 2, knowledge_points: ['legacy'] }],
    })

    render(<KnowledgeBase />)

    expect(await screen.findByText('该文档需要迁移后才能管理')).toBeInTheDocument()
    expect(screen.getByText('切片预览').closest('button')).toBeDisabled()
    expect(screen.getByText('清除').closest('button')).toBeDisabled()
  })
})
