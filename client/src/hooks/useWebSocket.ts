import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../stores/simulationStore'
import type { WsMessage } from '../lib/types'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const timerRef = useRef<number>(0)

  const setSimState = useStore((s) => s.setSimState)
  const setConnected = useStore((s) => s.setConnected)
  const setSendFn = useStore((s) => s.setSendFn)
  const resetSession = useStore((s) => s.resetSession)

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const handleMessage = useCallback(
    (msg: WsMessage) => {
      switch (msg.type) {
        case 'connected':
          // Fetch topologies via REST, then auto-load first one
          fetch('/api/topologies')
            .then((r) => r.json())
            .then((list: Array<{ id: number }>) => {
              if (list.length > 0) {
                send({ type: 'load_topology', topologyId: list[0].id })
              }
              // Store dispatches topology list through sim state
            })
            .catch(() => {})
          break

        case 'topology_loaded':
        case 'scenario_loaded':
        case 'reset':
        case 'failure_injected':
        case 'node_healed':
        case 'resilience_toggled':
        case 'tick':
          if (msg.data) {
            setSimState(msg.data)
          }
          if (msg.type === 'topology_loaded' || msg.type === 'reset') {
            resetSession()
            if (msg.data) setSimState(msg.data)
          }
          if (msg.type === 'scenario_loaded' && msg.data) {
            resetSession()
            setSimState(msg.data)
            // Auto-start scenario
            send({ type: 'start' })
          }
          break

        case 'started':
        case 'resumed':
        case 'paused':
        case 'speed_changed':
          // Control acks, sim state has running/paused fields
          // so we handle them via next tick
          break

        case 'error':
          console.error('[percolate]', msg.message, msg.context || '')
          break
      }
    },
    [send, setSimState, resetSession]
  )

  const connect = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retryRef.current = 0
    }

    ws.onmessage = (evt) => {
      try {
        handleMessage(JSON.parse(evt.data))
      } catch {
        /* ignore parse errors */
      }
    }

    ws.onclose = () => {
      setConnected(false)
      const delay = Math.min(1000 * 2 ** retryRef.current, 30000)
      retryRef.current++
      timerRef.current = window.setTimeout(connect, delay)
    }

    ws.onerror = () => {
      // onclose will fire after this
    }
  }, [setConnected, handleMessage])

  useEffect(() => {
    setSendFn(send)
    connect()

    return () => {
      wsRef.current?.close()
      clearTimeout(timerRef.current)
    }
  }, [connect, send, setSendFn])

  return send
}
