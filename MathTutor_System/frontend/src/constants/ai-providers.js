/**
 * AI provider presets and current recommended model IDs.
 *
 * Notes:
 * - Keep model IDs aligned with provider docs.
 * - Prefer stable general-purpose text models first, then optional previews.
 */
export const PROVIDERS = [
  {
    label: 'DeepSeek (深度求索)',
    value: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiVersion: '',
    docUrl: 'https://api-docs.deepseek.com/',
    models: [
      { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (默认推荐)' },
      { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (高质量)' },
      { value: 'deepseek-chat', label: 'DeepSeek Chat (兼容别名，已弃用)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (兼容别名，已弃用)' },
    ],
  },
  {
    label: 'OpenRouter (免直连聚合)',
    value: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiVersion: 'v1',
    docUrl: 'https://openrouter.ai/docs',
    regionHint:
      '通过 OpenRouter 转发，无需单独处理部分官方直连限制；需要在 openrouter.ai 申请 API Key。',
    models: [
      { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
      { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    ],
  },
  {
    label: 'Google Gemini (官方)',
    value: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiVersion: 'v1beta',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models',
    regionHint:
      '部分地区可能需要在服务端 .env 中配置 LLM_HTTPS_PROXY 后再调用 Gemini 官方接口。',
    models: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (默认推荐)' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (复杂推理/代码)' },
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (低成本)' },
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    ],
  },
  {
    label: 'OpenAI (及兼容接口)',
    value: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiVersion: 'v1',
    docUrl: 'https://platform.openai.com/docs/models',
    models: [
      { value: 'gpt-4.1', label: 'GPT-4.1 (通用旗舰)' },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (默认推荐)' },
      { value: 'gpt-4o', label: 'GPT-4o (多模态通用)' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (高性价比)' },
      { value: 'o4-mini', label: 'o4-mini (推理向)' },
    ],
  },
  {
    label: 'Anthropic Claude',
    value: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiVersion: 'v1',
    docUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
    models: [
      { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (默认推荐)' },
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (高阶复杂任务)' },
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (轻量快速)' },
    ],
  },
  {
    label: 'Moonshot (Kimi)',
    value: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiVersion: 'v1',
    docUrl: 'https://platform.moonshot.cn/docs/api/chat',
    models: [
      { value: 'kimi-k2.6', label: 'Kimi K2.6 (默认推荐)' },
      { value: 'kimi-k2.7-code', label: 'Kimi K2.7 Code' },
      { value: 'kimi-k2.7-code-highspeed', label: 'Kimi K2.7 Code Highspeed' },
      { value: 'kimi-k2.5', label: 'Kimi K2.5' },
      { value: 'moonshot-v1', label: 'Moonshot V1 (兼容模型)' },
    ],
  },
  {
    label: 'ZhipuAI (智谱)',
    value: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiVersion: 'v4',
    docUrl: 'https://open.bigmodel.cn/dev/api',
    models: [
      { value: 'glm-5.2', label: 'GLM-5.2 (默认推荐)' },
      { value: 'glm-4-plus', label: 'GLM-4-Plus' },
      { value: 'glm-4-flash', label: 'GLM-4 Flash' },
    ],
  },
  {
    label: 'Qwen (通义千问)',
    value: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiVersion: 'v1',
    docUrl: 'https://help.aliyun.com/zh/model-studio/models',
    models: [
      { value: 'qwen3.7-max', label: 'Qwen 3.7 Max (默认推荐)' },
      { value: 'qwen3.7-plus', label: 'Qwen 3.7 Plus' },
      { value: 'qwen3.6-flash', label: 'Qwen 3.6 Flash' },
      { value: 'qwen-plus', label: 'Qwen Plus (兼容常用)' },
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
  model: 'deepseek-v4-flash',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  apiVersion: '',
  showThinking: false,
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

export function getApiKeyForProvider(providerValue) {
  const stored = getStoredSettings()
  const byProvider = stored.apiKeysByProvider || {}
  if (Object.prototype.hasOwnProperty.call(byProvider, providerValue))
    return byProvider[providerValue] ?? ''
  if (providerValue === (stored.provider ?? defaultSettings.provider))
    return stored.apiKey ?? ''
  return ''
}

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

export function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function getActiveLlmConfig(settings = getStoredSettings()) {
  const provider = getProviderByValue(settings.provider ?? defaultSettings.provider)
  const providerValue = provider.value
  const apiKeysByProvider = settings.apiKeysByProvider || {}
  const baseUrlsByProvider = settings.baseUrlsByProvider || {}
  const apiVersionsByProvider = settings.apiVersionsByProvider || {}

  const hasProviderKey = Object.prototype.hasOwnProperty.call(apiKeysByProvider, providerValue)
  const hasProviderBaseUrl = Object.prototype.hasOwnProperty.call(baseUrlsByProvider, providerValue)
  const hasProviderApiVersion = Object.prototype.hasOwnProperty.call(apiVersionsByProvider, providerValue)

  const apiKey = hasProviderKey ? apiKeysByProvider[providerValue] ?? '' : settings.apiKey ?? ''
  const baseUrl = hasProviderBaseUrl ? baseUrlsByProvider[providerValue] ?? '' : settings.baseUrl ?? provider.baseUrl ?? ''
  const apiVersion = hasProviderApiVersion
    ? apiVersionsByProvider[providerValue] ?? ''
    : settings.apiVersion ?? provider.apiVersion ?? ''

  return {
    provider: providerValue,
    model: settings.model ?? provider.models?.[0]?.value ?? '',
    apiKey: String(apiKey || '').trim(),
    baseUrl: normalizeBaseUrl(baseUrl),
    apiVersion: String(apiVersion || '').trim(),
    showThinking: Boolean(settings.showThinking),
  }
}

export function saveActiveLlmConfig(config) {
  const stored = getStoredSettings()
  const provider = getProviderByValue(config.provider ?? stored.provider ?? defaultSettings.provider)
  const providerValue = provider.value
  const next = {
    ...stored,
    provider: providerValue,
    model: config.model ?? provider.models?.[0]?.value ?? '',
    showThinking: Boolean(config.showThinking),
    apiKey: String(config.apiKey || '').trim(),
    baseUrl: normalizeBaseUrl(config.baseUrl ?? provider.baseUrl ?? ''),
    apiVersion: String(config.apiVersion ?? provider.apiVersion ?? '').trim(),
    apiKeysByProvider: {
      ...(stored.apiKeysByProvider || {}),
      [providerValue]: String(config.apiKey || '').trim(),
    },
    baseUrlsByProvider: {
      ...(stored.baseUrlsByProvider || {}),
      [providerValue]: normalizeBaseUrl(config.baseUrl ?? provider.baseUrl ?? ''),
    },
    apiVersionsByProvider: {
      ...(stored.apiVersionsByProvider || {}),
      [providerValue]: String(config.apiVersion ?? provider.apiVersion ?? '').trim(),
    },
  }
  setStoredSettings(next)
  return next
}
