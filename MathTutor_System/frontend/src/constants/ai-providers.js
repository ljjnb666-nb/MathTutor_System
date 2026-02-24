/**
 * AI 供应商预设配置：各服务商最新可用模型（2025）。
 * 模型 ID 以各平台 API 文档为准。
 */
export const PROVIDERS = [
  {
    label: 'DeepSeek (深度求索)',
    value: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiVersion: '',
    docUrl: 'https://api-docs.deepseek.com/',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek-V3 (通用对话)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek-R1 (深度思考/强推理)' },
    ],
  },
  {
    label: 'OpenRouter (Gemini 等·免直连)',
    value: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiVersion: 'v1',
    docUrl: 'https://openrouter.ai/docs',
    regionHint: '通过 OpenRouter 转发，无需代理、不受 Google 直连地区限制；需在 openrouter.ai 申请 API Key',
    models: [
      { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'google/gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'google/gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
  },
  {
    label: 'Google Gemini (官方)',
    value: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiVersion: 'v1beta',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models',
    regionHint: '部分地区需在服务器 .env 中配置 LLM_HTTPS_PROXY 代理后重启后端',
    models: [
      { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (预览·最强)' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (预览·均衡)' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (思维/长文本)' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (性价比)' },
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (极速)' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
  },
  {
    label: 'OpenAI (及兼容接口)',
    value: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiVersion: 'v1',
    docUrl: 'https://platform.openai.com/docs/models',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o (全能旗舰)' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (高性价比)' },
      { value: 'o1', label: 'o1 (深度推理)' },
      { value: 'o1-mini', label: 'o1-mini (推理·轻量)' },
    ],
  },
  {
    label: 'Anthropic Claude',
    value: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiVersion: 'v1',
    docUrl: 'https://docs.anthropic.com/en/api/models',
    models: [
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (编程/推理)' },
      { value: 'claude-opus-4-1', label: 'Claude Opus 4.1 (最强)' },
      { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (极速)' },
    ],
  },
  {
    label: 'Moonshot (Kimi)',
    value: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiVersion: 'v1',
    docUrl: 'https://platform.moonshot.cn/docs',
    models: [
      { value: 'moonshot-v1-8k', label: 'Moonshot V1 (8k)' },
      { value: 'moonshot-v1-32k', label: 'Moonshot V1 (32k)' },
      { value: 'moonshot-v1-128k', label: 'Moonshot V1 (128k)' },
    ],
  },
  {
    label: 'ZhipuAI (智谱清言)',
    value: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiVersion: 'v4',
    docUrl: 'https://open.bigmodel.cn/dev/api',
    models: [
      { value: 'glm-4-plus', label: 'GLM-4-Plus (旗舰)' },
      { value: 'glm-4', label: 'GLM-4' },
      { value: 'glm-4-flash', label: 'GLM-4 Flash (极速)' },
    ],
  },
  {
    label: 'Qwen (通义千问)',
    value: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiVersion: 'v1',
    docUrl: 'https://help.aliyun.com/zh/dashscope/developer-reference',
    models: [
      { value: 'qwen-max', label: 'Qwen-Max (旗舰)' },
      { value: 'qwen-plus', label: 'Qwen-Plus (均衡)' },
      { value: 'qwen-turbo', label: 'Qwen-Turbo (快速)' },
      { value: 'qwen-long', label: 'Qwen-Long (长文本)' },
    ],
  },
  {
    label: 'Custom (自定义)',
    value: 'custom',
    baseUrl: '',
    apiVersion: '',
    models: [],
  },
]

const STORAGE_KEY = 'app_settings'

const defaultSettings = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  apiVersion: '',
  showThinking: false,
  /** 按服务商分别保存的 API Key，切换服务商时恢复对应 Key */
  apiKeysByProvider: {},
  baseUrlsByProvider: {},
  apiVersionsByProvider: {},
}

export function getStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultSettings }
    const parsed = JSON.parse(raw)
    return { ...defaultSettings, ...parsed }
  } catch {
    return { ...defaultSettings }
  }
}

/**
 * 获取指定服务商已保存的 API Key（用于设置弹窗内切换服务商时回填）。
 * 仅当该服务商已保存过 Key、或就是当前选中的服务商时返回值；否则返回空，避免把别的服务商的 Key 显示出来。
 */
export function getApiKeyForProvider(providerValue) {
  const stored = getStoredSettings()
  const byProvider = stored.apiKeysByProvider || {}
  if (Object.prototype.hasOwnProperty.call(byProvider, providerValue))
    return byProvider[providerValue] ?? ''
  if (providerValue === (stored.provider ?? defaultSettings.provider))
    return stored.apiKey ?? ''
  return ''
}

/**
 * 获取指定服务商的 Base URL：优先该服务商已保存的值，否则当前全局或该服务商默认值。
 */
export function getBaseUrlForProvider(providerValue) {
  const stored = getStoredSettings()
  const p = getProviderByValue(providerValue)
  const byProvider = stored.baseUrlsByProvider || {}
  if (Object.prototype.hasOwnProperty.call(byProvider, providerValue))
    return byProvider[providerValue] ?? ''
  if (providerValue === (stored.provider ?? defaultSettings.provider))
    return (stored.baseUrl ?? p.baseUrl ?? '').trim()
  return (p.baseUrl ?? '').trim()
}

/**
 * 获取指定服务商的 API 版本：优先该服务商已保存的值，否则当前全局或该服务商默认值。
 */
export function getApiVersionForProvider(providerValue) {
  const stored = getStoredSettings()
  const p = getProviderByValue(providerValue)
  const byProvider = stored.apiVersionsByProvider || {}
  if (Object.prototype.hasOwnProperty.call(byProvider, providerValue))
    return byProvider[providerValue] ?? ''
  if (providerValue === (stored.provider ?? defaultSettings.provider))
    return stored.apiVersion ?? p.apiVersion ?? ''
  return p.apiVersion ?? ''
}

export function setStoredSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getProviderByValue(value) {
  return PROVIDERS.find((p) => p.value === value) ?? PROVIDERS.find((p) => p.value === 'deepseek') ?? PROVIDERS[0]
}
