import { create } from 'zustand'
import type { SimulationState } from '../lib/types'

interface MetricsPoint {
  tick: number
  health: number
  errorRate: number
  throughput: number
}

interface SimStore {
  // Server state
  sim: SimulationState | null

  // UI state
  selectedNode: string | null
  activeTab: 'details' | 'scenarios' | 'analysis'
  metricsHistory: MetricsPoint[]
  connected: boolean
  previousFailedNodes: Set<string>

  // WebSocket send function (injected by hook)
  _sendFn: ((msg: unknown) => void) | null

  // Actions
  setSimState: (state: SimulationState) => void
  selectNode: (key: string | null) => void
  setActiveTab: (tab: SimStore['activeTab']) => void
  setConnected: (v: boolean) => void
  resetSession: () => void
  setSendFn: (fn: (msg: unknown) => void) => void
  send: (msg: Record<string, unknown>) => void
}

export const useStore = create<SimStore>((set, get) => ({
  sim: null,
  selectedNode: null,
  activeTab: 'details',
  metricsHistory: [],
  connected: false,
  previousFailedNodes: new Set(),
  _sendFn: null,

  setSimState: (simState) => {
    const nodes = simState.nodes
    if (nodes?.length) {
      const health = nodes.reduce((s, n) => s + n.health, 0) / nodes.length
      const errorRate = nodes.reduce((s, n) => s + n.errorRate, 0) / nodes.length
      const throughput = nodes.reduce((s, n) => s + n.throughput, 0) / nodes.length
      const point: MetricsPoint = { tick: simState.tick, health, errorRate, throughput }
      set((prev) => {
        const history = [...prev.metricsHistory, point]
        if (history.length > 150) history.shift()
        return { sim: simState, metricsHistory: history }
      })
    } else {
      set({ sim: simState })
    }
  },

  selectNode: (key) => set({ selectedNode: key }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setConnected: (v) => set({ connected: v }),

  resetSession: () => set({ metricsHistory: [], previousFailedNodes: new Set(), selectedNode: null }),

  setSendFn: (fn) => set({ _sendFn: fn }),

  send: (msg) => {
    const fn = get()._sendFn
    if (fn) fn(msg)
  },
}))
