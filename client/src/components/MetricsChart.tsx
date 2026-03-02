import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useStore } from '../stores/simulationStore'

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: number
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs shadow-lg">
      <div className="text-gray-500 mb-1">Tick {label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-sm inline-block"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-400">{entry.name}:</span>
          <span className="text-gray-200 font-mono">{entry.value.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

const LEGEND_ITEMS = [
  { key: 'health', label: 'Health', color: '#06b6d4' },
  { key: 'errorRate', label: 'Errors', color: '#ef4444' },
  { key: 'throughput', label: 'Throughput', color: '#10b981' },
]

export default function MetricsChart() {
  const metricsHistory = useStore((s) => s.metricsHistory)

  if (metricsHistory.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-xs text-gray-600">Metrics will appear here</span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col px-3 py-2">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-1 flex-shrink-0">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: 80 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={80}>
          <AreaChart data={metricsHistory} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="throughputGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="tick"
              tick={false}
              axisLine={false}
              tickLine={false}
              stroke="#374151"
            />
            <YAxis
              domain={[0, 100]}
              hide
              width={0}
            />
            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="health"
              name="Health"
              stroke="#06b6d4"
              strokeWidth={1.5}
              fill="url(#healthGrad)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="errorRate"
              name="Errors"
              stroke="#ef4444"
              strokeWidth={1.5}
              fill="url(#errorGrad)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="throughput"
              name="Throughput"
              stroke="#10b981"
              strokeWidth={1.5}
              fill="url(#throughputGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
