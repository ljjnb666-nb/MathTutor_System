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
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl pro-glass-card md:flex-row animate-fade-in-up"
    >
      {/* 会话列表：左侧面板 */}
      <aside className="flex min-h-0 shrink-0 flex-col border-b border-slate-200/80 bg-white/60 md:w-64 md:border-b-0 md:border-r">
        <div className="shrink-0 border-b border-slate-100 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">历史会话节点</span>
            <button
              type="button"
              onClick={() => loadSession(null)}
              className="btn-gradient-pro inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
            >
              <Plus className="h-4 w-4" />
              新会话
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sessionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <MessageCircle className="h-10 w-10 text-slate-300" />
              <p className="mt-2 text-xs font-bold text-slate-500">暂无历史会话</p>
              <p className="mt-0.5 text-[11px] text-slate-400">输入问题后系统自动归档保存</p>
            </div>
          ) : (
            <ul className="p-2 space-y-1">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => loadSession(s.id)}
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition-all ${
                      currentSessionId === s.id
                        ? 'bg-[#0B0F17] text-white shadow-md font-bold'
                        : 'text-slate-700 hover:bg-slate-100/80'
                    } ${s.pinned ? 'border-l-2 border-indigo-400' : ''}`}
                  >
                    <span className="line-clamp-2 flex items-center gap-1.5 text-xs font-extrabold leading-snug">
                      {s.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-indigo-400" />}
                      {s.title || '新对话记录'}
                    </span>
                    <span className="mt-1 block text-[10px] opacity-60">
                      {formatSessionDate(s.created_at)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleTogglePin(s.id, s.pinned, e)}
                    className={`shrink-0 self-center rounded-xl p-2 transition-colors ${
                      s.pinned
                        ? 'text-indigo-600 hover:bg-indigo-50'
                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                    title={s.pinned ? '取消固定' : '固定到顶部'}
                  >
                    {s.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="shrink-0 self-center rounded-xl p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    title="删除会话"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* 主对话区 */}
      <div className="flex min-h-0 flex-1 flex-col min-w-0 bg-slate-50/40">
        {/* 顶部：标题 + 选项 */}
        <header className="shrink-0 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black tracking-tight text-slate-900">AI 智能辅导对话仓</h1>
                  <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-black text-indigo-600 uppercase">PRO TUTOR</span>
                </div>
                <p className="text-xs text-slate-500">结合学生个案学情与向量知识库精准解疑答惑</p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-2xl bg-slate-100/80 px-4 py-2.5 text-xs font-bold text-slate-700">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={useStream}
                onChange={(e) => setUseStream(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
              />
              <span>实时流式极速回复</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={useContext}
                onChange={(e) => setUseContext(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
              />
              <span>导入学生画像与知识点</span>
            </label>
            {useContext && (
              <>
                {currentStudent?.name && (
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700 border border-indigo-200/60">
                    {currentStudent.name}
                  </span>
                )}
                <input
                  type="text"
                  value={knowledgePoint}
                  onChange={(e) => setKnowledgePoint(e.target.value)}
                  placeholder="知识点，如：二次函数"
                  className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </>
            )}
          </div>
        </header>

        {/* 消息区域 */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 mb-3">
                <Bot className="h-7 w-7" />
              </div>
              <p className="text-sm font-extrabold text-slate-700">发送一条消息，开启 AI 智能辅导对话</p>
              <p className="mt-1 text-xs text-slate-400">支持 LaTeX 公式呈现、错题变式拆解与精准点拨</p>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={m.id ?? i} className="flex justify-end">
                  <div className="flex max-w-[88%] items-end gap-2 sm:max-w-[85%]">
                    <div className="rounded-3xl rounded-br-none bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-xs font-bold leading-relaxed text-white shadow-md shadow-indigo-500/20">
                      {m.content}
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white font-bold">
                      <User className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              ) : (
                <div key={m.id ?? i} className="flex justify-start">
                  <div className="flex max-w-[88%] items-end gap-2 sm:max-w-[85%]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#0B0F17] text-indigo-400 shadow-md">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <div className="pro-glass-card rounded-3xl rounded-bl-none px-5 py-3 text-xs font-medium leading-relaxed text-slate-800 shadow-sm border border-slate-200/80">
                        <Latex>{normalizeLatexForKaTeX(m.content ?? '')}</Latex>
                      </div>
                      {Array.isArray(m.rag_sources) && m.rag_sources.length > 0 && (
                        <p className="text-[10px] font-bold text-indigo-600 px-2">
                          相关参考向量来源：{m.rag_sources.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-3xl rounded-bl-none pro-glass-card px-4 py-3 shadow-sm border border-slate-200">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  <span className="text-xs font-bold text-slate-600">DeepSeek AI 思考分析中…</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="shrink-0 border-t border-slate-200/80 bg-white/90 backdrop-blur-xl px-5 py-4">
          <div className="mx-auto flex max-w-3xl gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={loading ? 'AI 思考回复中…' : '输入数学疑问或题目解法，按 Enter 发送…'}
              disabled={loading}
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs font-bold text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !(input || '').trim()}
              className="btn-gradient-pro shrink-0 flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-black"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>发送提问</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
