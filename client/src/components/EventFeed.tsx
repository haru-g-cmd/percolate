import { useEffect, useRef } from 'react'
import { useStore } from '../stores/simulationStore'
import type { SimEvent } from '../lib/types'

const FAILURE_TYPES = new Set([
  'failure_injected',
  'node_failed',
  'percolate_failed',
  'cascade_started',
  'cascade_spread',
  'threshold_breach',
])

const RECOVERY_TYPES = new Set([
  'recovery_completed',
  'health_recovered',
  'heal_applied',
  'circuit_breaker_closed',
])

function eventTypeColor(type: string): string {
  if (FAILURE_TYPES.has(type)) return 'text-red-400'
  if (RECOVERY_TYPES.has(type)) return 'text-green-400'
  return 'text-gray-400'
}

function formatEventDetail(event: SimEvent): string {
  const data = event.data
  const parts: string[] = []

  if (data.failureMode) parts.push(String(data.failureMode))
  if (data.health !== undefined) parts.push(`health: ${Number(data.health).toFixed(1)}%`)
  if (data.message) parts.push(String(data.message))
  if (data.pattern) parts.push(String(data.pattern))
  if (data.scenario) parts.push(String(data.scenario))

  return parts.join(' | ') || ''
}

export default function EventFeed() {
  const sim = useStore((s) => s.sim)
  const scrollRef = useRef<HTMLDivElement>(null)

  const events = sim?.events ?? []
  const displayEvents = events.slice(-80)

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [displayEvents.length])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">
          Event Feed
        </span>
        <span className="text-xs text-gray-600 font-mono">
          Tick: {sim?.tick ?? 0}
        </span>
      </div>

      {/* Events list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1">
        {displayEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-gray-600">Events will appear here</span>
          </div>
        ) : (
          displayEvents.map((event, i) => {
            const detail = formatEventDetail(event)
            return (
              <div
                key={`${event.tick}-${event.type}-${i}`}
                className="flex items-start gap-2 text-xs py-1 border-b border-gray-800/50"
              >
                <span className="text-gray-600 font-mono w-10 shrink-0 text-right">
                  {event.tick}
                </span>
                <span className={`shrink-0 ${eventTypeColor(event.type)}`}>
                  {event.type.replace(/_/g, ' ')}
                </span>
                {event.nodeKey && (
                  <span className="text-cyan-400 shrink-0">{event.nodeKey}</span>
                )}
                {detail && (
                  <span className="text-gray-500 truncate">{detail}</span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
