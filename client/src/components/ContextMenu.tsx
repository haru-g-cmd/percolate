import { useRef, useEffect, useState } from 'react'
import { useStore } from '../stores/simulationStore'

interface ContextMenuProps {
  x: number
  y: number
  nodeKey: string
  onClose: () => void
}

export default function ContextMenu({ x, y, nodeKey, onClose }: ContextMenuProps) {
  const sim = useStore((s) => s.sim)
  const send = useStore((s) => s.send)
  const selectNode = useStore((s) => s.selectNode)
  const setActiveTab = useStore((s) => s.setActiveTab)

  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  const node = sim?.nodes.find((n) => n.key === nodeKey)
  const failureModes = sim?.failureModes ?? []

  // Measure and reposition to stay within viewport
  useEffect(() => {
    const el = menuRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    let left = x
    let top = y

    if (x + rect.width > window.innerWidth) {
      left = x - rect.width
    }
    if (y + rect.height > window.innerHeight) {
      top = y - rect.height
    }

    // Clamp to viewport edges
    left = Math.max(4, left)
    top = Math.max(4, top)

    setPosition({ left, top })
  }, [x, y])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const handleInjectFailure = (failureModeSlug: string) => {
    send({ type: 'inject_failure', nodeKey, failureMode: failureModeSlug })
    onClose()
  }

  const handleHeal = () => {
    send({ type: 'heal_node', nodeKey })
    onClose()
  }

  const handleInspect = () => {
    selectNode(nodeKey)
    setActiveTab('details')
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl min-w-[200px] py-1 animate-fade-in"
      style={{ left: position.left, top: position.top }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800">
        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
          {node?.label ?? nodeKey}
        </span>
        {node && (
          <span className="ml-2 text-[10px] text-gray-500 capitalize">{node.type}</span>
        )}
      </div>

      {/* Failure modes */}
      {failureModes.length > 0 && (
        <div className="py-1">
          <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">
            Inject Failure
          </div>
          {failureModes.map((fm) => (
            <button
              key={fm.id}
              onClick={() => handleInjectFailure(fm.slug)}
              className="w-full text-left px-3 py-2 hover:bg-gray-800 cursor-pointer text-sm text-gray-300 hover:text-red-400 transition-colors"
            >
              {fm.name}
            </button>
          ))}
        </div>
      )}

      {/* Separator */}
      <div className="border-t border-gray-800 my-1" />

      {/* Heal node */}
      <button
        onClick={handleHeal}
        className="w-full text-left px-3 py-2 hover:bg-gray-800 cursor-pointer text-sm text-green-400 hover:text-green-300 transition-colors"
      >
        Heal Node
      </button>

      {/* Inspect */}
      <button
        onClick={handleInspect}
        className="w-full text-left px-3 py-2 hover:bg-gray-800 cursor-pointer text-sm text-gray-300 hover:text-cyan-400 transition-colors"
      >
        Inspect
      </button>
    </div>
  )
}
