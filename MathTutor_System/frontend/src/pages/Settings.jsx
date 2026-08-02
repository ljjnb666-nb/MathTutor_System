import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Database,
  Eye,
  EyeOff,
  Key,
  Lock,
  Loader2,
  MonitorCog,
  Palette,
  Save,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  PROVIDERS,
  getApiKeyForProvider,
  getBaseUrlForProvider,
  getProviderByValue,
  getStoredSettings,
  saveActiveLlmConfig,
} from '../constants/ai-providers'
import { buildLlmHeadersFromConfig, shouldSendClientLlmHeaders } from '../services/httpClient'
import { testLlmConnection } from '../services/llmApi'
import { applyTheme } from '../utils/theme'
import { PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

const accentOptions = [
  ['indigo', '靛蓝'],
  ['purple', '紫色'],
  ['blue', '蓝色'],
  ['green', '绿色'],
]

const densityOptions = [
  ['compact', '紧凑'],
  ['comfortable', '舒适'],
  ['spacious', '宽松'],
]

const themeOptions = [
  ['dark', '深色'],
  ['light', '浅色'],
  ['auto', '跟随系统'],
]

const navItems = [
  { id: 'profile', label: '个人资料', icon: User },
  { id: 'appearance', label: '系统外观', icon: Palette },
  { id: 'ai', label: 'AI 本地偏好', icon: Key },
  { id: 'local', label: '数据与隐私', icon: Database },
]

export default function Settings() {
  const { user } = useAuth()
  const [theme, setTheme] = useState('dark')
  const [accentColor, setAccentColor] = useState('indigo')
  const [density, setDensity] = useState('comfortable')
  const [providerValue, setProviderValue] = useState('deepseek')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showThinking, setShowThinking] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [notice, setNotice] = useState('')
  const [apiTestState, setApiTestState] = useState({ status: 'idle', message: '' })
  const [activeSection, setActiveSection] = useState('profile')

  const provider = getProviderByValue(providerValue)
  const isCustomProvider = provider.value === 'custom'
  const maskedKey = useMemo(() => maskApiKey(apiKey), [apiKey])

  useEffect(() => {
    const stored = getStoredSettings()
    const initialProvider = getProviderByValue(stored.provider ?? 'deepseek')
    const savedTheme = localStorage.getItem('ui_theme') || 'dark'
    const savedAccent = localStorage.getItem('ui_accent') || 'indigo'
    const savedDensity = localStorage.getItem('ui_density') || 'comfortable'

    setProviderValue(initialProvider.value)
    setModel(stored.model ?? initialProvider.models?.[0]?.value ?? '')
    setApiKey(getApiKeyForProvider(initialProvider.value))
    setBaseUrl(getBaseUrlForProvider(initialProvider.value))
    setShowThinking(Boolean(stored.showThinking))
    setTheme(savedTheme)
    setAccentColor(savedAccent)
    setDensity(savedDensity)

    applyTheme(savedTheme)
    document.documentElement.dataset.accent = savedAccent
    document.documentElement.dataset.density = savedDensity
  }, [])

  useEffect(() => {
    const safeMessage = safeApiErrorMessage(apiTestState.message, { apiKey, baseUrl })
    if (safeMessage !== apiTestState.message) {
      setApiTestState((state) => ({ ...state, message: safeMessage }))
    }
  }, [apiKey, apiTestState.message, baseUrl])

  function handleProviderChange(value) {
    const nextProvider = getProviderByValue(value)
    setProviderValue(nextProvider.value)
    setModel(nextProvider.models?.[0]?.value ?? '')
    setApiKey(getApiKeyForProvider(nextProvider.value))
    setBaseUrl(getBaseUrlForProvider(nextProvider.value))
    setNotice('')
    setApiTestState({ status: 'idle', message: '' })
  }

  function handleSaveAppearance() {
    localStorage.setItem('ui_theme', theme)
    localStorage.setItem('ui_accent', accentColor)
    localStorage.setItem('ui_density', density)
    applyTheme(theme)
    document.documentElement.dataset.accent = accentColor
    document.documentElement.dataset.density = density
    setNotice('外观设置已保存')
  }

  function handleSaveAI() {
    saveActiveLlmConfig({
      provider: providerValue,
      model,
      showThinking,
      apiKey,
      baseUrl,
      apiVersion: provider.apiVersion ?? '',
    })
    setNotice('AI 偏好已保存到当前浏览器')
  }

  async function handleTestApiKey() {
    if (!shouldSendClientLlmHeaders()) {
      setApiTestState({
        status: 'error',
        message: '当前部署未启用浏览器 API Key 模式，请由管理员配置后端密钥',
      })
      return
    }
    const config = {
      provider: providerValue,
      model,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      apiVersion: provider.apiVersion ?? '',
    }
    if (!config.apiKey) {
      setApiTestState({ status: 'error', message: '请先填写 API Key' })
      return
    }
    saveActiveLlmConfig({ ...config, showThinking })
    setApiTestState({ status: 'testing', message: '正在通过后端测试当前 API Key...' })
    try {
      const result = await testLlmConnection(buildLlmHeadersFromConfig(config) || {})
      if (result?.ok || result?.success) {
        setApiTestState({
          status: 'success',
          message: `测试通过，${result.provider || providerValue} / ${result.model || model} 可用`,
        })
      } else {
        setApiTestState({ status: 'error', message: result?.message || '测试失败，请检查 API 配置' })
      }
    } catch (error) {
      const detail = error?.response?.data?.detail
      setApiTestState({
        status: 'error',
        message: typeof detail === 'string' ? detail : error?.response?.data?.message || error?.message || '测试失败，请检查 API 配置',
      })
    }
  }

  function handleClearLocalConfig() {
    if (!window.confirm('确定要清除所有本地配置吗？')) return
    localStorage.removeItem('app_settings')
    localStorage.removeItem('ui_theme')
    localStorage.removeItem('ui_accent')
    localStorage.removeItem('ui_density')
    setNotice('本地配置已清除')
  }

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="系统设置"
        description="管理账户信息、主题外观、AI 本地偏好和浏览器本地配置。"
        icon={MonitorCog}
        meta={<StatusBadge tone="primary">V2 设置台</StatusBadge>}
      />

      {notice && (
        <div role="status" className="v2-settings-notice">
          <ShieldCheck className="h-4 w-4" />
          <span>{notice}</span>
        </div>
      )}

      <div className="v2-settings-layout">
        <aside className="v2-settings-nav" aria-label="设置分类">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeSection === item.id ? 'is-active' : ''}
              onClick={() => setActiveSection(item.id)}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          ))}
        </aside>

        <main className="v2-settings-main">
          <SectionCard title="个人资料" description="查看当前登录账户，不在 UI 重构中新增账户编辑能力。">
            <div className="v2-settings-info-grid">
              <InfoTile label="用户名" value={user?.username || '-'} />
              <InfoTile label="角色" value={user?.role === 'admin' ? '管理员' : '教师'} />
              <InfoTile label="账号能力" value={user?.role === 'admin' ? '系统管理' : '教师工作台'} />
            </div>
          </SectionCard>

          <SectionCard title="系统外观" description="主题、强调色和布局密度保存在当前浏览器。">
            <div className="v2-settings-control-grid">
              <SelectField label="主题模式" value={theme} onChange={setTheme} options={themeOptions} />
              <SelectField label="强调色" value={accentColor} onChange={setAccentColor} options={accentOptions} />
              <SelectField label="布局密度" value={density} onChange={setDensity} options={densityOptions} />
            </div>
            <div className="v2-settings-preview" data-testid="appearance-preview">
              <span>当前预览</span>
              <strong>{themeLabel(theme)} · {optionLabel(accentOptions, accentColor)} · {optionLabel(densityOptions, density)}</strong>
            </div>
            <ActionButton onClick={handleSaveAppearance}>保存外观设置</ActionButton>
          </SectionCard>

          <SectionCard title="AI 本地偏好" description="保存到 localStorage，测试会走与聊天一致的后端配置链路。">
            <div className="v2-settings-control-grid two">
              <SelectField
                label="默认 Provider"
                value={providerValue}
                onChange={handleProviderChange}
                options={PROVIDERS.map((item) => [item.value, item.label])}
              />
              <SelectField
                label="默认模型"
                value={model}
                onChange={setModel}
                options={(provider.models || []).map((item) => [item.value, item.label])}
              />
            </div>
            <div className="v2-settings-control-grid two">
              <TextField
                label="Base URL"
                value={baseUrl}
                onChange={setBaseUrl}
                placeholder={provider.baseUrl || ''}
                disabled={!isCustomProvider}
              />
              <div>
                <label className="v2-settings-label" htmlFor="settings-api-key">API Key</label>
                <div className="v2-settings-secret">
                  <input
                    id="settings-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`输入 ${provider.label} API Key`}
                  />
                  <button
                    type="button"
                    aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    onClick={() => setShowApiKey((value) => !value)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="v2-settings-secret-mask" data-testid="api-key-mask">
                  当前保存值：{maskedKey || '未填写'}
                </p>
              </div>
            </div>
            <p className="v2-settings-help" data-testid="base-url-security-hint">
              {isCustomProvider
                ? 'Custom Base URL requires backend ALLOW_CUSTOM_LLM_BASE_URL and CLIENT_LLM_ALLOWED_HOSTS.'
                : 'Preset providers use the official Base URL; arbitrary browser Base URLs are rejected by the backend.'}
            </p>
            <label className="v2-settings-toggle">
              <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} />
              <span>显示 AI 思考过程</span>
            </label>
            {apiTestState.message && (
              <p className={`v2-settings-test-result is-${apiTestState.status}`} role="status" data-testid="api-key-test-result">
                {apiTestState.message}
              </p>
            )}
            <div className="v2-settings-ai-actions">
              <ActionButton onClick={handleSaveAI}>保存 AI 偏好</ActionButton>
              <TestButton onClick={handleTestApiKey} loading={apiTestState.status === 'testing'} />
            </div>
          </SectionCard>

          <div className="v2-settings-split">
            <SectionCard title="通知提醒" description="通知服务尚未接入。">
              <ReadOnlyBlock icon={Bell} title="保留入口" description="当前版本只展示状态，不提供虚构通知渠道。" />
            </SectionCard>
            <SectionCard title="账户安全" description="密码与双因素服务尚未接入。">
              <ReadOnlyBlock icon={Lock} title="沿用当前能力" description="不新增重置密码、2FA 或权限变更业务。" />
            </SectionCard>
          </div>

          <SectionCard title="数据与隐私" description="管理本地浏览器配置。">
            <p className="v2-settings-help">
              外观和 AI 偏好保存在当前浏览器 localStorage 中，切换浏览器或清除缓存后需要重新配置。
            </p>
            <button type="button" onClick={handleClearLocalConfig} className="v2-btn-danger">
              <Trash2 className="h-4 w-4" />
              清除本地配置
            </button>
          </SectionCard>
        </main>

        <aside className="v2-settings-side">
          <div className="v2-settings-status-card">
            <p>主题实际值</p>
            <strong>{document.documentElement.dataset.theme || '-'}</strong>
            <span>auto 会解析为 light 或 dark，不写入 data-theme。</span>
          </div>
          <div className="v2-settings-status-card">
            <p>Provider</p>
            <strong>{provider.label}</strong>
            <span>{provider.baseUrl || '自定义 Base URL'}</span>
          </div>
          <div className="v2-settings-status-card">
            <p>本地配置</p>
            <strong>{apiKey ? '已填写 Key' : '未填写 Key'}</strong>
            <span>仅保存在当前浏览器。</span>
          </div>
        </aside>
      </div>
    </PageShell>
  )
}

function InfoTile({ label, value }) {
  return (
    <div className="v2-settings-info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="v2-settings-label">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([optionValue, optionLabelText]) => (
          <option key={optionValue} value={optionValue}>{optionLabelText}</option>
        ))}
      </select>
    </label>
  )
}

function TextField({ label, value, onChange, placeholder, disabled = false }) {
  return (
    <label className="v2-settings-label">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
    </label>
  )
}

function ActionButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="v2-btn-primary">
      <Save className="h-4 w-4" />
      {children}
    </button>
  )
}

function TestButton({ onClick, loading }) {
  return (
    <button type="button" onClick={onClick} className="v2-btn-secondary" disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
      {loading ? '测试中...' : '测试 API Key'}
    </button>
  )
}

function ReadOnlyBlock({ icon: Icon, title, description }) {
  return (
    <div className="v2-settings-readonly">
      <Icon className="h-5 w-5" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  )
}

function maskApiKey(value) {
  if (!value) return ''
  if (value.length <= 8) return '*'.repeat(value.length)
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function safeApiErrorMessage(message, config) {
  let text = String(message || '').trim()
  for (const sensitive of [config?.apiKey, config?.baseUrl]) {
    const value = String(sensitive || '').trim()
    if (value) text = text.split(value).join('[redacted]')
  }
  return text
}

function optionLabel(options, value) {
  return options.find(([optionValue]) => optionValue === value)?.[1] || value
}

function themeLabel(value) {
  return optionLabel(themeOptions, value)
}
