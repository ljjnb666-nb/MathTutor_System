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
  const [deletingSource, setDeletingSource] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewSource, setPreviewSource] = useState(null)
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

  const handlePreview = useCallback(async (source) => {
    if (!source) return
    setPreviewSource(source)
    setPreviewChunks([])
    setPreviewLoading(true)
    try {
      const res = await getRagDocumentChunks(source)
      setPreviewChunks(Array.isArray(res?.chunks) ? res.chunks : [])
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error('加载预览失败：' + (typeof msg === 'string' ? msg : '未知错误'))
      setPreviewSource(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const handleDelete = useCallback(
    async (source) => {
      if (!source || deletingSource) return
      if (!window.confirm(`确定从知识库中删除「${source}」？删除后智能出题将不再检索该文档内容。`)) return
      setDeletingSource(source)
      try {
        const res = await deleteRagDocument(source)
        toast.success(`已删除 ${res?.chunk_count ?? 0} 个文本块`)
        fetchList()
        if (previewSource === source) setPreviewSource(null)
      } catch (err) {
        const msg = err.response?.data?.detail ?? err.message
        toast.error(typeof msg === 'string' ? msg : '删除失败')
      } finally {
        setDeletingSource(null)
      }
    },
    [deletingSource, fetchList, previewSource]
  )

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-gray-800">本地知识库</h1>
        <p className="mt-1 text-sm text-gray-500">
          上传教案或资料（PDF/Word），填写知识点后智能出题/对话会按知识点精准检索完整题目或段落。
        </p>
      </header>

      <section className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/80 p-6">
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-600">知识点（可选）</label>
            <input
              type="text"
              value={uploadKnowledgePoint}
              onChange={(e) => setUploadKnowledgePoint(e.target.value)}
              placeholder="如：二次函数 或 勾股定理（多标签用逗号分隔）"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600">类型</span>
            <div className="flex rounded-lg border border-gray-200 bg-white p-1">
              {['题目', '概念'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setUploadChunkType(t)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    uploadChunkType === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={useAsyncUpload}
              onChange={(e) => setUseAsyncUpload(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-600">大文件后台导入（不卡顿）</span>
          </label>
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
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 transition-colors ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          ) : (
            <Upload className="h-10 w-10 text-gray-400" />
          )}
          <p className="mt-3 text-sm font-medium text-gray-700">
            {uploading ? '上传中…' : '点击或拖拽 PDF / Word 到此处上传'}
          </p>
          <p className="mt-1 text-xs text-gray-500">支持 .pdf、.docx</p>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">已入库文档</h2>
          {listFetched && documents.length > 0 && (
            <button
              type="button"
              onClick={() => fetchList()}
              className="text-xs text-blue-600 hover:underline"
            >
              刷新
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/50 py-12 text-center px-6">
            <Database className="h-12 w-12 text-amber-500" />
            <p className="mt-3 text-sm font-medium text-amber-800">加载失败</p>
            <p className="mt-1 text-xs text-amber-700 max-w-sm">请确认后端已启动（backend 目录运行 uvicorn app.main:app --reload）后点击重试</p>
            <button
              type="button"
              onClick={() => fetchList()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              重试
            </button>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-12 text-center px-6">
            <Database className="h-12 w-12 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">暂无文档，请先上传</p>
            <p className="mt-2 text-xs text-gray-400 max-w-sm">上传时填写知识点后，智能出题与 AI 对话可按知识点检索该文档</p>
            <button
              type="button"
              onClick={() => fetchList()}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              刷新列表
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.source}
                className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{doc.source}</p>
                    <p className="text-xs text-gray-500">{doc.chunk_count ?? 0} 个文本块</p>
                    {Array.isArray(doc.knowledge_points) && doc.knowledge_points.length > 0 && (
                      <p className="mt-0.5 text-xs text-blue-600">
                        知识点：{doc.knowledge_points.join('、')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePreview(doc.source)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    title="预览入库内容"
                  >
                    <Eye className="h-4 w-4" />
                    预览
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.source)}
                    disabled={deletingSource === doc.source}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    title="从知识库中删除"
                  >
                    {deletingSource === doc.source ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    删除
                  </button>
                </div>
              </li>
            ))}
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
                onClick={() => setPreviewSource(null)}
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
