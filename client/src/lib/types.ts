export type NodeType = 'service' | 'database' | 'cache' | 'queue' | 'gateway' | 'cdn' | 'load_balancer' | 'external' | 'dns'
export type NodeStatus = 'healthy' | 'degraded' | 'failing' | 'failed' | 'recovering'
export type EdgeType = 'sync' | 'async' | 'data' | 'health'
export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface ResiliencePatterns {
  circuitBreaker: boolean
  retry: boolean
  fallback: boolean
  redundancy: boolean
  rateLimit: boolean
}

export interface NodeConfig {
  maxHealth: number
  recoveryRate: number
  baseLatency: number
}

export interface SimNode {
  key: string
  label: string
  type: NodeType
  x: number
  y: number
  health: number
  load: number
  status: NodeStatus
  latency: number
  errorRate: number
  throughput: number
  criticality: number
  revenueShare: number
  failureMode: string | null
  resilience: ResiliencePatterns
  config: NodeConfig
}

export interface SimEdge {
  id: number
  sourceKey: string
  targetKey: string
  weight: number
  edgeType: EdgeType
  baseLatency: number
}

export interface SimEvent {
  tick: number
  timestamp: number
  type: string
  nodeKey: string | null
  data: Record<string, unknown>
}

export interface Scenario {
  id: number
  name: string
  description: string
  company: string
  incidentDate: string
}

export interface FailureMode {
  id: number
  name: string
  slug: string
  description: string
  icon: string
  propagationType: 'immediate' | 'gradual' | 'threshold'
  defaultSeverity: number
  healthImpact: number
  loadImpact: number
  latencyImpact: number
  spreadRate: number
}

export interface Topology {
  id: number
  name: string
  description: string
  category: string
  revenuePerMin: number
}

export interface MetricsSnapshot {
  tick: number
  overallHealth: number
  nodesHealthy: number
  nodesDegraded: number
  nodesFailed: number
  avgLatency: number
  errorRate: number
  throughput: number
}

export interface FinancialImpact {
  revenuePerMin: number
  totalPerMin: number
  totalAccumulated: number
  affectedNodes: Array<{
    key: string
    label: string
    revenueShare: number
    healthPct: number
    impactPerMin: number
  }>
}

export interface ResilienceBreakdown {
  [key: string]: {
    weight: number
    score: number
    coverage?: number
    spofs?: number
    avgRate?: number
  }
}

export interface Recommendation {
  nodeKey: string | null
  severity: Severity
  category: string
  title: string
  description: string
  estimatedImpact: number
}

export interface ActiveScenario {
  id: number
  name: string
  description: string
  sequence: Array<{ tick: number; nodeKey: string; failureMode: string }>
}

export interface SimulationState {
  topology: Topology | null
  nodes: SimNode[]
  edges: SimEdge[]
  tick: number
  running: boolean
  paused: boolean
  speed: number
  events: SimEvent[]
  metrics: MetricsSnapshot[]
  scenarios: Scenario[]
  activeScenario: ActiveScenario | null
  resilienceScore: number
  resilienceBreakdown: ResilienceBreakdown
  financialImpact: FinancialImpact
  failureModes: FailureMode[]
  recommendations: Recommendation[]
  chaosMode?: boolean
  mttr?: number
  mttf?: number
  blastRadius?: number
}

export interface WsMessage {
  type: string
  data?: SimulationState
  message?: string
  context?: string
  [key: string]: unknown
}

export type ResiliencePattern = keyof ResiliencePatterns
