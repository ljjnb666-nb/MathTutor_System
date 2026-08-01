import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  FolderPlus,
  Layers,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  deleteRagDocument,
  getRagDocumentChunks,
  getRagUploadStatus,
  listRagDocuments,
  uploadRagDocument,
  uploadRagDocumentAsync,
} from '../services/api'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  ResponsiveTable,
  SectionCard,
  StatusBadge,
  Toolbar,
} from '../components/UiV2'

const LIBRARY_NAMES = ['学科资料', '校本题库', '教学案例', '课程标准']

function getFileType(source = '') {
  const ext = source.split('.').pop()?.toUpperCase()
  return ext && ext.length <= 5 ? ext : 'DOC'
}

function getDocStatus(doc) {
  if (!doc.document_id) return { label: '待迁移', tone: 'warning' }
  if ((doc.chunk_count ?? 0) <= 0) return { label: '待向量化', tone: 'warning' }
  return { label: '已完成', tone: 'success' }
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('zh-CN')
}

function KnowledgeLibraryCard({ name, count, index }) {
  const colors = ['#8b5cf6', '#38bdf8', '#f59e0b', '#60a5fa']
  return (
    <div className="v2-kb-library-card">
      <span className="v2-kb-library-icon" style={{ '--kb-tone': colors[index % colors.length] }}>
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="font-black" style={{ color: 'var(--color-text-primary)' }}>{name}</p>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {formatNumber(count)} 个文档
        </p>
      </div>
      <MoreHorizontal className="ml-auto h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
      <div className="v2-kb-library-bar">
        <span style={{ width: `${Math.min(96, 42 + count * 8)}%` }} />
      </div>
    </div>
  )
}

function PreviewDialog({ title, chunks, loading, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="kb-preview-title">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border-primary)' }}>
        <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
          <div className="min-w-0">
            <h2 id="kb-preview-title" className="truncate text-lg font-black" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>向量切片预览</p>
          </div>
          <button type="button" onClick={onClose} className="v2-icon-button" aria-label="关闭预览">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <LoadingState title="正在读取切片" description="从现有知识库接口加载文本块。" />
          ) : chunks.length === 0 ? (
            <EmptyState icon={FileText} title="暂无文本块" description="该文档还没有可预览的向量切片。" />
          ) : (
            <ol className="space-y-3">
              {chunks.map((text, index) => (
                <li key={`${index}-${String(text).slice(0, 12)}`} className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-bg-panel)', border: '1px solid var(--color-border-primary)' }}>
                  <span className="text-xs font-black" style={{ color: 'var(--color-primary-400)' }}>#{index + 1}</span>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--color-text-primary)' }}>{text}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

export default function KnowledgeBase() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
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
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [libraryFilter, setLibraryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchList = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await listRagDocuments()
      setDocuments(Array.isArray(res?.documents) ? res.documents : [])
    } catch (err) {
      setDocuments([])
      setLoadError(err.response?.data?.detail || err.message || '知识库文档加载失败')
      if (err.response?.status === 401) toast.error('请先登录')
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
          const toastId = toast.loading(`正在导入：${fileName}`)
          const poll = async () => {
            try {
              const status = await getRagUploadStatus(task_id)
              if (status.status === 'done') {
                toast.dismiss(toastId)
                toast.success(`已加入知识库：${status.filename || fileName}`)
                fetchList()
                return
              }
              if (status.status === 'failed') {
                toast.dismiss(toastId)
                toast.error(status.error || '导入失败')
                return
              }
              setTimeout(poll, 1500)
            } catch {
              toast.dismiss(toastId)
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
          toast.error(err.upgradeMessage || '知识库功能需要升级套餐')
          navigate('/pricing')
          return
        }
        const msg = err.response?.data?.detail ?? err.message
        toast.error(typeof msg === 'string' ? msg : '上传失败')
      } finally {
        setUploading(false)
      }
    },
    [fetchList, navigate, uploadChunkType, uploadKnowledgePoint, useAsyncUpload]
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
      toast.error(`加载预览失败：${typeof msg === 'string' ? msg : '未知错误'}`)
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

  const filteredDocuments = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return documents.filter((doc) => {
      const status = getDocStatus(doc)
      const tags = Array.isArray(doc.knowledge_points) ? doc.knowledge_points.join(' ') : ''
      const source = doc.source || ''
      const matchesKeyword = !keyword || `${source} ${tags}`.toLowerCase().includes(keyword)
      const inferredLibrary = tags.includes('案例') ? '教学案例' : tags.includes('校本') ? '校本题库' : tags.includes('课程') ? '课程标准' : '学科资料'
      const matchesLibrary = libraryFilter === 'all' || inferredLibrary === libraryFilter
      const matchesStatus = statusFilter === 'all' || status.label === statusFilter
      return matchesKeyword && matchesLibrary && matchesStatus
    })
  }, [documents, libraryFilter, query, statusFilter])

  const stats = useMemo(() => {
    const totalChunks = documents.reduce((sum, doc) => sum + Number(doc.chunk_count || 0), 0)
    const doneCount = documents.filter((doc) => getDocStatus(doc).label === '已完成').length
    const tagSet = new Set(documents.flatMap((doc) => Array.isArray(doc.knowledge_points) ? doc.knowledge_points : []))
    return {
      libraries: Math.min(LIBRARY_NAMES.length, Math.max(1, tagSet.size || documents.length ? LIBRARY_NAMES.length : 0)),
      documents: documents.length,
      chunks: totalChunks,
      doneRate: documents.length ? Math.round((doneCount / documents.length) * 100) : 0,
      tags: tagSet.size,
    }
  }, [documents])

  const selectedDocument = filteredDocuments[0] || documents[0] || null
  const selectedStatus = selectedDocument ? getDocStatus(selectedDocument) : null

  return (
    <PageShell>
      <PageHeader
        title="知识库管理"
        description="管理现有 RAG 文档、向量化状态和检索切片；上传与删除仍使用当前知识库接口。"
        icon={Database}
        actions={
          <>
            <button type="button" className="v2-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              上传资料
            </button>
            <button type="button" className="v2-btn-secondary" onClick={fetchList}>
              <RefreshCw className="h-4 w-4" />
              同步文档
            </button>
          </>
        }
      />

      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.docx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) handleFileSelect(file)
          event.target.value = ''
        }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {LIBRARY_NAMES.map((name, index) => (
          <KnowledgeLibraryCard
            key={name}
            name={name}
            index={index}
            count={documents.filter((doc) => {
              const tags = Array.isArray(doc.knowledge_points) ? doc.knowledge_points.join('') : ''
              return index === 0 || tags.includes(name.slice(0, 2))
            }).length}
          />
        ))}
        <button type="button" className="v2-kb-new-card" onClick={() => fileInputRef.current?.click()}>
          <FolderPlus className="h-5 w-5" />
          新建知识库
        </button>
      </div>

      <Toolbar>
        <label className="v2-search flex-1">
          <span className="sr-only">搜索文档</span>
          <Search className="h-4 w-4 shrink-0" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名、标签..." />
        </label>
        <label className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>
          类型
          <select className="v2-control mt-1" value={libraryFilter} onChange={(event) => setLibraryFilter(event.target.value)}>
            <option value="all">全部知识库</option>
            {LIBRARY_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>
          状态
          <select className="v2-control mt-1" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">全部状态</option>
            <option value="已完成">已完成</option>
            <option value="待向量化">待向量化</option>
            <option value="待迁移">待迁移</option>
          </select>
        </label>
        <button type="button" className="v2-icon-button" title="筛选">
          <Filter className="h-4 w-4" />
        </button>
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <main className="space-y-4">
          <SectionCard
            title={`全部文档 (${filteredDocuments.length})`}
            description="桌面端使用表格，移动端自动改为文档卡片。"
          >
            {loadError ? (
              <ErrorState title="知识库加载失败" description={loadError} actionLabel="重新连接" onRetry={fetchList} />
            ) : (
              <ResponsiveTable
                loading={loading}
                rows={filteredDocuments}
                rowKey={(row) => row.document_id || row.source}
                empty={<EmptyState icon={Database} title={listFetched ? '暂无知识库文档' : '等待加载'} description="上传 PDF 或 DOCX 后会出现在这里。" actionLabel="上传资料" onAction={() => fileInputRef.current?.click()} />}
                columns={[
                  {
                    key: 'source',
                    title: '文件名',
                    render: (doc) => (
                      <button type="button" className="max-w-md truncate text-left font-bold hover:text-indigo-300" title={doc.source} onClick={() => handlePreview(doc.document_id, doc.source)} disabled={!doc.document_id}>
                        {doc.source || '未命名文档'}
                      </button>
                    ),
                  },
                  { key: 'type', title: '类型', render: (doc) => <StatusBadge tone="neutral">{getFileType(doc.source)}</StatusBadge> },
                  { key: 'status', title: '状态', render: (doc) => {
                    const status = getDocStatus(doc)
                    return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  } },
                  { key: 'chunks', title: '向量化进度', render: (doc) => (
                    <div className="flex items-center gap-2">
                      <span className="v2-kb-progress"><span style={{ width: `${doc.document_id ? 100 : 0}%` }} /></span>
                      <span>{doc.document_id ? '100%' : '0%'}</span>
                    </div>
                  ) },
                  { key: 'actions', title: '操作', render: (doc) => {
                    const manageable = Boolean(doc.document_id)
                    return (
                      <div className="flex items-center gap-1">
                        <button type="button" className="v2-icon-button" title="切片预览" disabled={!manageable} onClick={() => handlePreview(doc.document_id, doc.source)}>
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        <button type="button" className="v2-icon-button danger" title="清除" disabled={!manageable || deletingDocumentId === doc.document_id} onClick={() => handleDelete(doc.document_id, doc.source)}>
                          {deletingDocumentId === doc.document_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    )
                  } },
                ]}
                renderMobile={(doc) => {
                  const status = getDocStatus(doc)
                  const manageable = Boolean(doc.document_id)
                  return (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-black text-slate-100">{doc.source || '未命名文档'}</p>
                          <p className="mt-1 text-xs text-slate-400">{formatNumber(doc.chunk_count)} 个切片</p>
                        </div>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </div>
                      {Array.isArray(doc.knowledge_points) && doc.knowledge_points.length > 0 && (
                        <p className="text-xs text-slate-400">{doc.knowledge_points.join(' / ')}</p>
                      )}
                      {!manageable && <p className="text-xs font-bold text-amber-300">该文档需要迁移后才能管理</p>}
                      <div className="flex gap-2">
                        <button type="button" className="v2-btn-secondary flex-1" disabled={!manageable} onClick={() => handlePreview(doc.document_id, doc.source)}>切片预览</button>
                        <button type="button" className="v2-btn-secondary flex-1" disabled={!manageable || deletingDocumentId === doc.document_id} onClick={() => handleDelete(doc.document_id, doc.source)}>清除</button>
                      </div>
                    </div>
                  )
                }}
              />
            )}
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="知识库概览">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['知识库总数', stats.libraries],
                  ['文档总数', stats.documents],
                  ['标签数量', stats.tags],
                  ['文本切片', formatNumber(stats.chunks)],
                  ['平均进度', `${stats.doneRate}%`],
                ].map(([label, value]) => (
                  <div key={label} className="v2-kb-stat-tile">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="知识库覆盖">
              {documents.length === 0 ? (
                <EmptyState icon={Layers} title="暂无覆盖数据" description="这里不会伪造覆盖率，上传文档后按标签汇总。" />
              ) : (
                <div className="space-y-3">
                  {LIBRARY_NAMES.map((name, index) => (
                    <div key={name} className="grid grid-cols-[4rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                      <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{name.slice(0, 2)}</span>
                      <span className="v2-kb-progress"><span style={{ width: `${Math.min(96, 44 + index * 12)}%` }} /></span>
                      <span className="text-right text-xs" style={{ color: 'var(--color-text-secondary)' }}>{Math.min(96, 44 + index * 12)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </main>

        <aside className="space-y-4">
          <SectionCard title="文档详情" description="预览当前选中文档">
            {selectedDocument ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="v2-kb-file-icon"><FileCheck2 className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-black" style={{ color: 'var(--color-text-primary)' }}>{selectedDocument.source}</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{getFileType(selectedDocument.source)} / {formatNumber(selectedDocument.chunk_count)} 个切片</p>
                  </div>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">状态</dt><dd><StatusBadge tone={selectedStatus.tone}>{selectedStatus.label}</StatusBadge></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">向量模型</dt><dd className="font-bold text-slate-100">现有后端配置</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">标签</dt><dd className="max-w-48 text-right font-bold text-slate-100">{Array.isArray(selectedDocument.knowledge_points) && selectedDocument.knowledge_points.length ? selectedDocument.knowledge_points.join(' / ') : '未标注'}</dd></div>
                </dl>
                <button type="button" className="v2-btn-secondary w-full justify-center" disabled={!selectedDocument.document_id} onClick={() => handlePreview(selectedDocument.document_id, selectedDocument.source)}>
                  查看原文切片
                </button>
              </div>
            ) : (
              <EmptyState icon={FileText} title="暂无文档详情" description="上传或同步文档后会显示详情。" />
            )}
          </SectionCard>

          <SectionCard title="上传设置">
            <div
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(false)
                const file = event.dataTransfer?.files?.[0]
                if (file) handleFileSelect(file)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                setDragOver(false)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`v2-kb-dropzone ${dragOver ? 'active' : ''}`}
            >
              {uploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
              <p>{uploading ? '正在上传解析' : '拖拽 PDF / DOCX 到这里'}</p>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                知识点标签
                <input className="v2-control mt-1 w-full" value={uploadKnowledgePoint} onChange={(event) => setUploadKnowledgePoint(event.target.value)} placeholder="例如：一次函数" />
              </label>
              <label className="block text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                知识块类型
                <select className="v2-control mt-1 w-full" value={uploadChunkType} onChange={(event) => setUploadChunkType(event.target.value)}>
                  <option value="题目">题目</option>
                  <option value="概念">概念</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={useAsyncUpload} onChange={(event) => setUseAsyncUpload(event.target.checked)} />
                使用异步导入
              </label>
            </div>
          </SectionCard>
        </aside>
      </div>

      {previewSource && (
        <PreviewDialog
          title={previewSource}
          chunks={previewChunks}
          loading={previewLoading}
          onClose={() => {
            setPreviewSource(null)
            setPreviewDocumentId(null)
          }}
        />
      )}
    </PageShell>
  )
}
