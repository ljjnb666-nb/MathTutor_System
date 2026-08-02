import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import Latex from 'react-latex-next'
import { AlertCircle, Bot, Check, FileText, Loader2, MessageCircle, Pencil, Pin, PinOff, Plus, RefreshCw, Send, Trash2, User, X } from 'lucide-react'
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
  const [sessionsError, setSessionsError] = useState('')
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [useStream, setUseStream] = useState(true)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [chatError, setChatError] = useState('')
  const [retryText, setRetryText] = useState('')
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
    setSessionsError('')
    try {
      const list = await getChatSessions()
      setSessions(Array.isArray(list) ? list : [])
    } catch (err) {
      setSessionsError(err?.response?.data?.detail || err?.message || '会话列表加载失败')
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
      setChatError('')
    } catch (e) {
      toast.error('加载会话失败')
      setChatError(e?.response?.data?.detail || e?.message || '加载会话失败')
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
            if (data?.error) {
              setChatError(data.error)
              toast.error(data.error)
              setMessages((m) => {
                const next = [...m]
                const last = next[next.length - 1]
                if (last?.role === 'assistant' && !(last.content || '').trim()) return next.slice(0, -1)
                return next
              })
              return
            }
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

  const handleSend = async (textOverride) => {
    const text = (typeof textOverride === 'string' ? textOverride : input || '').trim()
    if (!text || loading) return
    setInput('')
    setChatError('')
    setRetryText(text)
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
          if (data?.error) {
            setChatError(data.error)
            toast.error(data.error)
            setMessages((m) => {
              const next = [...m]
              const last = next[next.length - 1]
              if (last?.role === 'assistant' && !(last.content || '').trim()) return next.slice(0, -1)
              return next
            })
            return
          } else {
            setRetryText('')
          }
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
      setChatError(msg)
      toast.error(msg)
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  const quickQuestions = ['这道题的第一步怎么想？', '帮我拆解学生错因', '把解题步骤改得更适合初中生']

  return (
    <div className="v2-chat-shell">
      <aside className="v2-chat-sessions">
        <div className="v2-chat-panel-head">
          <div>
            <span>会话列表</span>
            <strong>{sessions.length}</strong>
          </div>
          <button type="button" className="v2-icon-button" onClick={() => loadSession(null)} aria-label="新会话">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="v2-chat-session-list">
          {sessionsLoading ? (
            <div className="v2-chat-state"><Loader2 className="h-5 w-5 animate-spin" /><span>加载会话中</span></div>
          ) : sessionsError ? (
            <div className="v2-chat-state error">
              <AlertCircle className="h-5 w-5" />
              <span>{sessionsError}</span>
              <button type="button" className="v2-btn-secondary" onClick={fetchSessions}>重试</button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="v2-chat-state">
              <MessageCircle className="h-8 w-8" />
              <span>暂无历史会话</span>
              <p>发送消息后由现有接口归档。</p>
            </div>
          ) : sessions.map((session) => (
            <div key={session.id} className={`v2-chat-session ${currentSessionId === session.id ? 'active' : ''}`}>
              <button type="button" onClick={() => loadSession(session.id)}>
                <span>{session.pinned && <Pin className="h-3.5 w-3.5" />}{session.title || '新对话记录'}</span>
                <small>{formatSessionDate(session.created_at)}</small>
              </button>
              <div>
                <button type="button" className="v2-icon-button" onClick={(event) => handleTogglePin(session.id, session.pinned, event)} aria-label={session.pinned ? '取消固定' : '固定到顶部'}>
                  {session.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
                <button type="button" className="v2-icon-button danger" onClick={(event) => handleDeleteSession(session.id, event)} aria-label="删除会话">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="v2-chat-main">
        <header className="v2-chat-header">
          <div className="v2-chat-title">
            <span><MessageCircle className="h-5 w-5" /></span>
            <div>
              <h1>AI 智能辅导对话</h1>
              <p>围绕当前消息、学生上下文和知识点调用现有对话接口。</p>
            </div>
          </div>
          <div className="v2-chat-switches">
            <label><input type="checkbox" checked={useStream} onChange={(event) => setUseStream(event.target.checked)} />流式回复</label>
            <label><input type="checkbox" checked={useContext} onChange={(event) => setUseContext(event.target.checked)} />学生上下文</label>
          </div>
        </header>

        <div ref={listRef} className="v2-chat-messages">
          {messages.length === 0 ? (
            <div className="v2-chat-empty">
              <Bot className="h-10 w-10" />
              <h2>空会话</h2>
              <p>输入问题后开始对话；这里不展示伪造历史消息。</p>
              <div>
                {quickQuestions.map((question) => (
                  <button key={question} type="button" onClick={() => setInput(question)}>{question}</button>
                ))}
              </div>
            </div>
          ) : messages.map((message, index) => (
            <article key={message.id ?? index} className={`v2-chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}>
              <span className="v2-chat-avatar">{message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>
              <div className="v2-chat-bubble">
                {editingMessageId === message.id ? (
                  <div className="v2-chat-edit">
                    <textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} rows={4} />
                    <div>
                      <button type="button" className="v2-btn-secondary" onClick={handleCancelEdit}><X className="h-4 w-4" />取消</button>
                      <button type="button" className="v2-btn-primary" onClick={handleSaveEdit}><Check className="h-4 w-4" />保存并重新生成</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {message.role === 'assistant' ? <Latex>{normalizeLatexForKaTeX(message.content ?? '')}</Latex> : message.content}
                    {Array.isArray(message.rag_sources) && message.rag_sources.length > 0 && (
                      <p className="v2-chat-sources">参考来源：{message.rag_sources.join(' · ')}</p>
                    )}
                    {message.id && message.role === 'user' && (
                      <button type="button" className="v2-chat-edit-button" onClick={() => handleStartEdit(message)}>
                        <Pencil className="h-3.5 w-3.5" />编辑
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}

          {loading && (
            <div className="v2-chat-loading">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI 正在回复</span>
            </div>
          )}
        </div>

        {chatError && (
          <div className="v2-chat-error" role="alert">
            <AlertCircle className="h-4 w-4" />
            <span>{chatError}</span>
            {retryText && <button type="button" onClick={() => handleSend(retryText)}>重试</button>}
          </div>
        )}

        <footer className="v2-chat-composer">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && handleSend()}
            disabled={loading}
            placeholder={loading ? 'AI 回复中...' : '输入数学疑问或题目解法，按 Enter 发送'}
          />
          <button type="button" className="v2-btn-primary" onClick={() => handleSend()} disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            发送
          </button>
        </footer>
      </main>

      <aside className="v2-chat-context">
        <section>
          <h2>上下文</h2>
          <label className="v2-field">
            <span>学生</span>
            <input value={currentStudent?.name || '未选择学生'} readOnly />
          </label>
          <label className="v2-field">
            <span>知识点</span>
            <input value={knowledgePoint} onChange={(event) => setKnowledgePoint(event.target.value)} disabled={!useContext} placeholder="如：二次函数" />
          </label>
          <label className="v2-field">
            <span>题目上下文</span>
            <textarea rows={5} value={contextQuestion} onChange={(event) => setContextQuestion(event.target.value)} placeholder="可选：粘贴已有题目或错题文本" />
          </label>
        </section>
        <section>
          <h2>当前状态</h2>
          <div className="v2-chat-context-stat"><FileText className="h-4 w-4" /><span>消息数</span><strong>{messages.length}</strong></div>
          <div className="v2-chat-context-stat"><RefreshCw className="h-4 w-4" /><span>回复模式</span><strong>{useStream ? '流式' : '普通'}</strong></div>
          <div className="v2-chat-context-stat"><User className="h-4 w-4" /><span>学生上下文</span><strong>{useContext ? '启用' : '关闭'}</strong></div>
        </section>
      </aside>
    </div>
  )
}
