import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRagDocument, getRagDocumentChunks } from './ragApi'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./httpClient', () => ({ default: api }))

beforeEach(() => {
  api.get.mockReset()
  api.delete.mockReset()
})

describe('ragApi document id protocol', () => {
  it('requests chunks with document_id query param', async () => {
    api.get.mockResolvedValue({ data: { chunks: ['a'] } })

    await expect(getRagDocumentChunks('doc-a')).resolves.toEqual({ chunks: ['a'] })

    expect(api.get).toHaveBeenCalledWith('/api/rag/documents/chunks', { params: { document_id: 'doc-a' } })
  })

  it('deletes by encoded document_id path segment', async () => {
    api.delete.mockResolvedValue({ data: { chunk_count: 2 } })

    await expect(deleteRagDocument('doc/a b')).resolves.toEqual({ chunk_count: 2 })

    expect(api.delete).toHaveBeenCalledWith('/api/rag/documents/doc%2Fa%20b')
  })
})
