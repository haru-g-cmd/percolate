import { useStore } from '../stores/simulationStore'
import type { NodeStatus, ResiliencePattern } from '../lib/types'

const STATUS_COLORS: Record<NodeStatus, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  failing: 'bg-orange-500',
  failed: 'bg-red-500',
  recovering: 'bg-cyan-500',
}

const STATUS_BAR_COLORS: Record<NodeStatus, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  failing: 'bg-orange-500',
  failed: 'bg-red-500',
  recovering: 'bg-cyan-500',
}

const RESILIENCE_LABELS: Record<ResiliencePattern, string> = {
  circuitBreaker: 'Circuit Breaker',
  retry: 'Retry',
  fallback: 'Fallback',
  redundancy: 'Redundancy',
  rateLimit: 'Rate Limit',
}

const RESILIENCE_KEYS: ResiliencePattern[] = [
  'circuitBreaker',
  'retry',
  'fallback',
  'redundancy',
  'rateLimit',
]

function colorByThreshold(value: number, goodBelow: number, warnBelow: number): string {
  if (value <= goodBelow) return 'text-gray-300'
  if (value <= warnBelow) return 'text-amber-400'
  return 'text-red-400'
}

function colorByThresholdInverse(value: number, goodAbove: number, warnAbove: number): string {
  if (value >= goodAbove) return 'text-gray-300'
  if (value >= warnAbove) return 'text-amber-400'
  return 'text-red-400'
}

export default function NodeDetailPanel() {
  const sim = useStore((s) => s.sim)
  const selectedNode = useStore((s) => s.selectedNode)
  const send = useStore((s) => s.send)

  if (!sim || !selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3 p-8">
        <svg
          className="w-12 h-12 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
          />
        </svg>
        <div className="text-center">
          <p className="text-sm text-gray-500">Click a node to inspect</p>
          <p className="text-xs text-gray-600 mt-1">Right-click to inject failure</p>
        </div>
      </div>
    )
  }

  const node = sim.nodes.find((n) => n.key === selectedNode)
  if (!node) return null

  const handleToggleResilience = (pattern: ResiliencePattern) => {
    send({
      type: 'toggle_resilience',
      nodeKey: node.key,
      pattern,
    })
  }

  const handleInjectFailure = (failureModeSlug: string) => {
    send({
      type: 'inject_failure',
      nodeKey: node.key,
      failureMode: failureModeSlug,
    })
  }

  const handleHeal = () => {
    send({
      type: 'heal_node',
      nodeKey: node.key,
    })
  }

  const showHeal = node.failureMode !== null || node.health < 100

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[node.status]}`}
        />
        <h3 className="font-semibold text-gray-100 flex-1 truncate">{node.label}</h3>
        <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400">
          {node.type}
        </span>
      </div>

      {/* Failure Mode Badge */}
      {node.failureMode && (
        <div className="flex items-center gap-2">
          <span className="bg-red-900/50 text-red-400 text-xs px-2 py-0.5 rounded">
            {node.failureMode}
          </span>
        </div>
      )}

      {/* Bar Metrics: Health & Load */}
      <div className="space-y-3">
        {/* Health */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Health</span>
            <span className="text-xs text-gray-300">{node.health.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${STATUS_BAR_COLORS[node.status]}`}
              style={{ width: `${Math.max(0, Math.min(100, node.health))}%` }}
            />
          </div>
        </div>

        {/* Load */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Load</span>
            <span className="text-xs text-gray-300">{node.load.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, node.load))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Single-value Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-0.5">Latency</div>
          <div className={`text-sm font-mono ${colorByThreshold(node.latency, 100, 500)}`}>
            {node.latency.toFixed(0)}
            <span className="text-[10px] text-gray-600 ml-0.5">ms</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-0.5">Error Rate</div>
          <div className={`text-sm font-mono ${colorByThreshold(node.errorRate, 5, 25)}`}>
            {node.errorRate.toFixed(1)}
            <span className="text-[10px] text-gray-600 ml-0.5">%</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-0.5">Throughput</div>
          <div className={`text-sm font-mono ${colorByThresholdInverse(node.throughput, 50, 20)}`}>
            {node.throughput.toFixed(0)}
            <span className="text-[10px] text-gray-600 ml-0.5">/s</span>
          </div>
        </div>
      </div>

      {/* Resilience Patterns */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
          Resilience Patterns
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RESILIENCE_KEYS.map((pattern) => {
            const active = node.resilience[pattern]
            return (
              <button
                key={pattern}
                onClick={() => handleToggleResilience(pattern)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                    : 'border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                {RESILIENCE_LABELS[pattern]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Inject Failure */}
      {sim.failureModes.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            Inject Failure
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sim.failureModes.map((fm) => (
              <button
                key={fm.slug}
                onClick={() => handleInjectFailure(fm.slug)}
                className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded text-gray-400 hover:text-gray-200 transition-colors text-left truncate"
                title={fm.description}
              >
                {fm.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Heal Button */}
      {showHeal && (
        <button
          onClick={handleHeal}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded text-sm font-medium transition-colors"
        >
          Heal Node
        </button>
      )}
    </div>
  )
}
