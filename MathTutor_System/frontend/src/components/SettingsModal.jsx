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

export default function SettingsModal({ open, onClose }) {
  const [providerValue, setProviderValue] = useState('deepseek')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiVersion, setApiVersion] = useState('')
  const [showThinking, setShowThinking] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

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
  }

  const handleAutoFillBaseUrl = () => {
    setBaseUrl(provider.baseUrl ?? '')
  }

  const handleAutoFillApiVersion = () => {
    setApiVersion(provider.apiVersion ?? '')
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
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={0}
        aria-label="关闭"
      />
      <div
        className="relative w-full max-h-[90dvh] sm:max-h-[85vh] max-w-lg rounded-t-2xl sm:rounded-xl border border-gray-200 border-b-0 sm:border-b bg-white shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        {/* 顶部：标题 + 关闭（刘海安全区） */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 sm:px-5 py-3 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
        >
          <h2 id="settings-title" className="text-lg font-semibold text-gray-800">
            API 配置
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 -m-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-4 sm:px-5 py-4">
          {/* 服务商：按钮组，手机端加大触控区域 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              服务商
            </label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleProviderChange(p.value)}
                  className={`rounded-lg border px-3 py-2.5 min-h-[44px] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 touch-manipulation ${
                    providerValue === p.value
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                  }`}
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
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                打开 API 文档
              </a>
            )}
            {provider.regionHint && (
              <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                {provider.regionHint}
              </p>
            )}
          </div>

          {/* 模型：按钮组 + 自定义输入 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              模型
            </label>
            <div className="flex flex-wrap gap-2">
              {(provider.models ?? []).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setModel(m.value)}
                  className={`rounded-lg border px-3 py-2.5 min-h-[44px] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 touch-manipulation ${
                    model === m.value
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                  }`}
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
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 min-h-[44px] text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="请输入 API Key"
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 min-h-[44px] pl-3 pr-12 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 touch-manipulation"
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

          {/* Base URL + 自动填充（手机端上下排列） */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Base URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="例如 https://api.openai.com/v1"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 min-h-[44px] text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <button
                type="button"
                onClick={handleAutoFillBaseUrl}
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 min-h-[44px] text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600/20 touch-manipulation sm:text-xs"
              >
                自动填充
              </button>
            </div>
          </div>

          {/* API 版本 + 自动填充 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              API 版本
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <input
                type="text"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                placeholder="如 v1 或 v1beta"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 min-h-[44px] text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <button
                type="button"
                onClick={handleAutoFillApiVersion}
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 min-h-[44px] text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600/20 touch-manipulation sm:text-xs"
              >
                自动填充
              </button>
            </div>
          </div>

          {/* 调试选项（加大点击区域） */}
          <label className="flex cursor-pointer items-center gap-3 py-2 -mx-1 rounded-lg hover:bg-gray-50 active:bg-gray-100 touch-manipulation">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-600 shrink-0"
            />
            <span className="text-sm text-gray-700">显示 AI 思考过程</span>
          </label>
        </div>

        {/* 底部按钮：手机端全宽、上下排列，底部安全区（避开横条） */}
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-gray-200 px-4 sm:px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 min-h-[48px] text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 touch-manipulation w-full sm:w-auto"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-blue-600 px-4 py-3 min-h-[48px] text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 touch-manipulation w-full sm:w-auto"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
