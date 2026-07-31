import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, EyeOff, ExternalLink } from 'lucide-react'
import {
  PROVIDERS,
  getStoredSettings,
  setStoredSettings,
  getProviderByValue,
  getApiKeyForProvider,
  getBaseUrlForProvider,
  getApiVersionForProvider,
} from '../constants/ai-providers'
import { testLlmApiKey } from '../services/toolsApi'

export default function SettingsModal({ open, onClose }) {
  const [providerValue, setProviderValue] = useState('deepseek')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiVersion, setApiVersion] = useState('')
  const [showThinking, setShowThinking] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [testStatus, setTestStatus] = useState(null)
  const [testingKey, setTestingKey] = useState(false)

  const provider = getProviderByValue(providerValue)
  const displayModel = customModel.trim() || model

  useEffect(() => {
    if (!open) return
    const stored = getStoredSettings()
    const p = getProviderByValue(stored.provider ?? 'deepseek')
    setProviderValue(p.value)
    setModel(stored.model ?? p.models?.[0]?.value ?? '')
    setCustomModel('')
    setApiKey(getApiKeyForProvider(p.value))
    setBaseUrl(getBaseUrlForProvider(p.value))
    setApiVersion(getApiVersionForProvider(p.value))
    setShowThinking(Boolean(stored.showThinking))
    setTestStatus(null)
  }, [open])

  // 手机端打开时禁止背景滚动，关闭时恢复
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const handleProviderChange = (v) => {
    setProviderValue(v)
    const p = getProviderByValue(v)
    setBaseUrl(getBaseUrlForProvider(v))
    setApiVersion(getApiVersionForProvider(v))
    setModel(p.models?.[0]?.value ?? '')
    setCustomModel('')
    setApiKey(getApiKeyForProvider(v))
    setTestStatus(null)
  }

  const handleAutoFillBaseUrl = () => {
    setBaseUrl(provider.baseUrl ?? '')
  }

  const handleAutoFillApiVersion = () => {
    setApiVersion(provider.apiVersion ?? '')
  }

  const handleTestApiKey = async () => {
    setTestingKey(true)
    setTestStatus(null)
    try {
      const result = await testLlmApiKey({
        provider: providerValue,
        apiKey,
        baseUrl: baseUrl.trim(),
        model: displayModel,
      })
      setTestStatus(result)
    } catch (err) {
      setTestStatus({
        ok: false,
        message: err.response?.data?.detail || err.response?.data?.message || err.message || '测试失败',
      })
    } finally {
      setTestingKey(false)
    }
  }

  const handleSave = () => {
    const stored = getStoredSettings()
    const apiKeysByProvider = { ...(stored.apiKeysByProvider || {}), [providerValue]: apiKey }
    const baseUrlsByProvider = { ...(stored.baseUrlsByProvider || {}), [providerValue]: baseUrl.trim() }
    const apiVersionsByProvider = { ...(stored.apiVersionsByProvider || {}), [providerValue]: apiVersion.trim() }
    setStoredSettings({
      ...stored,
      provider: providerValue,
      model: displayModel,
      apiKey,
      baseUrl: baseUrl.trim(),
      apiVersion: apiVersion.trim(),
      showThinking,
      apiKeysByProvider,
      baseUrlsByProvider,
      apiVersionsByProvider,
    })
    onClose?.()
  }

  if (!open) return null

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-0 sm:p-4">
      {/* 安全区：整块遮罩铺满，弹窗内用 padding 避开刘海/横条 */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--color-bg-overlay)' }}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={0}
        aria-label="关闭"
      />
      <div
        className="relative w-full max-h-[90dvh] sm:max-h-[85vh] max-w-lg rounded-t-2xl sm:rounded-xl border-b-0 sm:border-b shadow-xl flex flex-col"
        style={{
          border: '1px solid var(--color-border-primary)',
          backgroundColor: 'var(--color-bg-card)'
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        {/* 顶部：标题 + 关闭（刘海安全区） */}
        <div
          className="flex shrink-0 items-center justify-between px-4 sm:px-5 py-3 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
          style={{ borderBottom: '1px solid var(--color-border-primary)' }}
        >
          <h2 id="settings-title" className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            API 配置
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 -m-2 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
              e.currentTarget.style.color = 'var(--color-text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-4 sm:px-5 py-4">
          {/* 服务商：按钮组，手机端加大触控区域 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              服务商
            </label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleProviderChange(p.value)}
                  className="rounded-lg border px-3 py-2.5 min-h-[44px] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 touch-manipulation"
                  style={
                    providerValue === p.value
                      ? {
                          border: '1px solid var(--color-primary-600)',
                          backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
                          color: 'var(--color-primary-700)'
                        }
                      : {
                          border: '1px solid var(--color-border-primary)',
                          backgroundColor: 'var(--color-bg-card)',
                          color: 'var(--color-text-primary)'
                        }
                  }
                  onMouseEnter={(e) => {
                    if (providerValue !== p.value) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (providerValue !== p.value) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                    }
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {provider.docUrl && (
              <a
                href={provider.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs hover:underline"
                style={{ color: 'var(--color-primary-600)' }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                打开 API 文档
              </a>
            )}
            {provider.regionHint && (
              <p className="mt-1.5 text-xs rounded px-2 py-1.5" style={{ color: '#92400e', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                {provider.regionHint}
              </p>
            )}
          </div>

          {/* 模型：按钮组 + 自定义输入 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              模型
            </label>
            <div className="flex flex-wrap gap-2">
              {(provider.models ?? []).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setModel(m.value)}
                  className="rounded-lg border px-3 py-2.5 min-h-[44px] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 touch-manipulation"
                  style={
                    model === m.value
                      ? {
                          border: '1px solid var(--color-primary-600)',
                          backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
                          color: 'var(--color-primary-700)'
                        }
                      : {
                          border: '1px solid var(--color-border-primary)',
                          backgroundColor: 'var(--color-bg-card)',
                          color: 'var(--color-text-primary)'
                        }
                  }
                  onMouseEnter={(e) => {
                    if (model !== m.value) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (model !== m.value) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                    }
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="或自定义模型名"
              className="mt-2 w-full rounded-lg px-3 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2"
              style={{
                border: '1px solid var(--color-border-primary)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)'
              }}
            />
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="请输入 API Key"
                className="w-full rounded-lg py-2.5 min-h-[44px] pl-3 pr-12 text-sm focus:outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)'
                }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors touch-manipulation"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }}
                aria-label={showApiKey ? '隐藏' : '显示'}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleTestApiKey}
              disabled={testingKey || !apiKey.trim() || !displayModel.trim()}
              className="rounded-lg border px-3 py-2.5 min-h-[44px] text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                border: '1px solid var(--color-primary-300)',
                backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
                color: 'var(--color-primary-700)'
              }}
            >
              {testingKey ? '测试中...' : '测试 API Key'}
            </button>
            {testStatus && (
              <p
                className="rounded-lg border px-3 py-2 text-xs"
                style={
                  testStatus.ok
                    ? {
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        backgroundColor: 'color-mix(in srgb, #10b981 10%, var(--color-bg-card))',
                        color: '#047857'
                      }
                    : {
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        backgroundColor: 'color-mix(in srgb, #ef4444 10%, var(--color-bg-card))',
                        color: '#b91c1c'
                      }
                }
              >
                {testStatus.ok
                  ? `可用：${testStatus.provider || providerValue} / ${testStatus.model || displayModel}，${testStatus.latency_ms ?? 0}ms`
                  : `不可用：${testStatus.message || '请检查 API Key、Base URL 和模型名称'}`}
              </p>
            )}
          </div>

          {/* Base URL + 自动填充（手机端上下排列） */}
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Base URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="例如 https://api.openai.com/v1"
                className="flex-1 rounded-lg px-3 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)'
                }}
              />
              <button
                type="button"
                onClick={handleAutoFillBaseUrl}
                className="shrink-0 rounded-lg px-3 py-2.5 min-h-[44px] text-sm font-medium focus:outline-none focus:ring-2 touch-manipulation sm:text-xs transition-colors"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                }}
              >
                自动填充
              </button>
            </div>
          </div>

          {/* API 版本 + 自动填充 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              API 版本
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <input
                type="text"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                placeholder="如 v1 或 v1beta"
                className="flex-1 rounded-lg px-3 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)'
                }}
              />
              <button
                type="button"
                onClick={handleAutoFillApiVersion}
                className="shrink-0 rounded-lg px-3 py-2.5 min-h-[44px] text-sm font-medium focus:outline-none focus:ring-2 touch-manipulation sm:text-xs transition-colors"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                }}
              >
                自动填充
              </button>
            </div>
          </div>

          {/* 调试选项（加大点击区域） */}
          <label className="flex cursor-pointer items-center gap-3 py-2 -mx-1 rounded-lg transition-colors touch-manipulation"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
              className="h-5 w-5 rounded shrink-0"
              style={{
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-primary-600)'
              }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>显示 AI 思考过程</span>
          </label>
        </div>

        {/* 底部按钮：手机端全宽、上下排列，底部安全区（避开横条） */}
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 px-4 sm:px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4"
          style={{ borderTop: '1px solid var(--color-border-primary)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-3 min-h-[48px] text-sm font-medium focus:outline-none focus:ring-2 touch-manipulation w-full sm:w-auto transition-colors"
            style={{
              border: '1px solid var(--color-border-primary)',
              backgroundColor: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl px-4 py-3 min-h-[48px] text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 touch-manipulation w-full sm:w-auto transition-colors"
            style={{ backgroundColor: 'var(--color-primary-600)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
            }}
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
