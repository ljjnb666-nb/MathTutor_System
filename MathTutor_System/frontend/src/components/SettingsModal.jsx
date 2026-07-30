import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Eye, EyeOff, RefreshCw, Trash2, X } from 'lucide-react'
import {
  PROVIDERS,
  getApiKeyForProvider,
  getApiVersionForProvider,
  getBaseUrlForProvider,
  getProviderByValue,
  getStoredSettings,
  setStoredSettings,
} from '../constants/ai-providers'
import { buildLlmHeadersFromSettings, shouldSendClientLlmHeaders } from '../services/httpClient'
import { getLlmStatus, testLlmConnection } from '../services/llmApi'

function statusText(status, frontendAllowsClientConfig) {
  if (!status) return '正在读取模型配置状态...'
  if (!frontendAllowsClientConfig) return '当前环境由服务器统一配置模型，浏览器端配置不会生效。'
  if (!status.client_config_allowed) return '后端未开启客户端模型配置，当前浏览器配置不会用于生成请求。'
  return '模型配置已保存到当前浏览器。生成请求将使用该配置。'
}

function resultClass(result) {
  if (!result) return 'border-gray-200 bg-gray-50 text-gray-700'
  return result.success ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
}

export default function SettingsModal({ open, onClose }) {
  const [providerValue, setProviderValue] = useState('deepseek')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiVersion, setApiVersion] = useState('')
  const [showThinking, setShowThinking] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  const provider = getProviderByValue(providerValue)
  const displayModel = customModel.trim() || model
  const frontendAllowsClientConfig = shouldSendClientLlmHeaders()
  const clientInputsDisabled = !frontendAllowsClientConfig

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
    setShowApiKey(false)
    setSaveMessage('')
    setTestResult(null)
    setStatusError('')
    getLlmStatus()
      .then(setStatus)
      .catch(() => setStatusError('无法读取服务器模型状态，请稍后重试。'))
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const handleProviderChange = (value) => {
    const nextProvider = getProviderByValue(value)
    setProviderValue(value)
    setBaseUrl(getBaseUrlForProvider(value))
    setApiVersion(getApiVersionForProvider(value))
    setModel(nextProvider.models?.[0]?.value ?? '')
    setCustomModel('')
    setApiKey(getApiKeyForProvider(value))
    setSaveMessage('')
    setTestResult(null)
  }

  const currentSettings = () => ({
    provider: providerValue,
    model: displayModel,
    apiKey,
    baseUrl: baseUrl.trim(),
    apiVersion: apiVersion.trim(),
  })

  const handleSave = () => {
    const stored = getStoredSettings()
    const apiKeysByProvider = { ...(stored.apiKeysByProvider || {}), [providerValue]: apiKey }
    const baseUrlsByProvider = { ...(stored.baseUrlsByProvider || {}), [providerValue]: baseUrl.trim() }
    const apiVersionsByProvider = { ...(stored.apiVersionsByProvider || {}), [providerValue]: apiVersion.trim() }
    setStoredSettings({
      ...stored,
      ...currentSettings(),
      showThinking,
      apiKeysByProvider,
      baseUrlsByProvider,
      apiVersionsByProvider,
    })
    setSaveMessage(statusText(status, frontendAllowsClientConfig))
  }

  const handleClear = () => {
    setApiKey('')
    setSaveMessage('已清除当前服务商在本浏览器保存的 API Key。')
    const stored = getStoredSettings()
    const apiKeysByProvider = { ...(stored.apiKeysByProvider || {}) }
    delete apiKeysByProvider[providerValue]
    setStoredSettings({ ...stored, apiKey: '', apiKeysByProvider })
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const headers = frontendAllowsClientConfig ? buildLlmHeadersFromSettings(currentSettings()) || {} : {}
      const result = await testLlmConnection(headers)
      setTestResult({ ...result, testedAt: new Date().toLocaleString() })
    } catch {
      setTestResult({
        success: false,
        code: 'LLM_CONNECTION_FAILED',
        message: '模型测试请求失败，请检查后端服务是否可用。',
        testedAt: new Date().toLocaleString(),
      })
    } finally {
      setTesting(false)
    }
  }

  if (!open) return null

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl border border-gray-200 bg-white shadow-xl sm:max-h-[85vh] sm:rounded-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-lg font-semibold text-gray-800">API 配置</h2>
          <button type="button" onClick={onClose} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <div>运行环境：{status?.environment || 'unknown'}</div>
            <div>配置来源：{frontendAllowsClientConfig && status?.client_config_allowed ? '当前浏览器' : '服务器环境变量'}</div>
            <div>服务器模型：{status?.configured ? `${status.provider || '-'} / ${status.model || '-'}` : '未配置'}</div>
            <div>客户端配置：{frontendAllowsClientConfig && status?.client_config_allowed ? '已允许' : '未启用'}</div>
            <p className="mt-2 text-xs">{statusError || statusText(status, frontendAllowsClientConfig)}</p>
          </div>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            此配置仅保存在当前浏览器中，仅建议用于本地开发环境。请勿在公共设备中使用。
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">服务商</label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={clientInputsDisabled}
                  onClick={() => handleProviderChange(item.value)}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium ${
                    providerValue === item.value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700'
                  } disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {provider.docUrl && (
              <a href={provider.docUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                打开 API 文档
              </a>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">模型</label>
            <div className="flex flex-wrap gap-2">
              {(provider.models ?? []).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={clientInputsDisabled}
                  onClick={() => setModel(item.value)}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium ${
                    model === item.value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700'
                  } disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              disabled={clientInputsDisabled}
              value={customModel}
              onChange={(event) => setCustomModel(event.target.value)}
              placeholder="或自定义模型名称"
              className="mt-2 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                disabled={clientInputsDisabled}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={clientInputsDisabled ? '生产环境禁用浏览器端 API Key' : '请输入 API Key'}
                className="min-h-[44px] w-full rounded-lg border border-gray-300 py-2 pl-3 pr-12 text-sm text-gray-800 placeholder-gray-400 disabled:bg-gray-100"
              />
              <button type="button" disabled={clientInputsDisabled} onClick={() => setShowApiKey((value) => !value)} className="absolute right-2 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded p-2 text-gray-500 hover:bg-gray-100 disabled:text-gray-300" aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Base URL</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="url" disabled={clientInputsDisabled} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="例如 https://api.openai.com/v1" className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 disabled:bg-gray-100" />
              <button type="button" disabled={clientInputsDisabled} onClick={() => setBaseUrl(provider.baseUrl ?? '')} className="min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:bg-gray-100 disabled:text-gray-400">
                自动填充
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">API 版本</label>
            <input type="text" disabled={clientInputsDisabled} value={apiVersion} onChange={(event) => setApiVersion(event.target.value)} placeholder="如 v1 或 v1beta" className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 disabled:bg-gray-100" />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg py-2 hover:bg-gray-50">
            <input type="checkbox" checked={showThinking} onChange={(event) => setShowThinking(event.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">显示 AI 思考过程</span>
          </label>

          {saveMessage && <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{saveMessage}</div>}
          {testResult && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${resultClass(testResult)}`}>
              <div>{testResult.message}</div>
              <div className="mt-1 text-xs">代码：{testResult.code || 'OK'}；时间：{testResult.testedAt}</div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-200 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <button type="button" onClick={handleClear} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Trash2 className="h-4 w-4" />
            清除本地配置
          </button>
          <button type="button" onClick={handleTest} disabled={testing} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:text-blue-300">
            <RefreshCw className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
            测试连接
          </button>
          <button type="button" onClick={handleSave} className="min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700">
            保存配置
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
