import { useEffect, useState } from 'react'
import { useStore } from '../stores/simulationStore'
import type { Topology } from '../lib/types'

export default function TopBar() {
  const sim = useStore((s) => s.sim)
  const send = useStore((s) => s.send)
  const connected = useStore((s) => s.connected)

  const [topologies, setTopologies] = useState<Topology[]>([])
  const [selectedTopo, setSelectedTopo] = useState<number | ''>('')

  // Fetch topologies on mount
  useEffect(() => {
    fetch('/api/topologies')
      .then((r) => r.json())
      .then((list: Topology[]) => {
        setTopologies(list)
        if (list.length > 0) {
          setSelectedTopo(list[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Sync selected topology when sim changes
  useEffect(() => {
    if (sim?.topology) {
      setSelectedTopo(sim.topology.id)
    }
  }, [sim?.topology])

  const handleTopoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value)
    setSelectedTopo(id)
    send({ type: 'load_topology', topologyId: id })
  }

  const handleStart = () => send({ type: 'start' })
  const handlePause = () => send({ type: 'pause' })
  const handleReset = () => send({ type: 'reset' })

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const speed = parseFloat(e.target.value)
    send({ type: 'set_speed', speed })
  }

  const handleToggleChaos = () => send({ type: 'toggle_chaos' })

  // Derived values
  const isRunning = sim?.running ?? false
  const isPaused = sim?.paused ?? false
  const speed = sim?.speed ?? 1
  const chaosActive = sim?.chaosMode ?? false
  const resilienceScore = sim?.resilienceScore ?? 0
  const financialImpact = sim?.financialImpact?.totalPerMin ?? 0
  const avgHealth =
    sim?.nodes && sim.nodes.length > 0
      ? sim.nodes.reduce((s, n) => s + n.health, 0) / sim.nodes.length
      : 0

  const colorByValue = (v: number) => {
    if (v >= 70) return 'text-green-400'
    if (v >= 40) return 'text-amber-400'
    return 'text-red-400'
  }

  return (
    <header className="h-14 bg-gray-900/80 backdrop-blur border-b border-gray-800 px-4 flex items-center gap-4 flex-shrink-0">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 mr-2">
        <span className="font-bold text-lg tracking-widest text-cyan-400">PERCOLATE</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider hidden sm:inline">
          resilience platform
        </span>
      </div>

      {/* Connection indicator */}
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          connected ? 'bg-green-500 shadow-[0_0_6px_#10b981]' : 'bg-red-500 shadow-[0_0_6px_#ef4444]'
        }`}
        title={connected ? 'Connected' : 'Disconnected'}
      />

      {/* Divider */}
      <div className="w-px h-6 bg-gray-700" />

      {/* Center: Controls */}
      <div className="flex items-center gap-2 flex-1">
        {/* Topology selector */}
        <select
          value={selectedTopo}
          onChange={handleTopoChange}
          className="bg-gray-800 border border-gray-700 text-sm rounded px-3 py-1.5 text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        >
          {topologies.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleStart}
            disabled={isRunning && !isPaused}
            className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Play (Space)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          </button>
          <button
            onClick={handlePause}
            disabled={!isRunning || isPaused}
            className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Pause (Space)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18" /><rect x="15" y="3" width="4" height="18" /></svg>
          </button>
          <button
            onClick={handleReset}
            className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 transition-colors"
            title="Reset (R)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 1 3 6.7" /><polyline points="3 20 3 13 10 13" /></svg>
          </button>
        </div>

        {/* Speed slider */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Speed</label>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={speed}
            onChange={handleSpeedChange}
            className="w-20 h-1 accent-cyan-500"
          />
          <span className="text-xs text-gray-400 w-8 text-right">{speed}x</span>
        </div>

        {/* Chaos toggle */}
        <button
          onClick={handleToggleChaos}
          className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
            chaosActive
              ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
              : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
          }`}
        >
          CHAOS
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-700" />

      {/* Right: Metrics badges */}
      <div className="flex items-center gap-3">
        {/* Resilience Score */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-none">
            Resilience
          </span>
          <span className={`text-sm font-mono font-bold ${colorByValue(resilienceScore)}`}>
            {resilienceScore.toFixed(1)}
          </span>
        </div>

        {/* Revenue Impact */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-none">
            Revenue
          </span>
          <span className="text-sm font-mono font-bold text-amber-400">
            ${financialImpact.toFixed(0)}/min
          </span>
        </div>

        {/* Average Health */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-none">
            Avg Health
          </span>
          <span className={`text-sm font-mono font-bold ${colorByValue(avgHealth)}`}>
            {avgHealth.toFixed(0)}%
          </span>
        </div>
      </div>
    </header>
  )
}
