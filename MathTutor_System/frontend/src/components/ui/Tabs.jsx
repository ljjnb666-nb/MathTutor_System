export function Tabs({
  tabs = [],
  activeTab,
  onChange,
  className = '',
  tabClassName = '',
}) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 border-b border-[var(--color-border-default)] p-1 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              isActive
                ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
            } ${tabClassName}`}
          >
            {tab.icon && <tab.icon className="h-4 w-4" aria-hidden="true" />}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                  isActive
                    ? 'bg-[var(--color-brand-600)] text-white'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  className = '',
}) {
  const sizeClasses = {
    sm: 'p-0.5 text-xs',
    md: 'p-1 text-xs',
    lg: 'p-1.5 text-sm',
  }[size] || 'p-1 text-xs'

  return (
    <div
      role="radiogroup"
      className={`inline-flex items-center rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border-default)] select-none ${sizeClasses} ${className}`}
    >
      {options.map((option) => {
        const isSelected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
              isSelected
                ? 'bg-[var(--color-brand-600)] text-white shadow-sm font-semibold'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            } ${option.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {option.icon && <option.icon className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
