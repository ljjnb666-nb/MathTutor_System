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
            <h1 className="text-xl font-black tracking-tight text-slate-900">向量知识库资产中心</h1>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 text-[10px] font-black text-cyan-600 uppercase">RAG VECTOR INDEX</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            上传教案或讲义资料（PDF/Word），AI 引擎自动切片建立向量索引以实现精准考点出题与智能检索
          </p>
        </div>
      </header>

      {/* 上传 Dropzone 区域 */}
      <section className="pro-glass-card rounded-3xl p-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-slate-700">知识点归属标签（可选）</label>
            <input
              type="text"
              value={uploadKnowledgePoint}
              onChange={(e) => setUploadKnowledgePoint(e.target.value)}
              placeholder="如：二次函数 或 勾股定理（多标签逗号分隔）"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">知识块类型</span>
            <div className="flex rounded-xl border border-slate-200 bg-slate-100/80 p-1">
              {['题目', '概念'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setUploadChunkType(t)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    uploadChunkType === t ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
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
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 transition-all ${
            dragOver ? 'border-indigo-500 bg-indigo-50/60 scale-[0.99]' : 'border-slate-300 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/20'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          ) : (
            <Upload className="h-10 w-10 text-indigo-500" />
          )}
          <p className="mt-3 text-xs font-black text-slate-800">
            {uploading ? '正在解析文档并向量化切片…' : '点击或拖拽 PDF / Word 资料到此处上传'}
          </p>
          <p className="mt-1 text-[11px] font-medium text-slate-400">支持 PDF 及 DOCX 标准备课文档</p>
        </div>
      </section>

      {/* 已入库文档列表 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">已成功建索引库的文档</h2>
          {listFetched && documents.length > 0 && (
            <button
              type="button"
              onClick={() => fetchList()}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              刷新向量节点列表
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center rounded-3xl border border-slate-200/80 bg-white py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-amber-200 bg-amber-50/50 py-12 text-center px-6">
            <Database className="h-12 w-12 text-amber-500 mb-2" />
            <p className="text-xs font-bold text-amber-800">数据库向量索引节点响应异常</p>
            <button
              type="button"
              onClick={() => fetchList()}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
            >
              重新连接
            </button>
          </div>
        ) : documents.length === 0 ? (
          <div className="pro-glass-card flex flex-col items-center justify-center rounded-3xl py-12 text-center px-6">
            <Database className="h-12 w-12 text-slate-300 mb-2" />
            <p className="text-xs font-extrabold text-slate-600">暂无向量知识库文档，请在上方拖拽上传</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => {
              const documentId = String(doc.document_id || '').trim()
              const isManageable = Boolean(documentId)
              return (
              <li
                key={documentId || doc.source}
                className="pro-glass-card flex items-center justify-between gap-4 rounded-2xl p-4 transition-all"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-slate-900">{doc.source}</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">{doc.chunk_count ?? 0} 个索引向量分块 (Chunks)</p>
                    {Array.isArray(doc.knowledge_points) && doc.knowledge_points.length > 0 && (
                      <p className="mt-1 text-[11px] font-bold text-indigo-600">
                        考点: {doc.knowledge_points.join(' · ')}
                      </p>
                    )}
                    {!isManageable && (
                      <p className="mt-1 text-[11px] font-bold text-amber-600">该文档需要迁移后才能管理</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePreview(documentId, doc.source)}
                    disabled={!isManageable}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-2xs"
                    title="预览向量切片"
                  >
                    <Eye className="h-3.5 w-3.5 text-indigo-600" />
                    切片预览
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(documentId, doc.source)}
                    disabled={!isManageable || deletingDocumentId === documentId}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50 transition-colors"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 id="preview-title" className="truncate text-lg font-semibold text-gray-800">
                {previewSource}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setPreviewSource(null)
                  setPreviewDocumentId(null)
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="关闭预览"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {previewLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : previewChunks.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">暂无文本块</p>
              ) : (
                <ol className="space-y-4">
                  {previewChunks.map((text, idx) => (
                    <li key={idx} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                      <span className="mr-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-600">
                        {idx + 1}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{text}</p>
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
