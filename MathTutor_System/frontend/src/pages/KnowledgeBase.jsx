import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Upload, Loader2, Trash2, FileText, Eye, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  listRagDocuments,
  deleteRagDocument,
  uploadRagDocument,
  uploadRagDocumentAsync,
  getRagUploadStatus,
  getRagDocumentChunks,
} from '../services/api'

export default function KnowledgeBase() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [listFetched, setListFetched] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewSource, setPreviewSource] = useState(null)
  const [previewDocumentId, setPreviewDocumentId] = useState(null)
  const [previewChunks, setPreviewChunks] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [uploadKnowledgePoint, setUploadKnowledgePoint] = useState('')
  const [uploadChunkType, setUploadChunkType] = useState('题目')
  const [useAsyncUpload, setUseAsyncUpload] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const fileInputRef = useRef(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await listRagDocuments()
      setDocuments(Array.isArray(res?.documents) ? res.documents : [])
    } catch (err) {
      setDocuments([])
      setLoadError(true)
      if (err.response?.status === 401) {
        toast.error('请先登录')
      }
    } finally {
      setLoading(false)
      setListFetched(true)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleFileSelect = useCallback(
    async (file) => {
      if (!file) return
      const name = (file.name || '').toLowerCase()
      if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
        toast.error('仅支持 .pdf 或 .docx 文件')
        return
      }
      const opts = {
        knowledge_point: uploadKnowledgePoint.trim() || undefined,
        chunk_type: uploadChunkType.trim() || '题目',
      }
      setUploading(true)
      try {
        if (useAsyncUpload) {
          const { task_id } = await uploadRagDocumentAsync(file, opts)
          const fileName = file.name || '文档'
          const t = toast.loading(`正在导入：${fileName}`)
          const poll = async () => {
            try {
              const st = await getRagUploadStatus(task_id)
              if (st.status === 'done') {
                toast.dismiss(t)
                toast.success(`已加入知识库：${st.filename || fileName}`)
                fetchList()
                return
              }
              if (st.status === 'failed') {
                toast.dismiss(t)
                toast.error(st.error || '导入失败')
                return
              }
              setTimeout(poll, 1500)
            } catch (e) {
              toast.dismiss(t)
              toast.error('查询导入状态失败')
            }
          }
          setTimeout(poll, 1500)
        } else {
          await uploadRagDocument(file, opts)
          toast.success(`已加入知识库：${file.name || '文档'}`)
          fetchList()
        }
      } catch (err) {
        if (err.upgradeRequired) {
          toast.error(err.upgradeMessage || '知识库功能需升级至基础版及以上套餐')
          navigate('/pricing')
          return
        }
        const msg = err.response?.data?.detail ?? err.message
        toast.error(typeof msg === 'string' ? msg : '上传失败')
      } finally {
        setUploading(false)
      }
    },
    [fetchList, uploadKnowledgePoint, uploadChunkType, useAsyncUpload, navigate]
  )

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) handleFileSelect(f)
    },
    [handleFileSelect]
  )

  const handlePreview = useCallback(async (documentId, displayName) => {
    if (!documentId) {
      toast.error('该文档需要迁移后才能管理')
      return
    }
    setPreviewDocumentId(documentId)
    setPreviewSource(displayName || documentId)
    setPreviewChunks([])
    setPreviewLoading(true)
    try {
      const res = await getRagDocumentChunks(documentId)
      setPreviewChunks(Array.isArray(res?.chunks) ? res.chunks : [])
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error('加载预览失败：' + (typeof msg === 'string' ? msg : '未知错误'))
      setPreviewSource(null)
      setPreviewDocumentId(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const handleDelete = useCallback(
    async (documentId, displayName) => {
      if (!documentId || deletingDocumentId) {
        if (!documentId) toast.error('该文档需要迁移后才能管理')
        return
      }
      const name = displayName || documentId
      if (!window.confirm(`确定从知识库中删除「${name}」？删除后智能出题将不再检索该文档内容。`)) return
      setDeletingDocumentId(documentId)
      try {
        const res = await deleteRagDocument(documentId)
        toast.success(`已删除 ${res?.chunk_count ?? 0} 个文本块`)
        fetchList()
        if (previewDocumentId === documentId) {
          setPreviewSource(null)
          setPreviewDocumentId(null)
        }
      } catch (err) {
        const msg = err.response?.data?.detail ?? err.message
        toast.error(typeof msg === 'string' ? msg : '删除失败')
      } finally {
        setDeletingDocumentId(null)
      }
    },
    [deletingDocumentId, fetchList, previewDocumentId]
  )

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>向量知识库资产中心</h1>
            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, #06b6d4 10%, transparent)', border: '1px solid color-mix(in srgb, #06b6d4 20%, transparent)', color: '#0891b2' }}>RAG VECTOR INDEX</span>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            上传教案或讲义资料（PDF/Word），AI 引擎自动切片建立向量索引以实现精准考点出题与智能检索
          </p>
        </div>
      </header>

      {/* 上传 Dropzone 区域 */}
      <section className="rounded-3xl p-6 shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>知识点归属标签（可选）</label>
            <input
              type="text"
              value={uploadKnowledgePoint}
              onChange={(e) => setUploadKnowledgePoint(e.target.value)}
              placeholder="如：二次函数 或 勾股定理（多标签逗号分隔）"
              className="mt-1.5 w-full rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 transition-all"
              style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary-500)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>知识块类型</span>
            <div className="flex rounded-xl p-1" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)' }}>
              {['题目', '概念'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setUploadChunkType(t)}
                  className="rounded-lg px-3 py-1 text-xs font-bold transition-all"
                  style={
                    uploadChunkType === t
                      ? { background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))', color: 'white', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
                      : { color: 'var(--color-text-secondary)' }
                  }
                  onMouseEnter={(e) => {
                    if (uploadChunkType !== t) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (uploadChunkType !== t) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFileSelect(f)
            e.target.value = ''
          }}
        />
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragOver(false)
          }}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 transition-all"
          style={
            dragOver
              ? { borderColor: 'var(--color-primary-500)', backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, var(--color-bg-card))', transform: 'scale(0.99)' }
              : { borderColor: 'var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)' }
          }
          onMouseEnter={(e) => {
            if (!dragOver) {
              e.currentTarget.style.borderColor = 'var(--color-primary-400)'
              e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 5%, var(--color-bg-card))'
            }
          }}
          onMouseLeave={(e) => {
            if (!dragOver) {
              e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
            }
          }}
        >
          {uploading ? (
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
          ) : (
            <Upload className="h-10 w-10" style={{ color: 'var(--color-primary-500)' }} />
          )}
          <p className="mt-3 text-xs font-black" style={{ color: 'var(--color-text-primary)' }}>
            {uploading ? '正在解析文档并向量化切片…' : '点击或拖拽 PDF / Word 资料到此处上传'}
          </p>
          <p className="mt-1 text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>支持 PDF 及 DOCX 标准备课文档</p>
        </div>
      </section>

      {/* 已入库文档列表 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>已成功建索引库的文档</h2>
          {listFetched && documents.length > 0 && (
            <button
              type="button"
              onClick={() => fetchList()}
              className="text-xs font-bold transition-colors"
              style={{ color: 'var(--color-primary-600)' }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
            >
              刷新向量节点列表
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center rounded-3xl py-12 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center rounded-3xl py-12 text-center px-6 shadow-sm" style={{ border: '1px solid #fbbf24', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))' }}>
            <Database className="h-12 w-12 mb-2" style={{ color: '#f59e0b' }} />
            <p className="text-xs font-bold" style={{ color: '#b45309' }}>数据库向量索引节点响应异常</p>
            <button
              type="button"
              onClick={() => fetchList()}
              className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white transition-all"
              style={{ backgroundColor: '#d97706' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#b45309' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#d97706' }}
            >
              重新连接
            </button>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl py-12 text-center px-6 shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
            <Database className="h-12 w-12 mb-2" style={{ color: 'var(--color-border-primary)' }} />
            <p className="text-xs font-extrabold" style={{ color: 'var(--color-text-secondary)' }}>暂无向量知识库文档，请在上方拖拽上传</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => {
              const documentId = String(doc.document_id || '').trim()
              const isManageable = Boolean(documentId)
              return (
              <li
                key={documentId || doc.source}
                className="flex items-center justify-between gap-4 rounded-2xl p-4 transition-all shadow-sm"
                style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-600)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)' }}>
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold" style={{ color: 'var(--color-text-primary)' }}>{doc.source}</p>
                    <p className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{doc.chunk_count ?? 0} 个索引向量分块 (Chunks)</p>
                    {Array.isArray(doc.knowledge_points) && doc.knowledge_points.length > 0 && (
                      <p className="mt-1 text-[11px] font-bold" style={{ color: 'var(--color-primary-600)' }}>
                        考点: {doc.knowledge_points.join(' · ')}
                      </p>
                    )}
                    {!isManageable && (
                      <p className="mt-1 text-[11px] font-bold" style={{ color: '#d97706' }}>该文档需要迁移后才能管理</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePreview(documentId, doc.source)}
                    disabled={!isManageable}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)' }}
                    onMouseEnter={(e) => {
                      if (isManageable) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isManageable) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                      }
                    }}
                    title="预览向量切片"
                  >
                    <Eye className="h-3.5 w-3.5" style={{ color: 'var(--color-primary-600)' }} />
                    切片预览
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(documentId, doc.source)}
                    disabled={!isManageable || deletingDocumentId === documentId}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50 transition-colors"
                    style={{ border: '1px solid #fecdd3', backgroundColor: '#fff1f2', color: '#e11d48' }}
                    onMouseEnter={(e) => {
                      if (isManageable && deletingDocumentId !== documentId) {
                        e.currentTarget.style.backgroundColor = '#ffe4e6'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isManageable && deletingDocumentId !== documentId) {
                        e.currentTarget.style.backgroundColor = '#fff1f2'
                      }
                    }}
                    title="移出知识库"
                  >
                    {deletingDocumentId === documentId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    清除
                  </button>
                </div>
              </li>
            )})}
          </ul>
        )}
      </section>

      {previewSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl shadow-lg" style={{ backgroundColor: 'var(--color-bg-card)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
              <h2 id="preview-title" className="truncate text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {previewSource}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setPreviewSource(null)
                  setPreviewDocumentId(null)
                }}
                className="rounded-lg p-2 transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-muted)'
                }}
                aria-label="关闭预览"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {previewLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
                </div>
              ) : previewChunks.length === 0 ? (
                <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>暂无文本块</p>
              ) : (
                <ol className="space-y-4">
                  {previewChunks.map((text, idx) => (
                    <li key={idx} className="pb-4 last:border-0 last:pb-0" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <span className="mr-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded text-xs font-medium" style={{ backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-secondary)' }}>
                        {idx + 1}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: 'var(--color-text-primary)' }}>{text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
