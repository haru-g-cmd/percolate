import { useState } from 'react'
import { useStore } from '../stores/simulationStore'
import type { Severity } from '../lib/types'

const BREAKDOWN_LABELS: Record<string, string> = {
  redundancy: 'Redundancy',
  circuitBreaker: 'Circuit Breaker',
  gracefulDegradation: 'Graceful Degrad.',
  singlePointsOfFailure: 'No SPOFs',
  recoveryCapability: 'Recovery',
}

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'border-red-500',
  high: 'border-orange-500',
  medium: 'border-amber-500',
  low: 'border-gray-500',
}

const SEVERITY_BADGE_COLORS: Record<Severity, string> = {
  critical: 'bg-red-900/50 text-red-400',
  high: 'bg-orange-900/50 text-orange-400',
  medium: 'bg-amber-900/50 text-amber-400',
  low: 'bg-gray-800 text-gray-400',
}

function barColor(pct: number): string {
  if (pct >= 70) return 'bg-green-500'
  if (pct >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function AnalysisPanel() {
  const sim = useStore((s) => s.sim)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  if (!sim) return null

  const breakdown = sim.resilienceBreakdown
  const recommendations = sim.recommendations
  const blastRadius = sim.blastRadius ?? 0
  const mttr = sim.mttr ?? 0
  const mttf = sim.mttf ?? 0

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topologyId: sim.topology?.id,
          tick: sim.tick,
          resilienceScore: sim.resilienceScore,
          blastRadius,
          mttr,
          mttf,
          nodes: sim.nodes,
          events: sim.events,
          recommendations: sim.recommendations,
          metrics: sim.metrics,
        }),
      })
      if (res.ok) {
        setSaveMessage('Simulation saved successfully')
      } else {
        setSaveMessage('Failed to save simulation')
      }
    } catch {
      setSaveMessage('Failed to save simulation')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMessage(null), 3000)
    }
  }

  return (
    <div className="p-4 space-y-5">
      {/* Resilience Score Breakdown */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
          Resilience Score Breakdown
        </div>
        <div className="space-y-2">
          {Object.entries(breakdown).map(([key, entry]) => {
            const label = BREAKDOWN_LABELS[key] || key
            const pct = Math.round((entry.score / Math.max(entry.weight, 1)) * 100)
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-28 shrink-0 truncate" title={label}>
                  {label}
                </span>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor(pct)}`}
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                </div>
                <span className="text-xs text-right w-16 text-gray-400">
                  {entry.score.toFixed(1)}/{entry.weight}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Blast Radius + MTTR / MTTF */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
            Blast Radius
          </div>
          <div className="text-sm font-mono font-bold text-amber-400">
            {(blastRadius * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">MTTR</div>
          <div className="text-sm font-mono font-bold text-cyan-400">
            {mttr.toFixed(1)}
            <span className="text-[10px] text-gray-600 ml-0.5">ticks</span>
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">MTTF</div>
          <div className="text-sm font-mono font-bold text-green-400">
            {mttf.toFixed(1)}
            <span className="text-[10px] text-gray-600 ml-0.5">ticks</span>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
          Recommendations
        </div>
        {recommendations.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">
            No recommendations yet. Run a scenario to see analysis.
          </p>
        ) : (
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div
                key={`${rec.nodeKey}-${rec.category}-${i}`}
                className={`border-l-2 ${SEVERITY_COLORS[rec.severity]} bg-gray-800/50 p-3 rounded-r`}
              >
                <div className="text-sm font-medium text-gray-200">{rec.title}</div>
                <p className="text-xs text-gray-400 mt-1">{rec.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${SEVERITY_BADGE_COLORS[rec.severity]}`}
                  >
                    {rec.severity}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    Impact: {rec.estimatedImpact.toFixed(0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white w-full py-2 rounded text-sm font-medium transition-colors"
      >
        {saving ? 'Saving...' : 'Save Simulation'}
      </button>
      {saveMessage && (
        <p
          className={`text-xs text-center ${
            saveMessage.includes('success') ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {saveMessage}
        </p>
      )}
    </div>
  )
}
