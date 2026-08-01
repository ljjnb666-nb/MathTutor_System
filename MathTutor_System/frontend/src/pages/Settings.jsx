import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, Trash2, User, Bell, Palette, Lock, Database, Key } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
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
import { applyTheme } from '../utils/theme'

export default function Settings() {
  const { user } = useAuth()

  // AI 配置状态（复用 SettingsModal 逻辑）
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

  // 系统外观状态
  const [theme, setTheme] = useState('dark')
  const [accentColor, setAccentColor] = useState('indigo')
  const [density, setDensity] = useState('comfortable')

  const provider = getProviderByValue(providerValue)
  const displayModel = customModel.trim() || model

  // 初始化加载设置
  useEffect(() => {
    const stored = getStoredSettings()
    const p = getProviderByValue(stored.provider ?? 'deepseek')
    setProviderValue(p.value)
    setModel(stored.model ?? p.models?.[0]?.value ?? '')
    setCustomModel('')
    setApiKey(getApiKeyForProvider(p.value))
    setBaseUrl(getBaseUrlForProvider(p.value))
    setApiVersion(getApiVersionForProvider(p.value))
    setShowThinking(Boolean(stored.showThinking))

    // 加载外观设置
    const savedTheme = localStorage.getItem('ui_theme') || 'dark'
    const savedAccent = localStorage.getItem('ui_accent') || 'indigo'
    const savedDensity = localStorage.getItem('ui_density') || 'comfortable'
    setTheme(savedTheme)
    setAccentColor(savedAccent)
    setDensity(savedDensity)

    // 立即应用到 DOM
    applyTheme(savedTheme)
    document.documentElement.dataset.accent = savedAccent
    document.documentElement.dataset.density = savedDensity
  }, [])

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

  const handleSaveAI = () => {
    const stored = getStoredSettings()
    const apiKeysByProvider = { ...(stored.apiKeysByProvider || {}), [providerValue]: apiKey }
    const baseUrlsByProvider = { ...(stored.baseUrlsByProvider || {}), [providerValue]: baseUrl.trim() }
    const apiVersionsByProvider = { ...(stored.apiVersionsByProvider || {}), [providerValue]: apiVersion.trim() }
    setStoredSettings({
      ...stored,
      provider: providerValue,
      model: displayModel,
      showThinking,
      apiKeysByProvider,
      baseUrlsByProvider,
      apiVersionsByProvider,
    })
    alert('AI 偏好已保存到浏览器本地存储')
  }

  const handleSaveAppearance = () => {
    localStorage.setItem('ui_theme', theme)
    localStorage.setItem('ui_accent', accentColor)
    localStorage.setItem('ui_density', density)

    // 立即应用到 DOM
    applyTheme(theme)
    document.documentElement.dataset.accent = accentColor
    document.documentElement.dataset.density = density

    alert('外观设置已保存并应用')
  }

  const handleClearLocalConfig = () => {
    if (confirm('确定要清除所有本地配置吗？这将删除所有 API Key 和偏好设置。')) {
      localStorage.removeItem('app_settings')
      localStorage.removeItem('ui_theme')
      localStorage.removeItem('ui_accent')
      localStorage.removeItem('ui_density')
      alert('已清除本地配置')
      window.location.reload()
    }
  }

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in-up">
      {/* 页面说明 */}
      <div className="pro-glass-card rounded-2xl p-6">
        <h2 className="text-lg font-black mb-2" style={{ color: 'var(--color-text-primary)' }}>系统设置</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          管理您的个人资料、系统外观、通知提醒、AI 偏好和集成配置。
        </p>
      </div>

      {/* 1. 个人资料（只读） */}
      <section className="pro-glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>个人资料</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>查看您的账号信息</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>用户名</span>
            <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{user?.username || '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>角色</span>
            <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {user?.role === 'admin' ? '管理员' : '教师'}
            </span>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
            个人资料由管理员管理，当前无法自助修改。
          </p>
        </div>
      </section>

      {/* 2. 系统外观 */}
      <section className="pro-glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>系统外观</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>自定义界面主题和布局</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>主题模式</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              style={{
                border: '1px solid var(--color-border-primary)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)'
              }}
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="auto">跟随系统</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>强调色</label>
            <select
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              style={{
                border: '1px solid var(--color-border-primary)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)'
              }}
            >
              <option value="indigo">靛蓝</option>
              <option value="purple">紫色</option>
              <option value="blue">蓝色</option>
              <option value="green">绿色</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>布局密度</label>
            <select
              value={density}
              onChange={(e) => setDensity(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              style={{
                border: '1px solid var(--color-border-primary)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)'
              }}
            >
              <option value="compact">紧凑</option>
              <option value="comfortable">舒适</option>
              <option value="spacious">宽松</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleSaveAppearance}
            className="btn-gradient-pro flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold w-full sm:w-auto"
          >
            <Save className="h-4 w-4" />
            保存外观设置
          </button>
        </div>
      </section>

      {/* 3. 通知提醒 */}
      <section className="pro-glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>通知提醒</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>管理通知接收偏好</p>
          </div>
        </div>
        <div className="rounded-xl bg-amber-950/30 border border-amber-800/40 p-4">
          <p className="text-sm font-medium text-amber-300">
            通知服务尚未接入，敬请期待。
          </p>
        </div>
      </section>

      {/* 4. AI 偏好 */}
      <section className="pro-glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>AI 偏好</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>配置默认 AI 提供商和模型</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>默认 Provider</label>
            <select
              value={providerValue}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              style={{
                border: '1px solid var(--color-border-primary)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)'
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>默认模型</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              style={{
                border: '1px solid var(--color-border-primary)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)'
              }}
            >
              {provider.models?.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showThinking}
                onChange={(e) => setShowThinking(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                style={{ borderColor: 'var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)' }}
              />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>显示 AI 思考过程</span>
            </label>
          </div>
          <button
            type="button"
            onClick={handleSaveAI}
            className="btn-gradient-pro flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold w-full sm:w-auto"
          >
            <Save className="h-4 w-4" />
            保存 AI 偏好
          </button>
        </div>
      </section>

      {/* 5. 数据与隐私 */}
      <section className="pro-glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>数据与隐私</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>管理本地存储数据</p>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            您的 API Key 和偏好设置仅保存在当前浏览器的本地存储中，不会上传到服务器。
          </p>
          <button
            type="button"
            onClick={handleClearLocalConfig}
            className="flex items-center gap-2 rounded-xl border border-rose-800/40 bg-rose-950/30 px-4 py-2.5 text-sm font-bold text-rose-400 hover:bg-rose-950/50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            清除所有本地配置
          </button>
        </div>
      </section>

      {/* 6. 账号安全 */}
      <section className="pro-glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>账号安全</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>密码和登录安全</p>
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-bg-card-hover)', border: '1px solid var(--color-border-primary)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            密码修改和双因素认证服务尚未接入。
          </p>
        </div>
      </section>

      {/* 7. 集成与 API */}
      <section className="pro-glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>集成与 API</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>配置外部服务 API Key</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`输入 ${provider.label} API Key`}
                className="w-full rounded-xl px-4 py-2.5 pr-12 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)'
                }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-slate-300"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {provider.needBaseUrl && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={provider.baseUrl || ''}
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)'
                }}
              />
            </div>
          )}
          {provider.needApiVersion && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>API Version</label>
              <input
                type="text"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                placeholder={provider.apiVersion || ''}
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)'
                }}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTestApiKey}
              disabled={!apiKey.trim() || testingKey}
              className="flex items-center gap-2 rounded-xl border border-indigo-700/60 bg-indigo-950/40 px-4 py-2.5 text-sm font-bold text-indigo-300 hover:bg-indigo-950/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testingKey ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  测试中...
                </>
              ) : (
                '测试连接'
              )}
            </button>
            <button
              type="button"
              onClick={handleSaveAI}
              className="btn-gradient-pro flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
            >
              <Save className="h-4 w-4" />
              保存配置
            </button>
          </div>
          {testStatus && (
            <div
              className={`rounded-xl border p-3 ${
                testStatus.ok
                  ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
                  : 'border-rose-800/60 bg-rose-950/40 text-rose-300'
              }`}
            >
              <p className="text-sm font-medium">{testStatus.message}</p>
            </div>
          )}
          <div className="rounded-xl bg-amber-950/30 border border-amber-800/40 p-4">
            <p className="text-xs font-medium text-amber-300">
              ⚠️ API Key 仅保存在当前浏览器本地，不会上传到服务器。切换浏览器或清除缓存后需要重新配置。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
