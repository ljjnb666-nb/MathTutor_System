import { useEffect, useState } from 'react'
import { Bell, Database, Eye, EyeOff, Key, Lock, Palette, Save, Trash2, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  PROVIDERS,
  getApiKeyForProvider,
  getBaseUrlForProvider,
  getProviderByValue,
  getStoredSettings,
  setStoredSettings,
} from '../constants/ai-providers'
import { applyTheme } from '../utils/theme'

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

  const provider = getProviderByValue(providerValue)

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

  function handleProviderChange(value) {
    const nextProvider = getProviderByValue(value)
    setProviderValue(nextProvider.value)
    setModel(nextProvider.models?.[0]?.value ?? '')
    setApiKey(getApiKeyForProvider(nextProvider.value))
    setBaseUrl(getBaseUrlForProvider(nextProvider.value))
    setNotice('')
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
    const stored = getStoredSettings()
    setStoredSettings({
      ...stored,
      provider: providerValue,
      model,
      showThinking,
      apiKeysByProvider: { ...(stored.apiKeysByProvider || {}), [providerValue]: apiKey },
      baseUrlsByProvider: { ...(stored.baseUrlsByProvider || {}), [providerValue]: baseUrl.trim() },
    })
    setNotice('AI 偏好已保存到当前浏览器')
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
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in-up">
      <section className="pro-glass-card rounded-2xl p-6">
        <h2 className="text-lg font-black" style={{ color: 'var(--color-text-primary)' }}>系统设置</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          管理账户信息、主题外观、AI 本地偏好和隐私设置。
        </p>
        {notice && (
          <p className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: '1px solid rgba(16,185,129,0.28)', backgroundColor: 'color-mix(in srgb, #10b981 10%, var(--color-bg-card))', color: '#047857' }}>
            {notice}
          </p>
        )}
      </section>

      <section className="pro-glass-card rounded-2xl p-6">
        <SectionTitle icon={User} title="个人资料" description="查看当前登录账户" tone="indigo" />
        <div className="mt-4 divide-y" style={{ borderColor: 'var(--color-border-primary)' }}>
          <InfoRow label="用户名" value={user?.username || '-'} />
          <InfoRow label="角色" value={user?.role === 'admin' ? '管理员' : '教师'} />
        </div>
      </section>

      <section className="pro-glass-card rounded-2xl p-6">
        <SectionTitle icon={Palette} title="系统外观" description="切换主题、强调色和界面密度" tone="purple" />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <SelectField label="主题模式" value={theme} onChange={setTheme} options={[
            ['dark', '深色'],
            ['light', '浅色'],
            ['auto', '跟随系统'],
          ]} />
          <SelectField label="强调色" value={accentColor} onChange={setAccentColor} options={[
            ['indigo', '靛蓝'],
            ['purple', '紫色'],
            ['blue', '蓝色'],
            ['green', '绿色'],
          ]} />
          <SelectField label="布局密度" value={density} onChange={setDensity} options={[
            ['compact', '紧凑'],
            ['comfortable', '舒适'],
            ['spacious', '宽松'],
          ]} />
        </div>
        <ActionButton onClick={handleSaveAppearance}>保存外观设置</ActionButton>
      </section>

      <section className="pro-glass-card rounded-2xl p-6">
        <SectionTitle icon={Key} title="AI 本地偏好" description="仅保存浏览器本地偏好，不测试或上传 API Key" tone="cyan" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
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
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder={provider.baseUrl || ''} />
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`输入 ${provider.label} API Key`}
                className="w-full rounded-xl px-4 py-2.5 pr-11 text-sm outline-none focus:ring-2"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
              />
              <button
                type="button"
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                onClick={() => setShowApiKey((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} className="h-4 w-4 rounded" />
          显示 AI 思考过程
        </label>
        <p className="mt-4 rounded-xl p-4 text-xs font-medium" style={{ border: '1px solid rgba(251,191,36,0.26)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', color: '#92400e' }}>
          UI-only 分支不包含服务端 API Key 测试能力。这里的 API Key 仅保存在当前浏览器本地。
        </p>
        <ActionButton onClick={handleSaveAI}>保存 AI 偏好</ActionButton>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="pro-glass-card rounded-2xl p-6">
          <SectionTitle icon={Bell} title="通知提醒" description="通知服务尚未接入" tone="amber" />
          <p className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            当前版本保留通知入口展示，尚未提供可配置通知渠道。
          </p>
        </div>
        <div className="pro-glass-card rounded-2xl p-6">
          <SectionTitle icon={Lock} title="账户安全" description="密码与双因素服务尚未接入" tone="rose" />
          <p className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            账户安全策略仍沿用 main 当前能力。
          </p>
        </div>
      </section>

      <section className="pro-glass-card rounded-2xl p-6">
        <SectionTitle icon={Database} title="数据与隐私" description="管理本地浏览器配置" tone="emerald" />
        <p className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          外观和 AI 偏好保存在当前浏览器 localStorage 中，切换浏览器或清除缓存后需要重新配置。
        </p>
        <button
          type="button"
          onClick={handleClearLocalConfig}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors"
          style={{ border: '1px solid rgba(244,63,94,0.35)', backgroundColor: 'color-mix(in srgb, #f43f5e 9%, var(--color-bg-card))', color: '#be123c' }}
        >
          <Trash2 className="h-4 w-4" />
          清除本地配置
        </button>
      </section>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, description, tone }) {
  const colors = {
    indigo: '#818cf8',
    purple: '#a78bfa',
    cyan: '#22d3ee',
    amber: '#f59e0b',
    rose: '#fb7185',
    emerald: '#10b981',
  }
  const color = colors[tone] || colors.indigo
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
    </div>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2"
        style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  )
}

function TextField({ label, value, onChange, placeholder }) {
  return (
    <label className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2"
        style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
      />
    </label>
  )
}

function ActionButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-gradient-pro mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
    >
      <Save className="h-4 w-4" />
      {children}
    </button>
  )
}
