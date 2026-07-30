export default function ScoreBadge({ score }) {
  const value = Number(score)
  if (Number.isNaN(value)) return <span className="text-xs text-gray-500">--</span>

  const cls =
    value >= 80
      ? 'bg-green-100 text-green-700'
      : value >= 60
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value} 分
    </span>
  )
}
