import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import * as d3 from 'd3'
import type { SimNode, SimEdge, NodeStatus } from '../lib/types'
import { useStore } from '../stores/simulationStore'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  onContextMenu: (x: number, y: number, nodeKey: string) => void
}

export interface NetworkGraphHandle {
  triggerShockwave: (nodeKey: string) => void
}

/** D3 force-sim node (mutable positions added by d3) */
interface D3Node extends SimNode {
  fx?: number | null
  fy?: number | null
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  id: number
  weight: number
  edgeType: SimEdge['edgeType']
  sourceKey: string
  targetKey: string
  baseLatency: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<NodeStatus, string> = {
  healthy: '#06b6d4',
  degraded: '#f59e0b',
  failing: '#f97316',
  failed: '#ef4444',
  recovering: '#10b981',
}

const NODE_ICONS: Record<string, string> = {
  service: 'SVC',
  database: 'DB',
  cache: 'CA',
  queue: 'MQ',
  gateway: 'GW',
  cdn: 'CDN',
  load_balancer: 'LB',
  external: 'EXT',
  dns: 'DNS',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const NetworkGraph = forwardRef<NetworkGraphHandle, Props>(function NetworkGraph(
  { onContextMenu },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  // D3 mutable refs -- survive across renders without triggering them
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simRef = useRef<d3.Simulation<any, any> | null>(null)
  const nodesRef = useRef<D3Node[]>([])
  const linksRef = useRef<D3Link[]>([])
  const sizeRef = useRef({ width: 900, height: 600 })
  const prevTopoIdRef = useRef<number | null>(null)
  const prevFailedRef = useRef<Set<string>>(new Set())

  // D3 selection refs
  const gRootRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const linkSelRef = useRef<d3.Selection<SVGLineElement, D3Link, SVGGElement, unknown> | null>(null)
  const nodeGSelRef = useRef<d3.Selection<SVGGElement, D3Node, SVGGElement, unknown> | null>(null)

  // Store selectors
  const sim = useStore((s) => s.sim)
  const selectedNode = useStore((s) => s.selectedNode)
  const selectNode = useStore((s) => s.selectNode)

  /* ---------------------------------------------------------------- */
  /*  Imperative handle (shockwave)                                    */
  /* ---------------------------------------------------------------- */

  const triggerShockwave = useCallback((nodeKey: string) => {
    const gRoot = gRootRef.current
    if (!gRoot) return
    const node = nodesRef.current.find((n) => n.key === nodeKey)
    if (!node) return
    const cx = node.x ?? 0
    const cy = node.y ?? 0

    gRoot
      .append('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 3)
      .attr('opacity', 0.9)
      .transition()
      .duration(1200)
      .ease(d3.easeCubicOut)
      .attr('r', 200)
      .attr('stroke-width', 0.5)
      .attr('opacity', 0)
      .remove()
  }, [])

  useImperativeHandle(ref, () => ({ triggerShockwave }), [triggerShockwave])

  /* ---------------------------------------------------------------- */
  /*  Build / rebuild the force layout when topology changes            */
  /* ---------------------------------------------------------------- */

  const buildSimulation = useCallback(() => {
    if (!sim || !svgRef.current) return

    const { width, height } = sizeRef.current
    const svg = d3.select(svgRef.current)

    // ---- clear previous ----
    if (simRef.current) {
      simRef.current.stop()
      simRef.current = null
    }
    svg.selectAll('g.root').remove()

    // ---- zoom ----
    const gRoot = svg.append('g').attr('class', 'root')
    gRootRef.current = gRoot as d3.Selection<SVGGElement, unknown, null, undefined>

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        gRoot.attr('transform', event.transform.toString())
      })

    svg.call(zoomBehavior)

    // click background to deselect
    svg.on('click', (event: MouseEvent) => {
      const tag = (event.target as Element).tagName.toLowerCase()
      if (tag === 'svg' || tag === 'rect') {
        selectNode(null)
      }
    })

    // ---- prepare data ----
    const nodes: D3Node[] = sim.nodes.map((n) => ({
      ...n,
      x: n.x * width,
      y: n.y * height,
    }))

    const nodeMap = new Map(nodes.map((n) => [n.key, n]))

    const links: D3Link[] = sim.edges
      .filter((e) => nodeMap.has(e.sourceKey) && nodeMap.has(e.targetKey))
      .map((e) => ({
        source: nodeMap.get(e.sourceKey)!,
        target: nodeMap.get(e.targetKey)!,
        id: e.id,
        weight: e.weight,
        edgeType: e.edgeType,
        sourceKey: e.sourceKey,
        targetKey: e.targetKey,
        baseLatency: e.baseLatency,
      }))

    nodesRef.current = nodes
    linksRef.current = links

    // ---- force simulation ----
    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Link>(links)
          .id((d) => d.key)
          .distance((d) => 150 / (d.weight || 1)),
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<D3Node>().radius(50))
      .alphaDecay(0.02)

    simRef.current = simulation

    // ---- defs (gradients) ----
    let defs = svg.select<SVGDefsElement>('defs')
    if (defs.empty()) {
      defs = svg.append('defs')
    }
    // remove old node gradients
    defs.selectAll('.node-gradient').remove()

    nodes.forEach((n) => {
      const color = STATUS_COLORS[n.status] || STATUS_COLORS.healthy
      const grad = defs
        .append('radialGradient')
        .attr('class', 'node-gradient')
        .attr('id', `glow-${n.key}`)
      grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.15)
      grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0)
    })

    // ---- draw edges ----
    const linkG = gRoot.append('g').attr('class', 'links')
    const linkSel = linkG
      .selectAll<SVGLineElement, D3Link>('line')
      .data(links, (d) => String(d.id))
      .join('line')
      .attr('stroke', (d) => edgeColor(d, nodes))
      .attr('stroke-width', (d) => 1 + d.weight * 2)
      .attr('stroke-dasharray', (d) => (d.edgeType === 'async' ? '6,4' : 'none'))
      .attr('opacity', 0.3)

    linkSelRef.current = linkSel

    // ---- draw node groups ----
    const nodeG = gRoot.append('g').attr('class', 'nodes')
    const nodeGSel = nodeG
      .selectAll<SVGGElement, D3Node>('g.node')
      .data(nodes, (d) => d.key)
      .join('g')
      .attr('class', 'node')
      .attr('cursor', 'pointer')
      .on('click', (_event: MouseEvent, d: D3Node) => {
        _event.stopPropagation()
        selectNode(d.key)
      })
      .on('contextmenu', (event: MouseEvent, d: D3Node) => {
        event.preventDefault()
        event.stopPropagation()
        onContextMenu(event.clientX, event.clientY, d.key)
      })
      .call(
        d3
          .drag<SVGGElement, D3Node>()
          .on('start', (_event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
            if (!_event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (_event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
            if (!_event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }),
      )

    nodeGSelRef.current = nodeGSel

    // -- outer glow
    nodeGSel
      .append('circle')
      .attr('class', 'glow')
      .attr('r', (d) => (20 + d.criticality * 12) * 1.8)
      .attr('fill', (d) => `url(#glow-${d.key})`)

    // -- health arc background (track)
    const arcRadius = (d: D3Node) => 20 + d.criticality * 12 + 5

    nodeGSel
      .append('path')
      .attr('class', 'health-track')
      .attr('fill', 'none')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 3)
      .attr('d', (d) => {
        const r = arcRadius(d)
        return d3.arc()({
          innerRadius: r - 1.5,
          outerRadius: r + 1.5,
          startAngle: 0,
          endAngle: Math.PI * 2,
        })!
      })

    // -- health arc (foreground)
    nodeGSel
      .append('path')
      .attr('class', 'health-arc')
      .attr('fill', 'none')
      .attr('stroke', (d) => STATUS_COLORS[d.status] || STATUS_COLORS.healthy)
      .attr('stroke-width', 3)
      .attr('d', (d) => {
        const r = arcRadius(d)
        const angle = (d.health / 100) * Math.PI * 2
        return d3.arc()({
          innerRadius: r - 1.5,
          outerRadius: r + 1.5,
          startAngle: 0,
          endAngle: Math.max(angle, 0.01),
        })!
      })

    // -- main circle
    nodeGSel
      .append('circle')
      .attr('class', 'main')
      .attr('r', (d) => 20 + d.criticality * 12)
      .attr('fill', (d) => {
        const c = d3.color(STATUS_COLORS[d.status] || STATUS_COLORS.healthy)!
        c.opacity = 0.15
        return c.formatRgb()
      })
      .attr('stroke', (d) => {
        const c = d3.color(STATUS_COLORS[d.status] || STATUS_COLORS.healthy)!
        c.opacity = 0.6
        return c.formatRgb()
      })
      .attr('stroke-width', 2)

    // -- icon
    nodeGSel
      .append('text')
      .attr('class', 'icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', (d) => 12 + d.criticality * 4)
      .attr('fill', (d) => STATUS_COLORS[d.status] || STATUS_COLORS.healthy)
      .attr('pointer-events', 'none')
      .text((d) => NODE_ICONS[d.type] || '\u2699')

    // -- label
    nodeGSel
      .append('text')
      .attr('class', 'label')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => 20 + d.criticality * 12 + 20)
      .attr('font-size', 11)
      .attr('fill', '#9ca3af')
      .attr('pointer-events', 'none')
      .text((d) => d.label)

    // -- failure indicator
    nodeGSel
      .append('text')
      .attr('class', 'failure-badge')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => -(20 + d.criticality * 12) - 6)
      .attr('font-size', 14)
      .attr('fill', '#ef4444')
      .attr('pointer-events', 'none')
      .text((d) => (d.failureMode ? '!' : ''))

    // ---- tick handler ----
    simulation.on('tick', () => {
      linkSel
        .attr('x1', (d) => ((d.source as D3Node).x ?? 0))
        .attr('y1', (d) => ((d.source as D3Node).y ?? 0))
        .attr('x2', (d) => ((d.target as D3Node).x ?? 0))
        .attr('y2', (d) => ((d.target as D3Node).y ?? 0))

      nodeGSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })
  }, [sim, selectNode, onContextMenu])

  /* ---------------------------------------------------------------- */
  /*  Initial setup & topology-change rebuild                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!sim?.topology) return
    const topoId = sim.topology.id
    if (topoId === prevTopoIdRef.current) return
    prevTopoIdRef.current = topoId
    prevFailedRef.current = new Set()
    buildSimulation()
  }, [sim?.topology, buildSimulation])

  /* ---------------------------------------------------------------- */
  /*  Per-tick visual updates (NO force rebuild)                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!sim || !nodeGSelRef.current || !linkSelRef.current) return

    const nodeMap = new Map(sim.nodes.map((n) => [n.key, n]))
    const d3Nodes = nodesRef.current
    const d3Links = linksRef.current
    const svg = svgRef.current ? d3.select(svgRef.current) : null

    // Sync live data into D3 node objects
    for (const d3n of d3Nodes) {
      const live = nodeMap.get(d3n.key)
      if (!live) continue
      d3n.health = live.health
      d3n.load = live.load
      d3n.status = live.status
      d3n.latency = live.latency
      d3n.errorRate = live.errorRate
      d3n.throughput = live.throughput
      d3n.failureMode = live.failureMode
    }

    const t = d3.transition().duration(300) as unknown as d3.Transition<
      d3.BaseType,
      unknown,
      null,
      undefined
    >

    const defs = svg?.select<SVGDefsElement>('defs')

    // Update gradients
    if (defs) {
      d3Nodes.forEach((n) => {
        const color = STATUS_COLORS[n.status] || STATUS_COLORS.healthy
        const grad = defs.select(`#glow-${n.key}`)
        if (!grad.empty()) {
          grad.select('stop:first-child').attr('stop-color', color)
          grad.select('stop:last-child').attr('stop-color', color)
        }
      })
    }

    // Update node visuals
    const nodeGSel = nodeGSelRef.current

    nodeGSel.select<SVGCircleElement>('circle.main').each(function (d) {
      const color = STATUS_COLORS[d.status] || STATUS_COLORS.healthy
      const fillC = d3.color(color)!
      fillC.opacity = 0.15
      const strokeC = d3.color(color)!
      strokeC.opacity = 0.6
      d3.select(this)
        .transition(t as any)
        .attr('fill', fillC.formatRgb())
        .attr('stroke', strokeC.formatRgb())
    })

    nodeGSel.select<SVGTextElement>('text.icon').each(function (d) {
      d3.select(this)
        .transition(t as any)
        .attr('fill', STATUS_COLORS[d.status] || STATUS_COLORS.healthy)
    })

    // Update health arcs
    nodeGSel.select<SVGPathElement>('path.health-arc').each(function (d) {
      const r = 20 + d.criticality * 12 + 5
      const angle = (d.health / 100) * Math.PI * 2
      d3.select(this)
        .transition(t as any)
        .attr('stroke', STATUS_COLORS[d.status] || STATUS_COLORS.healthy)
        .attr('d', () =>
          d3.arc()({
            innerRadius: r - 1.5,
            outerRadius: r + 1.5,
            startAngle: 0,
            endAngle: Math.max(angle, 0.01),
          })!,
        )
    })

    // Update failure badge
    nodeGSel.select<SVGTextElement>('text.failure-badge').text((d) =>
      d.failureMode ? '!' : '',
    )

    // Shockwave on NEW failures
    const currentFailed = new Set(
      sim.nodes.filter((n) => n.failureMode).map((n) => n.key),
    )
    for (const key of currentFailed) {
      if (!prevFailedRef.current.has(key)) {
        triggerShockwave(key)
      }
    }
    prevFailedRef.current = currentFailed

    // Update edge colors
    const linkSel = linkSelRef.current
    linkSel.each(function (d) {
      d3.select(this)
        .transition(t as any)
        .attr('stroke', edgeColor(d, d3Nodes))
    })

    // Dependency highlighting
    if (selectedNode) {
      const connectedEdgeIds = new Set<number>()
      const connectedNodeKeys = new Set<string>([selectedNode])
      for (const link of d3Links) {
        const sKey = typeof link.source === 'object' ? (link.source as D3Node).key : link.sourceKey
        const tKey = typeof link.target === 'object' ? (link.target as D3Node).key : link.targetKey
        if (sKey === selectedNode || tKey === selectedNode) {
          connectedEdgeIds.add(link.id)
          connectedNodeKeys.add(sKey)
          connectedNodeKeys.add(tKey)
        }
      }

      linkSel
        .transition(t as any)
        .attr('opacity', (d) => (connectedEdgeIds.has(d.id) ? 0.8 : 0.1))
        .attr('stroke-width', (d) =>
          connectedEdgeIds.has(d.id) ? 2 + d.weight * 2 : 1 + d.weight * 2,
        )

      nodeGSel
        .transition(t as any)
        .attr('opacity', (d) => (connectedNodeKeys.has(d.key) ? 1 : 0.35))
    } else {
      linkSel
        .transition(t as any)
        .attr('opacity', 0.3)
        .attr('stroke-width', (d) => 1 + d.weight * 2)

      nodeGSel.transition(t as any).attr('opacity', 1)
    }
  }, [sim, selectedNode, triggerShockwave])

  /* ---------------------------------------------------------------- */
  /*  Resize observer                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          sizeRef.current = { width, height }
          if (svgRef.current) {
            d3.select(svgRef.current).attr('width', width).attr('height', height)
          }
          if (simRef.current) {
            simRef.current.force('center', d3.forceCenter(width / 2, height / 2))
            simRef.current.alpha(0.1).restart()
          }
        }
      }
    })

    ro.observe(container)

    // Set initial size
    const rect = container.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      sizeRef.current = { width: rect.width, height: rect.height }
    }

    return () => ro.disconnect()
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Initial SVG creation (runs once)                                 */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (svgRef.current) return // already created

    const { width, height } = sizeRef.current
    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('width', '100%')
      .style('height', '100%')
      .style('display', 'block')

    svgRef.current = svg.node()

    // ---- background grid pattern ----
    const defs = svg.append('defs')

    const pattern = defs
      .append('pattern')
      .attr('id', 'grid-pattern')
      .attr('width', 40)
      .attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse')

    pattern
      .append('path')
      .attr('d', 'M 40 0 L 0 0 0 40')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(30,41,59,0.3)')
      .attr('stroke-width', 1)

    svg
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'url(#grid-pattern)')

    return () => {
      if (simRef.current) {
        simRef.current.stop()
        simRef.current = null
      }
      if (svgRef.current) {
        d3.select(svgRef.current).remove()
        svgRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  )
})

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function edgeColor(link: D3Link, nodes: D3Node[]): string {
  const sourceNode =
    typeof link.source === 'object' ? (link.source as D3Node) : nodes.find((n) => n.key === link.sourceKey)
  const targetNode =
    typeof link.target === 'object' ? (link.target as D3Node) : nodes.find((n) => n.key === link.targetKey)

  if (!sourceNode || !targetNode) return '#06b6d4'

  const sourceHealth = sourceNode.health
  const targetHealth = targetNode.health

  if (sourceHealth <= 30 || targetHealth <= 30) return '#ef4444'
  if (sourceHealth <= 65 || targetHealth <= 65) return '#f59e0b'
  return '#06b6d4'
}

export default NetworkGraph
