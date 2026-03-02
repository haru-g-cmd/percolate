import { useEffect, useState, useCallback } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './stores/simulationStore'
import TopBar from './components/TopBar'
import NetworkGraph from './components/NetworkGraph'
import NodeDetailPanel from './components/NodeDetailPanel'
import ScenarioPanel from './components/ScenarioPanel'
import AnalysisPanel from './components/AnalysisPanel'
import EventFeed from './components/EventFeed'
import MetricsChart from './components/MetricsChart'
import ContextMenu from './components/ContextMenu'

const TAB_LABELS = ['details', 'scenarios', 'analysis'] as const

export default function App() {
  useWebSocket()

  const sim = useStore((s) => s.sim)
  const activeTab = useStore((s) => s.activeTab)
  const selectNode = useStore((s) => s.selectNode)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const send = useStore((s) => s.send)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeKey: string } | null>(null)
  const handleContextMenu = useCallback((x: number, y: number, nodeKey: string) => {
    setCtxMenu({ x, y, nodeKey })
  }, [])
  const closeContextMenu = useCallback(() => setCtxMenu(null), [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.code) {
        case 'Space': {
          e.preventDefault()
          if (!sim) return
          if (!sim.running || sim.paused) {
            send({ type: 'start' })
          } else {
            send({ type: 'pause' })
          }
          break
        }
        case 'KeyR': {
          send({ type: 'reset' })
          break
        }
        case 'Escape': {
          selectNode(null)
          closeContextMenu()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sim, send, selectNode, closeContextMenu])

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-950 text-gray-200 overflow-hidden">
      <TopBar />

      <div className="flex-1 flex flex-row min-h-0">
        <div className="flex-1 relative min-w-0">
          <NetworkGraph onContextMenu={handleContextMenu} />
        </div>

        <div className="w-[360px] flex-shrink-0 border-l border-gray-800 flex flex-col bg-gray-900/50">
          <div className="flex gap-1 p-2 border-b border-gray-800">
            {TAB_LABELS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'details' && <NodeDetailPanel />}
            {activeTab === 'scenarios' && <ScenarioPanel />}
            {activeTab === 'analysis' && <AnalysisPanel />}
          </div>
        </div>
      </div>

      <div className="h-[180px] flex-shrink-0 flex flex-row border-t border-gray-800">
        <div className="flex-1 min-w-0">
          <EventFeed />
        </div>
        <div className="flex-1 min-w-0 border-l border-gray-800">
          <MetricsChart />
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          nodeKey={ctxMenu.nodeKey}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}
