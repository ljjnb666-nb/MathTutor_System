import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import Latex from 'react-latex-next'
import { Send, Loader2, MessageCircle, User, Bot, X, Plus, Trash2, Pencil, Check, Pin, PinOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { chatWithAI, chatWithAIStream, getChatSessions, getChatSessionMessages, deleteChatSession, updateChatMessage, updateChatSessionPin } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { normalizeLatexForKaTeX } from '../utils/latex'
import 'katex/dist/katex.min.css'

function formatSessionDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(iso)
  }
}

export default function AIChat() {
  const { currentStudent } = useStudent()
  const location = useLocation()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [useContext, setUseContext] = useState(false)
  const [knowledgePoint, setKnowledgePoint] = useState('')
  const [contextQuestion, setContextQuestion] = useState(() => location.state?.contextQuestion ?? '')
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [useStream, setUseStream] = useState(true)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    const fromState = location.state?.contextQuestion
    if (fromState && typeof fromState === 'string') setContextQuestion(fromState)
  }, [location.state?.contextQuestion])

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const list = await getChatSessions()
      setSessions(Array.isArray(list) ? list : [])
    } catch {
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const loadSession = useCallback(async (sessionId) => {
    if (sessionId == null) {
      setCurrentSessionId(null)
      setMessages([])
      return
    }
    try {
      const list = await getChatSessionMessages(sessionId)
      const msgs = (Array.isArray(list) ? list : []).map((m) => ({ id: m.id, role: m.role, content: m.content }))
      setMessages(msgs)
      setCurrentSessionId(sessionId)
    } catch (e) {
      toast.error('加载会话失败')
      setMessages([])
    }
  }, [])

  const handleDeleteSession = useCallback(
    async (sessionId, e) => {
      e?.stopPropagation()
      if (!window.confirm('确定删除这条会话记录？删除后无法恢复。')) return
      try {
        await deleteChatSession(sessionId)
        toast.success('已删除')
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null)
          setMessages([])
        }
        fetchSessions()
      } catch (err) {
        const msg = err.response?.data?.detail || err.message || '删除失败'
        toast.error(msg)
      }
    },
    [currentSessionId, fetchSessions]
  )

  const handleTogglePin = useCallback(
    async (sessionId, pinned, e) => {
      e?.stopPropagation()
      try {
        await updateChatSessionPin(sessionId, !pinned)
        toast.success(pinned ? '已取消固定' : '已固定到顶部')
        fetchSessions()
      } catch (err) {
        const msg = err.response?.data?.detail || err.message || '操作失败'
        toast.error(msg)
      }
    },
    [fetchSessions]
  )

  const refetchMessagesForSession = useCallback(async (sessionId) => {
    try {
      const list = await getChatSessionMessages(sessionId)
      const msgs = (Array.isArray(list) ? list : []).map((m) => ({ id: m.id, role: m.role, content: m.content }))
      setMessages(msgs)
    } catch (_) {}
  }, [])

  const handleStartEdit = useCallback((message) => {
    setEditingMessageId(message.id)
    setEditingContent(message.content ?? '')
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditingContent('')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    const content = (editingContent || '').trim()
    if (!content || !editingMessageId || currentSessionId == null) {
      handleCancelEdit()
      return
    }
    const editIndex = messages.findIndex((m) => m.id === editingMessageId)
    if (editIndex < 0) {
      handleCancelEdit()
      return
    }
    try {
      await updateChatMessage(currentSessionId, editingMessageId, content)
      setEditingMessageId(null)
      setEditingContent('')
      toast.success('已修改，正在重新生成…')
      // 截断到本条（含），与后端一致；然后从此处重新请求 AI 回复（Gemini 式）
      const truncated = messages
        .slice(0, editIndex + 1)
        .map((m) => (m.id === editingMessageId ? { ...m, content } : m))
      setMessages(truncated)
      setLoading(true)
      const apiMessages = truncated.map((m) => ({ role: m.role, content: m.content ?? '' }))
      const commonParams = {
        messages: apiMessages,
        session_id: currentSessionId,
        student_id: useContext && currentStudent?.id != null ? currentStudent.id : undefined,
        knowledge_point: useContext && knowledgePoint.trim() ? knowledgePoint.trim() : undefined,
        use_knowledge_base: useContext && knowledgePoint.trim() ? true : false,
        context_question: contextQuestion.trim() || undefined,
      }
      if (useStream) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
        chatWithAIStream(
          commonParams,
          (chunk) => {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant')
                next[next.length - 1] = { ...last, content: (last.content || '') + chunk }
              return next
            })
          },
          (data) => {
            setLoading(false)
            if (data?.error) toast.error(data.error)
            if (data?.session_id != null) {
              setCurrentSessionId(data.session_id)
              fetchSessions()
              refetchMessagesForSession(data.session_id)
            }
            if (commonParams.use_knowledge_base && data?.rag_used === false)
              toast('本次未使用知识库（可能未命中或检索失败）', { icon: 'ℹ️' })
            setMessages((m) => {
              const next = [...m]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  ...(!(last.content || '').trim() && { content: '（无回复）' }),
                  ...(Array.isArray(data?.rag_sources) && { rag_sources: data.rag_sources }),
                }
              }
              return next
            })
          }
        )
        return
      }
      try {
        const res = await chatWithAI(commonParams)
        const assistantContent = (res?.content || '').trim() || '（无回复）'
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent, rag_sources: res?.rag_sources ?? [] },
        ])
        if (commonParams.use_knowledge_base && res?.rag_used === false)
          toast('本次未使用知识库（可能未命中或检索失败）', { icon: 'ℹ️' })
        if (res?.session_id != null) {
          setCurrentSessionId(res.session_id)
          fetchSessions()
          refetchMessagesForSession(res.session_id)
        }
      } catch (err) {
        const msg = err.response?.data?.detail || err.message || '对话请求失败'
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || '修改失败'
      toast.error(msg)
    }
  }, [
    currentSessionId,
    editingMessageId,
    editingContent,
    messages,
    useContext,
    currentStudent?.id,
    knowledgePoint,
    contextQuestion,
    useStream,
    handleCancelEdit,
    fetchSessions,
    refetchMessagesForSession,
  ])

  const handleSend = async () => {
    const text = (input || '').trim()
    if (!text || loading) return
    setInput('')
    const userMsg = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    const nextMessages = [...messages, userMsg]

    const commonParams = {
      messages: nextMessages,
      session_id: currentSessionId ?? undefined,
      student_id: useContext && currentStudent?.id != null ? currentStudent.id : undefined,
      knowledge_point: useContext && knowledgePoint.trim() ? knowledgePoint.trim() : undefined,
      use_knowledge_base: useContext && knowledgePoint.trim() ? true : false,
      context_question: contextQuestion.trim() || undefined,
    }

    if (useStream) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      chatWithAIStream(
        commonParams,
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant')
              next[next.length - 1] = { ...last, content: (last.content || '') + chunk }
            return next
          })
        },
        (data) => {
          setLoading(false)
          if (data?.error) toast.error(data.error)
          if (data?.session_id != null) {
            setCurrentSessionId(data.session_id)
            fetchSessions()
            refetchMessagesForSession(data.session_id)
          }
          if (commonParams.use_knowledge_base && data?.rag_used === false)
            toast('本次未使用知识库（可能未命中或检索失败）', { icon: 'ℹ️' })
          setMessages((m) => {
            const next = [...m]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                ...(!(last.content || '').trim() && { content: '（无回复）' }),
                ...(Array.isArray(data?.rag_sources) && { rag_sources: data.rag_sources }),
              }
            }
            return next
          })
        }
      )
      return
    }

    try {
      const res = await chatWithAI(commonParams)
      const content = (res?.content || '').trim() || '（无回复）'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content, rag_sources: res?.rag_sources ?? [] },
      ])
      if (commonParams.use_knowledge_base && res?.rag_used === false)
        toast('本次未使用知识库（可能未命中或检索失败）', { icon: 'ℹ️' })
      if (res?.session_id != null) {
        setCurrentSessionId(res.session_id)
        fetchSessions()
        refetchMessagesForSession(res.session_id)
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || '对话请求失败'
      toast.error(msg)
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-gray-50/80 shadow-sm md:flex-row"
    >
      {/* 会话列表：左侧面板（标题固定，仅列表可滚动） */}
      <aside className="flex min-h-0 shrink-0 flex-col border-b border-gray-200 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="shrink-0 border-b border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-800">会话记录</span>
            <button
              type="button"
              onClick={() => loadSession(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              新会话
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sessionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <MessageCircle className="h-10 w-10 text-gray-300" />
              <p className="mt-2 text-xs text-gray-500">暂无历史会话</p>
              <p className="mt-0.5 text-xs text-gray-400">发送消息后将自动保存</p>
            </div>
          ) : (
            <ul className="p-2 space-y-0.5">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => loadSession(s.id)}
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition-all ${
                      currentSessionId === s.id
                        ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
                        : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                    } ${s.pinned ? 'border-l-2 border-blue-500' : ''}`}
                  >
                    <span className="line-clamp-2 flex items-center gap-1.5 text-sm font-medium leading-snug">
                      {s.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
                      {s.title || '未命名会话'}
                    </span>
                    <span className="mt-1 block text-xs text-gray-500">
                      {formatSessionDate(s.created_at)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleTogglePin(s.id, s.pinned, e)}
                    className={`shrink-0 self-center rounded-lg p-2 transition-colors ${
                      s.pinned
                        ? 'text-blue-500 hover:bg-blue-50'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    aria-label={s.pinned ? '取消固定' : '固定到顶部'}
                    title={s.pinned ? '取消固定' : '固定到顶部'}
                  >
                    {s.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="shrink-0 self-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 active:bg-red-100"
                    aria-label="删除会话"
                    title="删除会话"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* 主对话区：仅聊天消息区可滚动，整页不滚动 */}
      <div className="flex min-h-0 flex-1 flex-col min-w-0 bg-gray-50/50">
        {/* 顶部：标题 + 选项（固定不随滚动） */}
        <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">AI 对话</h1>
              <p className="text-xs text-gray-500">结合学情与知识库，针对性辅导</p>
            </div>
          </div>

          {contextQuestion && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50/90 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-indigo-800">当前针对题目</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-indigo-900">
                  {contextQuestion.length > 120 ? contextQuestion.slice(0, 120) + '…' : contextQuestion}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContextQuestion('')}
                className="shrink-0 rounded-lg p-1.5 text-indigo-600 transition-colors hover:bg-indigo-100 active:bg-indigo-200"
                aria-label="清除题目上下文"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 px-3 py-2.5">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={useStream}
                onChange={(e) => setUseStream(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-gray-700">流式回复</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={useContext}
                onChange={(e) => setUseContext(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-gray-700">带入学生与知识点</span>
            </label>
            {useContext && (
              <>
                {currentStudent?.name && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                    {currentStudent.name}
                  </span>
                )}
                <input
                  type="text"
                  value={knowledgePoint}
                  onChange={(e) => setKnowledgePoint(e.target.value)}
                  placeholder="知识点，如：二次函数"
                  className="w-40 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </>
            )}
          </div>
        </header>

        {/* 消息区域：仅此区域可滚动 */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <MessageCircle className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-gray-600">发送一条消息开始对话</p>
              <p className="mt-1 text-xs text-gray-400">支持数学公式、学情上下文与带题提问</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {['这道题第二步怎么解？', '帮我总结勾股定理', '出两道类似的练习题'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setInput(label)}
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs text-gray-600 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mx-auto max-w-2xl space-y-5">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={m.id ?? i} className="flex justify-end">
                  <div className="flex max-w-[88%] items-end gap-2 sm:max-w-[85%]">
                    {editingMessageId === m.id ? (
                      <div className="flex flex-1 flex-col gap-2 rounded-2xl rounded-br-md border-2 border-blue-400 bg-blue-600/95 p-3">
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          rows={3}
                          className="min-w-0 flex-1 resize-y rounded-lg border border-blue-400 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          placeholder="编辑消息内容…"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="rounded-lg bg-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/30"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                          >
                            <Check className="h-4 w-4" />
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
                        {m.content}
                      </div>
                    )}
                    {editingMessageId !== m.id && m.id != null && currentSessionId != null && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m)}
                        className="shrink-0 rounded-lg p-1.5 text-blue-600/90 transition-colors hover:bg-blue-100 hover:text-blue-700"
                        aria-label="编辑消息"
                        title="编辑消息"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <User className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              ) : (
                <div key={m.id ?? i} className="flex justify-start">
                  <div className="flex max-w-[88%] items-end gap-2 sm:max-w-[85%]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-gray-800 shadow-sm">
                        <Latex>{normalizeLatexForKaTeX(m.content ?? '')}</Latex>
                      </div>
                      {Array.isArray(m.rag_sources) && m.rag_sources.length > 0 && (
                        <p className="text-xs text-gray-500">
                          参考自：{m.rag_sources.join('、')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                  </span>
                  <span className="text-xs text-gray-500">思考中…</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-2xl gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={loading ? 'AI 正在回复，请稍候…' : '输入消息，按 Enter 发送'}
              disabled={loading}
              aria-label="输入消息"
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !(input || '').trim()}
              aria-label={loading ? '发送中' : '发送'}
              title={loading ? '发送中' : '发送 (Enter)'}
              className="shrink-0 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>发送</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
