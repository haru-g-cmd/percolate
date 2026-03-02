const pool = require('../models/db');

// ---------------------------------------------------------------------------
// Resilience pattern mitigation factors
// ---------------------------------------------------------------------------
const RESILIENCE_MITIGATION = {
  circuitBreaker: { factor: 0.75, threshold: 0.5 },  // 75% reduction when severity > 0.5
  retry:          { factor: 0.30, threshold: 0   },   // 30% reduction always
  fallback:       { factor: 0.50, threshold: 0   },   // 50% reduction always
  redundancy:     { factor: 0.60, threshold: 0   },   // 60% reduction always
  rateLimit:      { factor: 0.20, threshold: 0   }    // 20% reduction always
};

// ---------------------------------------------------------------------------
// Status thresholds
// ---------------------------------------------------------------------------
function statusFromHealth(health, isRecovering) {
  if (isRecovering) return 'recovering';
  if (health <= 0) return 'failed';
  if (health <= 30) return 'failing';
  if (health <= 65) return 'degraded';
  return 'healthy';
}

// ---------------------------------------------------------------------------
// SimulationManager
// ---------------------------------------------------------------------------
class SimulationManager {
  constructor() {
    // Topology data (loaded from DB)
    this.topology = null;
    this.dbNodes = [];
    this.dbEdges = [];
    this.failureModes = [];
    this.scenarios = [];

    // In-memory node state  key -> state object
    this.nodeStates = new Map();

    // Edge list (enriched with source_key / target_key)
    this.edges = [];

    // Simulation control
    this.tick = 0;
    this.running = false;
    this.paused = false;
    this.speed = 1;            // multiplier: 0.5 = slow, 1 = normal, 2 = fast
    this.tickTimer = null;
    this.tickCallback = null;

    // Active scenario
    this.activeScenario = null;

    // Chaos mode
    this.chaosMode = false;
    this.chaosInterval = 30;  // 1/chaosInterval chance per tick

    // MTTR / MTTF tracking
    this.failureTimestamps = [];
    this.recoveryTimestamps = [];

    // Event log (ring buffer, last 50)
    this.events = [];
    this.maxEvents = 50;

    // Metrics snapshots (last 100)
    this.metrics = [];
    this.maxMetrics = 100;
  }

  // -----------------------------------------------------------------------
  // Database loaders
  // -----------------------------------------------------------------------

  async loadTopology(id) {
    this.stop();

    const [topologies] = await pool.query('SELECT * FROM topologies WHERE id = ?', [id]);
    if (topologies.length === 0) throw new Error(`Topology ${id} not found`);
    this.topology = topologies[0];

    const [nodes] = await pool.query('SELECT * FROM nodes WHERE topology_id = ?', [id]);
    this.dbNodes = nodes;

    const [edges] = await pool.query(
      `SELECT e.*, sn.node_key AS source_key, tn.node_key AS target_key
       FROM edges e
       JOIN nodes sn ON e.source_node_id = sn.id
       JOIN nodes tn ON e.target_node_id = tn.id
       WHERE e.topology_id = ?`,
      [id]
    );
    this.dbEdges = edges;

    const [failureModes] = await pool.query('SELECT * FROM failure_modes');
    this.failureModes = failureModes;

    const [scenarios] = await pool.query('SELECT * FROM scenarios WHERE topology_id = ?', [id]);
    this.scenarios = scenarios;

    this._initializeState();
    return this.getState();
  }

  async loadScenario(scenarioId) {
    const scenario = this.scenarios.find(s => s.id === Number(scenarioId));
    if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);

    // Reset simulation state before loading scenario
    this.reset();
    this.activeScenario = {
      ...scenario,
      sequence: typeof scenario.failure_sequence === 'string'
        ? JSON.parse(scenario.failure_sequence)
        : scenario.failure_sequence
    };

    this._addEvent('scenario_loaded', null, {
      name: scenario.name,
      description: scenario.description
    });

    return this.getState();
  }

  // -----------------------------------------------------------------------
  // State initialization
  // -----------------------------------------------------------------------

  _initializeState() {
    this.nodeStates.clear();
    this.edges = [];
    this.tick = 0;
    this.running = false;
    this.paused = false;
    this.events = [];
    this.metrics = [];
    this.activeScenario = null;
    this.failureTimestamps = [];
    this.recoveryTimestamps = [];

    for (const n of this.dbNodes) {
      const config = typeof n.config === 'string' ? JSON.parse(n.config) : (n.config || {});
      const resilience = typeof n.resilience === 'string' ? JSON.parse(n.resilience) : (n.resilience || {});

      this.nodeStates.set(n.node_key, {
        key: n.node_key,
        label: n.label,
        type: n.node_type,
        x: n.x,
        y: n.y,
        health: config.maxHealth || 100,
        load: 0,
        status: 'healthy',
        latency: config.baseLatency || 10,
        errorRate: 0,
        throughput: 100,
        criticality: n.criticality || 0.5,
        revenueShare: n.revenue_share || 0,
        failureMode: null,           // slug of active failure or null
        failureSeverity: 0,          // current severity 0-1
        failureTicksActive: 0,       // how long the failure has been active
        isRecovering: false,
        resilience: {
          circuitBreaker: !!resilience.circuitBreaker,
          retry: !!resilience.retry,
          fallback: !!resilience.fallback,
          redundancy: !!resilience.redundancy,
          rateLimit: !!resilience.rateLimit
        },
        config: {
          maxHealth: config.maxHealth || 100,
          recoveryRate: config.recoveryRate || 2,
          baseLatency: config.baseLatency || 10
        }
      });
    }

    for (const e of this.dbEdges) {
      this.edges.push({
        id: e.id,
        sourceKey: e.source_key,
        targetKey: e.target_key,
        weight: e.weight,
        edgeType: e.edge_type,
        baseLatency: e.base_latency,
        config: typeof e.config === 'string' ? JSON.parse(e.config) : (e.config || {})
      });
    }
  }

  // -----------------------------------------------------------------------
  // Simulation control
  // -----------------------------------------------------------------------

  start(callback) {
    if (this.running && !this.paused) return;
    if (!this.topology) throw new Error('No topology loaded');

    this.running = true;
    this.paused = false;
    this.tickCallback = callback || null;

    this._addEvent('simulation_started', null, { speed: this.speed });
    this._scheduleTick();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this._addEvent('simulation_paused', null, { tick: this.tick });
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this._addEvent('simulation_resumed', null, { tick: this.tick });
    this._scheduleTick();
  }

  stop() {
    this.running = false;
    this.paused = false;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.topology) {
      this._addEvent('simulation_stopped', null, { tick: this.tick });
    }
  }

  reset() {
    this.stop();
    if (this.topology) {
      this._initializeState();
      this._addEvent('simulation_reset', null, {});
    }
  }

  setSpeed(s) {
    this.speed = Math.max(0.25, Math.min(4, Number(s) || 1));
    this._addEvent('speed_changed', null, { speed: this.speed });

    // Reschedule tick with new interval if running
    if (this.running && !this.paused) {
      if (this.tickTimer) clearTimeout(this.tickTimer);
      this._scheduleTick();
    }
  }

  // -----------------------------------------------------------------------
  // Manual interactions
  // -----------------------------------------------------------------------

  injectFailure(nodeKey, failureModeSlug) {
    const node = this.nodeStates.get(nodeKey);
    if (!node) throw new Error(`Node ${nodeKey} not found`);

    const fm = this.failureModes.find(f => f.slug === failureModeSlug);
    if (!fm) throw new Error(`Failure mode ${failureModeSlug} not found`);

    node.failureMode = fm.slug;
    node.failureSeverity = fm.default_severity;
    node.failureTicksActive = 0;
    node.isRecovering = false;

    // Immediate type: apply full impact right away
    if (fm.propagation_type === 'immediate') {
      node.health = Math.max(0, node.health - fm.health_impact);
      node.load = Math.min(100, node.load + fm.load_impact);
      node.latency = node.latency + fm.latency_impact;
      node.errorRate = Math.min(100, node.errorRate + fm.default_severity * 60);
    }

    node.status = statusFromHealth(node.health, node.isRecovering);

    this._addEvent('failure_injected', nodeKey, {
      failureMode: fm.slug,
      name: fm.name,
      severity: fm.default_severity,
      propagationType: fm.propagation_type
    });

    return this.getState();
  }

  healNode(nodeKey) {
    const node = this.nodeStates.get(nodeKey);
    if (!node) throw new Error(`Node ${nodeKey} not found`);

    node.failureMode = null;
    node.failureSeverity = 0;
    node.failureTicksActive = 0;
    node.isRecovering = true;
    node.health = Math.max(node.health, 30); // Bump up from 0 if needed
    node.status = statusFromHealth(node.health, node.isRecovering);

    this._addEvent('node_healed', nodeKey, { health: node.health });
    return this.getState();
  }

  toggleResilience(nodeKey, pattern) {
    const node = this.nodeStates.get(nodeKey);
    if (!node) throw new Error(`Node ${nodeKey} not found`);
    if (!RESILIENCE_MITIGATION[pattern]) throw new Error(`Unknown pattern: ${pattern}`);

    node.resilience[pattern] = !node.resilience[pattern];

    this._addEvent('resilience_toggled', nodeKey, {
      pattern,
      enabled: node.resilience[pattern]
    });

    return this.getState();
  }

  // -----------------------------------------------------------------------
  // Chaos mode controls
  // -----------------------------------------------------------------------

  toggleChaos() {
    this.chaosMode = !this.chaosMode;
    this._addEvent('chaos_toggled', null, { chaosMode: this.chaosMode, chaosInterval: this.chaosInterval });
    return this.getState();
  }

  setChaosInterval(n) {
    this.chaosInterval = Math.max(1, Math.floor(Number(n) || 30));
    this._addEvent('chaos_interval_changed', null, { chaosInterval: this.chaosInterval });
    return this.getState();
  }

  _processChaos() {
    if (!this.chaosMode || this.failureModes.length === 0) return;

    if (Math.random() < 1 / this.chaosInterval) {
      // Collect healthy nodes (no active failure)
      const healthyNodes = [];
      for (const [key, node] of this.nodeStates) {
        if (!node.failureMode && node.status === 'healthy') {
          healthyNodes.push(key);
        }
      }
      if (healthyNodes.length === 0) return;

      const targetKey = healthyNodes[Math.floor(Math.random() * healthyNodes.length)];
      const fm = this.failureModes[Math.floor(Math.random() * this.failureModes.length)];

      this._addEvent('chaos_injection', targetKey, {
        failureMode: fm.slug,
        name: fm.name
      });

      this.injectFailure(targetKey, fm.slug);
    }
  }

  // -----------------------------------------------------------------------
  // Tick processing
  // -----------------------------------------------------------------------

  _scheduleTick() {
    if (!this.running || this.paused) return;
    const interval = Math.round(1000 / this.speed);
    this.tickTimer = setTimeout(() => this.processTick(), interval);
  }

  processTick() {
    if (!this.running || this.paused) return;

    this.tick++;

    // 1. Process scenario events for this tick
    this._processScenarioTick();

    // 1.5. Chaos mode: randomly inject failures
    this._processChaos();

    // 2. Apply active failure effects to each node
    this._applyFailureEffects();

    // 3. Propagate failures through edges
    this.propagateFailures();

    // 4. Natural recovery for nodes without active failures
    this._applyRecovery();

    // 5. Update derived metrics (throughput, error rate adjustments)
    this._updateDerivedMetrics();

    // 6. Record metrics snapshot every 5 ticks
    if (this.tick % 5 === 0) {
      this._recordMetrics();
    }

    // 7. Emit callback
    if (this.tickCallback) {
      try {
        this.tickCallback(this.getState());
      } catch (err) {
        console.error('Tick callback error:', err.message);
      }
    }

    // 8. Schedule next tick
    this._scheduleTick();
  }

  _processScenarioTick() {
    if (!this.activeScenario || !this.activeScenario.sequence) return;

    for (const event of this.activeScenario.sequence) {
      if (event.tick === this.tick) {
        try {
          this.injectFailure(event.nodeKey, event.failureMode);
          this._addEvent('scenario_failure', event.nodeKey, {
            scenario: this.activeScenario.name,
            failureMode: event.failureMode,
            tick: this.tick
          });
        } catch (err) {
          console.error(`Scenario tick error: ${err.message}`);
        }
      }
    }
  }

  _applyFailureEffects() {
    for (const [, node] of this.nodeStates) {
      if (!node.failureMode) continue;

      const fm = this.failureModes.find(f => f.slug === node.failureMode);
      if (!fm) continue;

      node.failureTicksActive++;

      switch (fm.propagation_type) {
        case 'gradual': {
          // Steady per-tick degradation
          const healthDrop = fm.health_impact * (0.8 + Math.random() * 0.4);
          node.health = Math.max(0, node.health - healthDrop);
          node.load = Math.min(100, node.load + fm.load_impact * (0.5 + Math.random() * 0.5));
          node.latency = Math.min(
            node.config.baseLatency * 20,
            node.latency + fm.latency_impact * 0.1 * (1 + node.failureTicksActive * 0.05)
          );
          break;
        }

        case 'threshold': {
          // Slow decline, then sudden collapse after threshold
          const thresholdTick = 15;
          if (node.failureTicksActive < thresholdTick) {
            // Pre-threshold: slow degradation
            node.health = Math.max(20, node.health - fm.health_impact * 0.15);
            node.load = Math.min(80, node.load + fm.load_impact * 0.3);
            node.latency = Math.min(
              node.config.baseLatency * 10,
              node.latency + fm.latency_impact * 0.05
            );
          } else {
            // Post-threshold: rapid collapse
            const escalation = 1 + (node.failureTicksActive - thresholdTick) * 0.3;
            node.health = Math.max(0, node.health - fm.health_impact * 0.6 * escalation);
            node.load = Math.min(100, node.load + fm.load_impact * escalation);
            node.latency = Math.min(
              node.config.baseLatency * 30,
              node.latency + fm.latency_impact * 0.3 * escalation
            );

            if (node.failureTicksActive === thresholdTick) {
              this._addEvent('threshold_breach', node.key, {
                failureMode: fm.slug,
                ticksActive: node.failureTicksActive
              });
            }
          }
          break;
        }

        case 'immediate': {
          // Immediate already applied on inject; keep at damaged state
          // Small continued degradation if not at zero
          if (node.health > 0) {
            node.health = Math.max(0, node.health - fm.health_impact * 0.05);
          }
          break;
        }
      }

      // Update error rate based on health
      node.errorRate = Math.min(100, Math.max(0, (100 - node.health) * 0.8 + Math.random() * 5));
      const prevStatus = node.status;
      node.status = statusFromHealth(node.health, node.isRecovering);

      // Emit events only on status transitions
      if (prevStatus !== node.status) {
        if (node.status === 'failed') {
          this._addEvent('node_failed', node.key, { failureMode: node.failureMode, ticksActive: node.failureTicksActive });
          // MTTR/MTTF: record failure timestamp
          this.failureTimestamps.push({ nodeKey: node.key, tick: this.tick });
        } else if (node.status === 'degraded' && prevStatus === 'healthy') {
          this._addEvent('node_degraded', node.key, { health: Math.round(node.health) });
        } else if (node.status === 'failing') {
          this._addEvent('node_critical', node.key, { health: Math.round(node.health) });
        }
      }
    }
  }

  propagateFailures() {
    // For each edge: if source has a failure, propagate impact to target
    // Direction: source CALLS target, so source failure affects target's callers
    // But also: target failure affects source (source depends on target)
    for (const edge of this.edges) {
      const source = this.nodeStates.get(edge.sourceKey);
      const target = this.nodeStates.get(edge.targetKey);
      if (!source || !target) continue;

      // Propagate target failures UP to source (source depends on target)
      if (target.failureMode && target.health < 80) {
        const fm = this.failureModes.find(f => f.slug === target.failureMode);
        if (!fm) continue;

        const severity = (100 - target.health) / 100;
        let impact = edge.weight * severity * fm.spread_rate;

        // Async edges propagate less
        if (edge.edgeType === 'async') {
          impact *= 0.4;
        }

        // Apply resilience mitigation from the SOURCE node (the one receiving impact)
        impact = this._applyResilienceMitigation(source, impact, severity);

        // Apply degradation to source
        if (impact > 0) {
          const healthDrop = impact * 35; // scale to meaningful health impact
          source.health = Math.max(0, source.health - healthDrop);
          source.load = Math.min(100, source.load + impact * 10);
          source.latency = Math.min(
            source.config.baseLatency * 25,
            source.latency + impact * edge.baseLatency * 0.5
          );
          source.errorRate = Math.min(100, source.errorRate + impact * 8);
          const prevStatus = source.status;
          source.status = statusFromHealth(source.health, source.isRecovering);
          // Emit failure propagation events
          if (prevStatus !== source.status) {
            if (source.status === 'degraded' && prevStatus === 'healthy') {
              this._addEvent('percolate_degraded', source.key, { cause: target.key, health: Math.round(source.health) });
            } else if (source.status === 'failed') {
              this._addEvent('percolate_failed', source.key, { cause: target.key });
            } else if (source.status === 'failing') {
              this._addEvent('percolate_critical', source.key, { cause: target.key, health: Math.round(source.health) });
            }
          }
        }
      }

      // Propagate source failures DOWN to target (if source floods target)
      if (source.failureMode && source.health < 50 && edge.edgeType !== 'async') {
        const severity = (100 - source.health) / 100;
        let impact = edge.weight * severity * 0.15; // downstream is weaker

        impact = this._applyResilienceMitigation(target, impact, severity);

        if (impact > 0) {
          target.load = Math.min(100, target.load + impact * 8);
          target.latency = Math.min(
            target.config.baseLatency * 15,
            target.latency + impact * edge.baseLatency * 0.3
          );
        }
      }
    }
  }

  _applyResilienceMitigation(node, impact, severity) {
    let mitigated = impact;

    for (const [pattern, config] of Object.entries(RESILIENCE_MITIGATION)) {
      if (node.resilience[pattern] && severity >= config.threshold) {
        mitigated *= (1 - config.factor);
      }
    }

    // Cap total mitigation at 80%, at least 20% of impact always gets through
    const minImpact = impact * 0.20;
    return Math.max(mitigated, minImpact);
  }

  // Check if a node has any failing dependencies
  _hasFailingDependency(nodeKey) {
    for (const edge of this.edges) {
      if (edge.sourceKey === nodeKey) {
        const target = this.nodeStates.get(edge.targetKey);
        if (target && target.failureMode && target.health < 50) return true;
      }
    }
    return false;
  }

  _applyRecovery() {
    for (const [key, node] of this.nodeStates) {
      // Only recover if no active failure
      if (node.failureMode) continue;
      // Suppress recovery if dependencies are still failing
      if (this._hasFailingDependency(key)) continue;

      const rate = node.config.recoveryRate;

      if (node.health < node.config.maxHealth) {
        node.isRecovering = true;
        node.health = Math.min(node.config.maxHealth, node.health + rate * (0.8 + Math.random() * 0.4));

        // Recover load
        if (node.load > 0) {
          node.load = Math.max(0, node.load - rate * 1.5);
        }

        // Recover latency toward baseline
        if (node.latency > node.config.baseLatency) {
          const latencyDelta = node.latency - node.config.baseLatency;
          node.latency = node.config.baseLatency + latencyDelta * 0.85;
        }

        // Recover error rate
        if (node.errorRate > 0) {
          node.errorRate = Math.max(0, node.errorRate - rate * 2);
        }
      } else {
        node.isRecovering = false;
      }

      // Recover throughput based on health
      node.throughput = Math.max(0, node.health * (1 - node.load / 200));
      const prevStatus = node.status;
      node.status = statusFromHealth(node.health, node.isRecovering);
      if (prevStatus !== node.status) {
        // MTTR/MTTF: record recovery timestamp when transitioning from failed/failing
        if ((prevStatus === 'failed' || prevStatus === 'failing') &&
            (node.status === 'recovering' || node.status === 'healthy')) {
          this.recoveryTimestamps.push({ nodeKey: key, tick: this.tick });
        }

        if (node.status === 'healthy' && prevStatus !== 'healthy') {
          this._addEvent('recovery_completed', key, { health: Math.round(node.health) });
        } else if (node.isRecovering && prevStatus === 'failed') {
          this._addEvent('recovery_started', key, { health: Math.round(node.health) });
        }
      }
    }
  }

  _updateDerivedMetrics() {
    for (const [, node] of this.nodeStates) {
      // Throughput degrades with poor health and high load
      const healthFactor = node.health / 100;
      const loadFactor = Math.max(0, 1 - node.load / 120);
      node.throughput = Math.max(0, Math.min(100, 100 * healthFactor * loadFactor));

      // Add jitter for realism
      if (node.health > 0 && node.health < 100) {
        node.latency += (Math.random() - 0.5) * 5;
        node.latency = Math.max(node.config.baseLatency * 0.5, node.latency);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Metrics recording
  // -----------------------------------------------------------------------

  _recordMetrics() {
    const nodes = Array.from(this.nodeStates.values());
    const totalNodes = nodes.length;
    if (totalNodes === 0) return;

    const healthy = nodes.filter(n => n.status === 'healthy').length;
    const degraded = nodes.filter(n => n.status === 'degraded' || n.status === 'recovering').length;
    const failed = nodes.filter(n => n.status === 'failed' || n.status === 'failing').length;
    const overallHealth = nodes.reduce((sum, n) => sum + n.health, 0) / totalNodes;
    const avgLatency = nodes.reduce((sum, n) => sum + n.latency, 0) / totalNodes;
    const errorRate = nodes.reduce((sum, n) => sum + n.errorRate, 0) / totalNodes;
    const throughput = nodes.reduce((sum, n) => sum + n.throughput, 0) / totalNodes;

    const snapshot = {
      tick: this.tick,
      overallHealth: Math.round(overallHealth * 100) / 100,
      nodesHealthy: healthy,
      nodesDegraded: degraded,
      nodesFailed: failed,
      avgLatency: Math.round(avgLatency * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      throughput: Math.round(throughput * 100) / 100
    };

    this.metrics.push(snapshot);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  // -----------------------------------------------------------------------
  // Resilience score (0-100)
  // -----------------------------------------------------------------------

  calculateResilienceScore() {
    const nodes = Array.from(this.nodeStates.values());
    if (nodes.length === 0) return { score: 0, breakdown: {} };

    const criticalNodes = nodes.filter(n => n.criticality >= 0.7);
    const totalCritical = criticalNodes.length || 1;

    // 1. Redundancy coverage of critical nodes (25%)
    const redundancyCoverage = criticalNodes.filter(n => n.resilience.redundancy).length / totalCritical;
    const redundancyScore = redundancyCoverage * 25;

    // 2. Circuit breaker coverage (20%)
    const cbCoverage = criticalNodes.filter(n => n.resilience.circuitBreaker).length / totalCritical;
    const cbScore = cbCoverage * 20;

    // 3. Graceful degradation: fallback + retry coverage (20%)
    const degradationCoverage = nodes.filter(
      n => n.resilience.fallback || n.resilience.retry
    ).length / nodes.length;
    const degradationScore = degradationCoverage * 20;

    // 4. Single points of failure penalty (20%)
    const spofs = this._findSinglePointsOfFailure();
    const spofPenalty = Math.min(1, spofs.length / Math.max(1, criticalNodes.length));
    const spofScore = (1 - spofPenalty) * 20;

    // 5. Recovery capability (15%)
    const avgRecovery = nodes.reduce((s, n) => s + n.config.recoveryRate, 0) / nodes.length;
    const recoveryCoverage = Math.min(1, avgRecovery / 5); // 5 is excellent recovery rate
    const recoveryScore = recoveryCoverage * 15;

    const totalScore = Math.round((redundancyScore + cbScore + degradationScore + spofScore + recoveryScore) * 100) / 100;

    return {
      score: Math.min(100, totalScore),
      breakdown: {
        redundancy: { weight: 25, score: Math.round(redundancyScore * 100) / 100, coverage: redundancyCoverage },
        circuitBreaker: { weight: 20, score: Math.round(cbScore * 100) / 100, coverage: cbCoverage },
        gracefulDegradation: { weight: 20, score: Math.round(degradationScore * 100) / 100, coverage: degradationCoverage },
        singlePointsOfFailure: { weight: 20, score: Math.round(spofScore * 100) / 100, spofs: spofs.length },
        recoveryCapability: { weight: 15, score: Math.round(recoveryScore * 100) / 100, avgRate: avgRecovery }
      }
    };
  }

  _findSinglePointsOfFailure() {
    const spofs = [];

    for (const [key, node] of this.nodeStates) {
      if (node.criticality < 0.5) continue;

      // A node is a SPOF if it has no redundancy AND multiple dependents rely on it
      const dependents = this.edges.filter(e => e.targetKey === key);
      if (dependents.length >= 2 && !node.resilience.redundancy) {
        spofs.push(key);
      }
    }

    return spofs;
  }

  // -----------------------------------------------------------------------
  // Financial impact
  // -----------------------------------------------------------------------

  calculateFinancialImpact() {
    if (!this.topology) return { totalPerMin: 0, affectedNodes: [] };

    const revenuePerMin = this.topology.revenue_per_min || 0;
    const affected = [];
    let totalImpact = 0;

    for (const [, node] of this.nodeStates) {
      if (node.revenueShare > 0 && node.health < 100) {
        const impactFraction = node.revenueShare * (1 - node.health / 100);
        const impact = revenuePerMin * impactFraction;
        totalImpact += impact;
        affected.push({
          key: node.key,
          label: node.label,
          revenueShare: node.revenueShare,
          healthPct: Math.round(node.health),
          impactPerMin: Math.round(impact * 100) / 100
        });
      }
    }

    return {
      revenuePerMin,
      totalPerMin: Math.round(totalImpact * 100) / 100,
      totalAccumulated: Math.round(totalImpact * (this.tick / 60) * 100) / 100,  // ticks ~= seconds
      affectedNodes: affected
    };
  }

  // -----------------------------------------------------------------------
  // Recommendations
  // -----------------------------------------------------------------------

  generateRecommendations() {
    const recommendations = [];
    const nodes = Array.from(this.nodeStates.values());

    // 1. SPOFs
    const spofs = this._findSinglePointsOfFailure();
    for (const spofKey of spofs) {
      const node = this.nodeStates.get(spofKey);
      recommendations.push({
        nodeKey: spofKey,
        severity: node.criticality >= 0.9 ? 'critical' : 'high',
        category: 'single_point_of_failure',
        title: `${node.label} is a single point of failure`,
        description: `This node has ${this.edges.filter(e => e.targetKey === spofKey).length} dependents and no redundancy. Its failure would percolate to multiple services.`,
        estimatedImpact: 8
      });
    }

    // 2. Missing circuit breakers on critical nodes
    for (const node of nodes) {
      if (node.criticality >= 0.7 && !node.resilience.circuitBreaker) {
        // Check if it has downstream dependencies
        const hasDeps = this.edges.some(e => e.sourceKey === node.key);
        if (hasDeps) {
          recommendations.push({
            nodeKey: node.key,
            severity: 'high',
            category: 'missing_circuit_breaker',
            title: `Add circuit breaker to ${node.label}`,
            description: `This critical service (criticality: ${node.criticality}) calls downstream dependencies without a circuit breaker. Failures will percolate directly.`,
            estimatedImpact: 6
          });
        }
      }
    }

    // 3. Missing fallbacks on services with high revenue share
    for (const node of nodes) {
      if (node.revenueShare >= 0.15 && !node.resilience.fallback) {
        recommendations.push({
          nodeKey: node.key,
          severity: 'medium',
          category: 'missing_fallback',
          title: `Add fallback for ${node.label}`,
          description: `This service accounts for ${Math.round(node.revenueShare * 100)}% of revenue. A fallback would prevent complete failure from impacting revenue.`,
          estimatedImpact: 5
        });
      }
    }

    // 4. High fan-in nodes (many things depend on them)
    for (const [key, node] of this.nodeStates) {
      const incomingEdges = this.edges.filter(e => e.targetKey === key);
      if (incomingEdges.length >= 4) {
        recommendations.push({
          nodeKey: key,
          severity: incomingEdges.length >= 6 ? 'critical' : 'high',
          category: 'high_fan_in',
          title: `${node.label} has high fan-in (${incomingEdges.length} dependents)`,
          description: `${incomingEdges.length} services depend on this node. Consider adding redundancy, rate limiting, or connection pooling to prevent overload.`,
          estimatedImpact: 7
        });
      }
    }

    // Sort by severity then estimated impact
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => {
      const s = severityOrder[a.severity] - severityOrder[b.severity];
      if (s !== 0) return s;
      return b.estimatedImpact - a.estimatedImpact;
    });

    return recommendations;
  }

  // -----------------------------------------------------------------------
  // MTTR / MTTF reliability metrics
  // -----------------------------------------------------------------------

  getReliabilityMetrics() {
    let totalRecoveryTime = 0;
    let recoveryCount = 0;
    let totalTimeBetweenFailures = 0;
    let mttfCount = 0;

    // MTTR: for each recovery, find the most recent prior failure for the same node
    for (const recovery of this.recoveryTimestamps) {
      // Find the latest failure for this node that happened before this recovery
      let latestFailure = null;
      for (const failure of this.failureTimestamps) {
        if (failure.nodeKey === recovery.nodeKey && failure.tick < recovery.tick) {
          if (!latestFailure || failure.tick > latestFailure.tick) {
            latestFailure = failure;
          }
        }
      }
      if (latestFailure) {
        totalRecoveryTime += recovery.tick - latestFailure.tick;
        recoveryCount++;
      }
    }

    // MTTF: for each failure, find the most recent prior recovery for the same node
    for (const failure of this.failureTimestamps) {
      let latestRecovery = null;
      for (const recovery of this.recoveryTimestamps) {
        if (recovery.nodeKey === failure.nodeKey && recovery.tick < failure.tick) {
          if (!latestRecovery || recovery.tick > latestRecovery.tick) {
            latestRecovery = recovery;
          }
        }
      }
      if (latestRecovery) {
        totalTimeBetweenFailures += failure.tick - latestRecovery.tick;
        mttfCount++;
      }
    }

    return {
      mttr: recoveryCount > 0 ? Math.round((totalRecoveryTime / recoveryCount) * 100) / 100 : 0,
      mttf: mttfCount > 0 ? Math.round((totalTimeBetweenFailures / mttfCount) * 100) / 100 : 0
    };
  }

  // -----------------------------------------------------------------------
  // Blast radius
  // -----------------------------------------------------------------------

  calculateBlastRadius() {
    const nodes = Array.from(this.nodeStates.values());
    if (nodes.length === 0) return 0;

    const affected = nodes.filter(
      n => n.status === 'degraded' || n.status === 'failing' || n.status === 'failed'
    ).length;

    return Math.round((affected / nodes.length) * 10000) / 100; // percentage with 2 decimals
  }

  // -----------------------------------------------------------------------
  // Event logging
  // -----------------------------------------------------------------------

  _addEvent(type, nodeKey, data) {
    const event = {
      tick: this.tick,
      timestamp: Date.now(),
      type,
      nodeKey,
      data
    };

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  // -----------------------------------------------------------------------
  // Full state snapshot
  // -----------------------------------------------------------------------

  getState() {
    const nodesArray = [];
    for (const [, node] of this.nodeStates) {
      nodesArray.push({
        key: node.key,
        label: node.label,
        type: node.type,
        x: node.x,
        y: node.y,
        health: Math.round(node.health * 100) / 100,
        load: Math.round(node.load * 100) / 100,
        status: node.status,
        latency: Math.round(node.latency * 100) / 100,
        errorRate: Math.round(node.errorRate * 100) / 100,
        throughput: Math.round(node.throughput * 100) / 100,
        criticality: node.criticality,
        revenueShare: node.revenueShare,
        failureMode: node.failureMode,
        resilience: { ...node.resilience },
        config: { ...node.config }
      });
    }

    const resilienceScore = this.calculateResilienceScore();
    const financialImpact = this.calculateFinancialImpact();
    const reliabilityMetrics = this.getReliabilityMetrics();
    const blastRadius = this.calculateBlastRadius();

    return {
      topology: this.topology ? {
        id: this.topology.id,
        name: this.topology.name,
        description: this.topology.description,
        category: this.topology.category,
        revenuePerMin: this.topology.revenue_per_min
      } : null,
      nodes: nodesArray,
      edges: this.edges.map(e => ({
        id: e.id,
        sourceKey: e.sourceKey,
        targetKey: e.targetKey,
        weight: e.weight,
        edgeType: e.edgeType,
        baseLatency: e.baseLatency
      })),
      tick: this.tick,
      running: this.running,
      paused: this.paused,
      speed: this.speed,
      events: [...this.events],
      metrics: [...this.metrics],
      scenarios: this.scenarios.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        company: s.company,
        incidentDate: s.incident_date
      })),
      activeScenario: this.activeScenario ? {
        id: this.activeScenario.id,
        name: this.activeScenario.name,
        description: this.activeScenario.description,
        sequence: this.activeScenario.sequence
      } : null,
      resilienceScore: resilienceScore.score,
      resilienceBreakdown: resilienceScore.breakdown,
      financialImpact,
      chaosMode: this.chaosMode,
      mttr: reliabilityMetrics.mttr,
      mttf: reliabilityMetrics.mttf,
      blastRadius,
      failureModes: this.failureModes.map(fm => ({
        id: fm.id,
        name: fm.name,
        slug: fm.slug,
        description: fm.description,
        icon: fm.icon,
        propagationType: fm.propagation_type,
        defaultSeverity: fm.default_severity,
        healthImpact: fm.health_impact,
        loadImpact: fm.load_impact,
        latencyImpact: fm.latency_impact,
        spreadRate: fm.spread_rate
      })),
      recommendations: this.generateRecommendations()
    };
  }
}

module.exports = { SimulationManager };
