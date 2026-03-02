/* ===================================================================
   PERCOLATE - Main Application
   WebSocket client, UI orchestration, event handling
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // -----------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const topologySelect  = $('#topology-select');
  const btnPlay         = $('#btn-play');
  const btnPause        = $('#btn-pause');
  const btnReset        = $('#btn-reset');
  const speedSlider     = $('#speed-slider');
  const speedLabel      = $('#speed-label');
  const resilienceScore = $('#resilience-score');
  const financialImpact = $('#financial-impact');
  const overallHealth   = $('#overall-health');
  const tickCounter     = $('#tick-counter');
  const eventsScroll    = $('#events-scroll');
  const scenarioList    = $('#scenario-list');
  const scoreBreakdown  = $('#score-breakdown');
  const recsList        = $('#recommendations-list');
  const btnSaveSim      = $('#btn-save-sim');
  const btnHeal         = $('#btn-heal');
  const contextMenu     = $('#context-menu');
  const tooltip         = $('#tooltip');

  // Canvases
  const networkCanvas = $('#network-canvas');
  const metricsCanvas = $('#metrics-canvas');

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------

  let ws = null;
  let renderer = null;
  let currentState = null;
  let selectedNode = null;
  let metricsHistory = [];  // array of { tick, health, errorRate, throughput }
  const MAX_METRICS = 120;
  let previousFailedNodes = new Set();
  let lastEventCount = 0;

  // -----------------------------------------------------------------
  // Canvas Renderer
  // -----------------------------------------------------------------

  renderer = new CanvasRenderer(networkCanvas);
  window._renderer = renderer; // expose for debugging

  // -----------------------------------------------------------------
  // WebSocket connection
  // -----------------------------------------------------------------

  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      handleMessage(msg);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting in 3s...');
      setTimeout(connectWS, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // -----------------------------------------------------------------
  // Message handler
  // -----------------------------------------------------------------

  function handleMessage(msg) {
    switch (msg.type) {
      case 'connected':
        console.log('Server acknowledged connection');
        // Auto-load topology 1
        fetchTopologies().then(() => {
          send({ type: 'load_topology', topologyId: 1 });
        });
        break;

      case 'topology_loaded':
      case 'scenario_loaded':
      case 'reset':
        currentState = msg.data;
        renderer.updateState(currentState);
        updateAllUI(currentState);
        previousFailedNodes.clear();
        lastEventCount = 0;
        metricsHistory = [];
        eventsScroll.innerHTML = '';
        // Reset button states
        btnPlay.disabled = false;
        btnPause.disabled = true;
        if (msg.type === 'scenario_loaded') {
          // Auto-start the simulation for scenarios
          send({ type: 'start' });
          btnPlay.disabled = true;
          btnPause.disabled = false;
        }
        break;

      case 'tick':
        currentState = msg.data;
        renderer.updateState(currentState);
        updateTickUI(currentState);
        detectNewFailures(currentState);
        break;

      case 'started':
      case 'resumed':
        btnPlay.disabled = true;
        btnPause.disabled = false;
        break;

      case 'paused':
        btnPlay.disabled = false;
        btnPause.disabled = true;
        break;

      case 'failure_injected':
      case 'node_healed':
      case 'resilience_toggled':
        currentState = msg.data;
        renderer.updateState(currentState);
        updateAllUI(currentState);
        if (msg.type === 'failure_injected') {
          // Find which node just got a failure
          const events = currentState.events;
          if (events && events.length > 0) {
            const last = events[events.length - 1];
            if (last.type === 'failure_injected' && last.nodeKey) {
              renderer.addShockwave(last.nodeKey);
            }
          }
        }
        break;

      case 'speed_changed':
        break;

      case 'error':
        console.error('Server error:', msg.message, msg.context || '');
        break;
    }
  }

  // -----------------------------------------------------------------
  // Detect new failures for shockwave effects
  // -----------------------------------------------------------------

  function detectNewFailures(state) {
    if (!state || !state.nodes) return;
    const currentFailed = new Set();
    for (const n of state.nodes) {
      if (n.failureMode) {
        currentFailed.add(n.key);
        if (!previousFailedNodes.has(n.key)) {
          renderer.addShockwave(n.key);
        }
      }
    }
    previousFailedNodes = currentFailed;
  }

  // -----------------------------------------------------------------
  // Fetch topologies for dropdown
  // -----------------------------------------------------------------

  async function fetchTopologies() {
    try {
      const res = await fetch('/api/topologies');
      const data = await res.json();
      // Clear existing options except the placeholder
      topologySelect.innerHTML = '<option value="">Load topology...</option>';
      for (const t of data) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        topologySelect.appendChild(opt);
      }
      // Pre-select topology 1
      if (data.length > 0) {
        topologySelect.value = data[0].id;
      }
    } catch (err) {
      console.error('Failed to fetch topologies:', err);
    }
  }

  // -----------------------------------------------------------------
  // UI Update: Full rebuild
  // -----------------------------------------------------------------

  function updateAllUI(state) {
    if (!state) return;
    updateMetrics(state);
    updateEventFeed(state.events);
    updateMetricsChart(state);
    updateScenarios(state.scenarios);
    updateAnalysis(state);
    if (selectedNode && state.nodes) {
      const node = state.nodes.find(n => n.key === selectedNode);
      if (node) {
        updateNodeDetail(node, state);
      }
    }
    populateFailureModes(state.failureModes);
  }

  // -----------------------------------------------------------------
  // UI Update: Per-tick (lightweight)
  // -----------------------------------------------------------------

  function updateTickUI(state) {
    if (!state) return;
    updateMetrics(state);
    updateEventFeed(state.events);
    updateMetricsChart(state);
    updateAnalysis(state);
    if (selectedNode && state.nodes) {
      const node = state.nodes.find(n => n.key === selectedNode);
      if (node) {
        updateNodeDetail(node, state);
      }
    }
  }

  // -----------------------------------------------------------------
  // Top metrics bar
  // -----------------------------------------------------------------

  function updateMetrics(state) {
    // Resilience score
    const rs = state.resilienceScore;
    if (rs != null) {
      resilienceScore.textContent = Math.round(rs);
      resilienceScore.style.color = rs >= 70 ? '#10b981' : rs >= 40 ? '#f59e0b' : '#ef4444';
    }

    // Financial impact
    const fi = state.financialImpact;
    if (fi) {
      const val = fi.totalPerMin || 0;
      financialImpact.textContent = '$' + formatNumber(val);
    }

    // Average health
    if (state.nodes && state.nodes.length > 0) {
      const avg = state.nodes.reduce((s, n) => s + n.health, 0) / state.nodes.length;
      overallHealth.textContent = Math.round(avg) + '%';
      overallHealth.style.color = avg >= 70 ? '#10b981' : avg >= 40 ? '#f59e0b' : '#ef4444';
    }

    // Tick
    tickCounter.textContent = 'Tick: ' + (state.tick || 0);
  }

  // -----------------------------------------------------------------
  // Node detail panel
  // -----------------------------------------------------------------

  function updateNodeDetail(node, state) {
    $('#no-selection').classList.add('hidden');
    $('#node-detail').classList.remove('hidden');

    $('#detail-name').textContent = node.label;
    $('#detail-type').textContent = node.type;

    const failBadge = $('#detail-failure-badge');
    if (node.failureMode) {
      failBadge.classList.remove('hidden');
      failBadge.textContent = node.failureMode.replace(/_/g, ' ');
    } else {
      failBadge.classList.add('hidden');
    }

    const statusDot = $('#detail-status');
    statusDot.setAttribute('data-status', node.status);

    // Health bar
    const healthFill = $('#dm-health');
    healthFill.style.width = Math.max(0, node.health) + '%';
    healthFill.className = 'mm-fill';
    if (node.health <= 30) healthFill.classList.add('danger');
    $('#dm-health-val').textContent = Math.round(node.health) + '%';

    // Load bar
    const loadFill = $('#dm-load');
    loadFill.style.width = Math.max(0, node.load) + '%';
    $('#dm-load-val').textContent = Math.round(node.load) + '%';

    // Other metrics
    $('#dm-latency').textContent = Math.round(node.latency) + 'ms';
    $('#dm-latency').style.color = node.latency > 500 ? '#ef4444' : node.latency > 100 ? '#f59e0b' : '#e2e8f0';

    $('#dm-error').textContent = node.errorRate.toFixed(1) + '%';
    $('#dm-error').style.color = node.errorRate > 10 ? '#ef4444' : node.errorRate > 2 ? '#f59e0b' : '#e2e8f0';

    $('#dm-throughput').textContent = Math.round(node.throughput) + '/s';
    $('#dm-throughput').style.color = node.throughput < 30 ? '#ef4444' : node.throughput < 60 ? '#f59e0b' : '#e2e8f0';

    // Resilience toggles
    populateResilienceToggles(node);

    // Failure buttons
    if (state && state.failureModes) {
      populateDetailFailureButtons(node.key, state.failureModes);
    }

    // Heal button
    if (node.failureMode || node.health < 100) {
      btnHeal.classList.remove('hidden');
    } else {
      btnHeal.classList.add('hidden');
    }
  }

  function clearNodeDetail() {
    $('#no-selection').classList.remove('hidden');
    $('#node-detail').classList.add('hidden');
    selectedNode = null;
    renderer.selectedNode = null;
  }

  // -----------------------------------------------------------------
  // Resilience toggles
  // -----------------------------------------------------------------

  function populateResilienceToggles(node) {
    const container = $('#resilience-toggles');
    container.innerHTML = '';

    const patterns = ['circuitBreaker', 'retry', 'fallback', 'redundancy', 'rateLimit'];
    const labels = {
      circuitBreaker: 'Circuit Breaker',
      retry: 'Retry',
      fallback: 'Fallback',
      redundancy: 'Redundancy',
      rateLimit: 'Rate Limit'
    };

    for (const p of patterns) {
      const btn = document.createElement('button');
      btn.className = 'toggle-btn' + (node.resilience[p] ? ' active' : '');
      btn.textContent = labels[p];
      btn.addEventListener('click', () => {
        send({ type: 'toggle_resilience', nodeKey: node.key, pattern: p });
      });
      container.appendChild(btn);
    }
  }

  // -----------------------------------------------------------------
  // Detail panel failure buttons
  // -----------------------------------------------------------------

  function populateDetailFailureButtons(nodeKey, failureModes) {
    const container = $('#failure-buttons');
    container.innerHTML = '';

    if (!failureModes || failureModes.length === 0) return;

    for (const fm of failureModes) {
      const btn = document.createElement('button');
      btn.className = 'fail-btn';
      btn.textContent = (fm.icon || '') + ' ' + fm.name;
      btn.title = fm.description || '';
      btn.addEventListener('click', () => {
        send({ type: 'inject_failure', nodeKey, failureMode: fm.slug });
      });
      container.appendChild(btn);
    }
  }

  // Store failure modes globally for context menu
  let globalFailureModes = [];

  function populateFailureModes(failureModes) {
    if (failureModes && failureModes.length > 0) {
      globalFailureModes = failureModes;
    }
  }

  // -----------------------------------------------------------------
  // Event feed
  // -----------------------------------------------------------------

  function updateEventFeed(events) {
    if (!events) return;

    // Only render new events
    const newEvents = events.slice(lastEventCount);
    lastEventCount = events.length;

    for (const evt of newEvents) {
      const item = document.createElement('div');
      item.className = 'event-item';

      const tick = document.createElement('span');
      tick.className = 'event-tick';
      tick.textContent = 'T:' + evt.tick;

      const icon = document.createElement('span');
      icon.className = 'event-icon';
      icon.textContent = getEventIcon(evt.type);

      const type = document.createElement('span');
      type.className = 'event-type ' + evt.type;
      type.textContent = formatEventType(evt.type);

      const node = document.createElement('span');
      node.className = 'event-node';
      node.textContent = evt.nodeKey || '';

      const detail = document.createElement('span');
      detail.className = 'event-detail';
      detail.textContent = formatEventDetail(evt);

      item.appendChild(tick);
      item.appendChild(icon);
      item.appendChild(type);
      item.appendChild(node);
      item.appendChild(detail);
      eventsScroll.appendChild(item);
    }

    // Auto-scroll to bottom
    if (newEvents.length > 0) {
      eventsScroll.scrollTop = eventsScroll.scrollHeight;
    }

    // Cap DOM items
    while (eventsScroll.children.length > 100) {
      eventsScroll.removeChild(eventsScroll.firstChild);
    }
  }

  function getEventIcon(type) {
    const icons = {
      failure_injected: '\uD83D\uDD34',
      failure_propagated: '\uD83D\uDFE0',
      node_failed: '\uD83D\uDC80',
      node_degraded: '\u26A0\uFE0F',
      circuit_breaker_opened: '\uD83D\uDEE1\uFE0F',
      recovery_started: '\uD83D\uDD04',
      recovery_completed: '\u2705',
      threshold_breach: '\u26A1',
      percolate_degraded: '\uD83D\uDFE1',
      percolate_failed: '\uD83D\uDD25',
      percolate_critical: '\uD83D\uDFE0',
      node_critical: '\u26A0\uFE0F',
      scenario_failure: '\uD83D\uDFE0',
      simulation_started: '\u25B6\uFE0F',
      simulation_paused: '\u23F8\uFE0F',
      simulation_resumed: '\u25B6\uFE0F',
      simulation_reset: '\uD83D\uDD04',
      simulation_stopped: '\u23F9\uFE0F',
      scenario_loaded: '\uD83D\uDCCB',
      speed_changed: '\u23E9',
      node_healed: '\uD83D\uDC9A',
      resilience_toggled: '\uD83D\uDEE1\uFE0F'
    };
    return icons[type] || '\u2022';
  }

  function formatEventType(type) {
    return type.replace(/_/g, ' ');
  }

  function formatEventDetail(evt) {
    if (!evt.data) return '';
    const d = evt.data;
    if (d.cause) return (d.health != null ? 'health: ' + d.health + '% ' : '') + 'via ' + d.cause.replace(/_/g, ' ');
    if (d.name) return d.name;
    if (d.failureMode) return d.failureMode.replace(/_/g, ' ');
    if (d.pattern) return d.pattern + (d.enabled ? ' ON' : ' OFF');
    if (d.speed) return d.speed + 'x';
    if (d.health != null) return 'health: ' + Math.round(d.health) + '%';
    return '';
  }

  // -----------------------------------------------------------------
  // Metrics chart (mini sparkline area chart)
  // -----------------------------------------------------------------

  function updateMetricsChart(state) {
    if (!state || !state.nodes || state.nodes.length === 0) return;

    const nodes = state.nodes;
    const avgHealth = nodes.reduce((s, n) => s + n.health, 0) / nodes.length;
    const avgError = nodes.reduce((s, n) => s + n.errorRate, 0) / nodes.length;
    const avgThroughput = nodes.reduce((s, n) => s + n.throughput, 0) / nodes.length;

    metricsHistory.push({
      tick: state.tick || 0,
      health: avgHealth,
      errorRate: avgError,
      throughput: avgThroughput
    });
    if (metricsHistory.length > MAX_METRICS) {
      metricsHistory.shift();
    }

    drawMetricsChart();
  }

  function drawMetricsChart() {
    const canvas = metricsCanvas;
    const container = canvas.parentElement;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    if (metricsHistory.length < 2) {
      // Draw placeholder text
      ctx.fillStyle = '#334155';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Metrics will appear here', w / 2, h / 2);
      return;
    }

    const padL = 8;
    const padR = 8;
    const padT = 24;
    const padB = 8;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const len = metricsHistory.length;

    // Draw subtle horizontal grid lines
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
    ctx.lineWidth = 0.5;
    for (let v = 0; v <= 100; v += 25) {
      const y = padT + chartH * (1 - v / 100);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
    }

    // Helper: draw a line series
    function drawLine(data, color, maxVal) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';

      for (let i = 0; i < len; i++) {
        const x = padL + (i / (len - 1)) * chartW;
        const val = Math.min(data[i], maxVal);
        const y = padT + chartH * (1 - val / maxVal);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Area fill
      ctx.lineTo(padL + chartW, padT + chartH);
      ctx.lineTo(padL, padT + chartH);
      ctx.closePath();
      ctx.fillStyle = color.replace(')', ', 0.06)').replace('rgb', 'rgba');
      ctx.fill();
    }

    // Health (cyan)
    drawLine(metricsHistory.map(m => m.health), 'rgb(6, 182, 212)', 100);

    // Error rate (red, scale to max 100)
    drawLine(metricsHistory.map(m => m.errorRate), 'rgb(239, 68, 68)', 100);

    // Throughput (emerald)
    drawLine(metricsHistory.map(m => m.throughput), 'rgb(16, 185, 129)', 100);

    // Legend
    const legends = [
      { label: 'Health', color: '#06b6d4' },
      { label: 'Errors', color: '#ef4444' },
      { label: 'Throughput', color: '#10b981' }
    ];
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    let lx = padL + 4;
    for (const l of legends) {
      ctx.fillStyle = l.color;
      ctx.fillRect(lx, 6, 12, 6);
      lx += 16;
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left';
      ctx.fillText(l.label, lx, 10);
      lx += ctx.measureText(l.label).width + 12;
    }
  }

  // -----------------------------------------------------------------
  // Scenarios
  // -----------------------------------------------------------------

  function updateScenarios(scenarios) {
    if (!scenarios) return;
    scenarioList.innerHTML = '';

    if (scenarios.length === 0) {
      scenarioList.innerHTML = '<p class="tab-desc">No scenarios available for this topology.</p>';
      return;
    }

    for (const s of scenarios) {
      const card = document.createElement('div');
      card.className = 'scenario-card';
      card.innerHTML = `
        <div class="scenario-name">${escapeHtml(s.name)}</div>
        <div class="scenario-desc">${escapeHtml(s.description || '')}</div>
        <div class="scenario-meta">${escapeHtml(s.company || '')}${s.incidentDate ? ' \u2014 ' + s.incidentDate : ''}</div>
      `;
      card.addEventListener('click', () => {
        // Highlight active
        scenarioList.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        send({ type: 'load_scenario', scenarioId: s.id });
      });
      scenarioList.appendChild(card);
    }
  }

  // -----------------------------------------------------------------
  // Analysis tab
  // -----------------------------------------------------------------

  function updateAnalysis(state) {
    if (!state) return;

    // Score breakdown
    const breakdown = state.resilienceBreakdown;
    if (breakdown) {
      scoreBreakdown.innerHTML = '';
      const labels = {
        redundancy: 'Redundancy',
        circuitBreaker: 'Circuit Breaker',
        gracefulDegradation: 'Graceful Degrad.',
        singlePointsOfFailure: 'No SPOFs',
        recoveryCapability: 'Recovery'
      };

      for (const [key, data] of Object.entries(breakdown)) {
        const pct = (data.score / data.weight * 100) || 0;
        const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';

        const row = document.createElement('div');
        row.className = 'score-row';
        row.innerHTML = `
          <span class="score-label">${labels[key] || key}</span>
          <div class="score-bar-container">
            <div class="score-bar">
              <div class="score-fill" style="width:${pct}%; background:${color}"></div>
            </div>
          </div>
          <span class="score-value" style="color:${color}">${data.score.toFixed(1)}/${data.weight}</span>
        `;
        scoreBreakdown.appendChild(row);
      }
    }

    // Recommendations
    const recs = state.recommendations;
    if (recs) {
      recsList.innerHTML = '';
      if (recs.length === 0) {
        recsList.innerHTML = '<p class="tab-desc">No recommendations at this time.</p>';
        return;
      }
      for (const r of recs) {
        const card = document.createElement('div');
        card.className = 'rec-card ' + (r.severity || 'medium');
        card.innerHTML = `
          <div class="rec-title">${escapeHtml(r.title)}</div>
          <div class="rec-desc">${escapeHtml(r.description || '')}</div>
          <div class="rec-meta">${r.severity.toUpperCase()} \u2014 Impact: ${r.estimatedImpact || '?'}/10${r.nodeKey ? ' \u2014 ' + r.nodeKey : ''}</div>
        `;
        recsList.appendChild(card);
      }
    }
  }

  // -----------------------------------------------------------------
  // Context menu
  // -----------------------------------------------------------------

  function showContextMenu(x, y, nodeKey) {
    const node = currentState ? currentState.nodes.find(n => n.key === nodeKey) : null;
    if (!node) return;

    const header = contextMenu.querySelector('.ctx-header');
    header.textContent = node.label;

    const items = contextMenu.querySelector('.ctx-items');
    items.innerHTML = '';

    // Failure injection items
    if (globalFailureModes.length > 0) {
      for (const fm of globalFailureModes) {
        const item = document.createElement('div');
        item.className = 'ctx-item';
        item.innerHTML = `<span class="ctx-icon">${fm.icon || '\uD83D\uDCA5'}</span><span>${escapeHtml(fm.name)}</span>`;
        item.addEventListener('click', () => {
          send({ type: 'inject_failure', nodeKey, failureMode: fm.slug });
          hideContextMenu();
        });
        items.appendChild(item);
      }
    }

    // Separator
    if (globalFailureModes.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      items.appendChild(sep);
    }

    // Heal option
    const healItem = document.createElement('div');
    healItem.className = 'ctx-item';
    healItem.innerHTML = '<span class="ctx-icon">\uD83D\uDC9A</span><span>Heal Node</span>';
    healItem.addEventListener('click', () => {
      send({ type: 'heal_node', nodeKey });
      hideContextMenu();
    });
    items.appendChild(healItem);

    // Inspect option
    const inspectItem = document.createElement('div');
    inspectItem.className = 'ctx-item';
    inspectItem.innerHTML = '<span class="ctx-icon">\uD83D\uDD0D</span><span>Inspect</span>';
    inspectItem.addEventListener('click', () => {
      selectNode(nodeKey);
      hideContextMenu();
    });
    items.appendChild(inspectItem);

    // Position
    contextMenu.classList.remove('hidden');
    const menuW = contextMenu.offsetWidth;
    const menuH = contextMenu.offsetHeight;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    contextMenu.style.left = (x + menuW > winW ? x - menuW : x) + 'px';
    contextMenu.style.top = (y + menuH > winH ? y - menuH : y) + 'px';
  }

  function hideContextMenu() {
    contextMenu.classList.add('hidden');
  }

  // -----------------------------------------------------------------
  // Tooltip
  // -----------------------------------------------------------------

  function showTooltip(nodeKey, mx, my) {
    const node = currentState ? currentState.nodes.find(n => n.key === nodeKey) : null;
    if (!node) return;

    tooltip.innerHTML = `
      <div class="tooltip-name">${escapeHtml(node.label)}</div>
      <div class="tooltip-row"><span class="label">Status</span><span class="value" style="color:${renderer.getStatusColor(node.status)}">${node.status}</span></div>
      <div class="tooltip-row"><span class="label">Health</span><span class="value">${Math.round(node.health)}%</span></div>
      <div class="tooltip-row"><span class="label">Latency</span><span class="value">${Math.round(node.latency)}ms</span></div>
      <div class="tooltip-row"><span class="label">Error Rate</span><span class="value">${node.errorRate.toFixed(1)}%</span></div>
      ${node.failureMode ? `<div class="tooltip-row"><span class="label">Failure</span><span class="value" style="color:#ef4444">${node.failureMode.replace(/_/g, ' ')}</span></div>` : ''}
    `;

    tooltip.classList.remove('hidden');

    // Position near mouse, offset slightly
    const rect = tooltip.parentElement.getBoundingClientRect();
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    let tx = mx - rect.left + 16;
    let ty = my - rect.top - 10;

    if (tx + tipW > rect.width) tx = mx - rect.left - tipW - 10;
    if (ty + tipH > rect.height) ty = rect.height - tipH - 4;
    if (ty < 0) ty = 4;

    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  }

  function hideTooltip() {
    tooltip.classList.add('hidden');
  }

  // -----------------------------------------------------------------
  // Node selection
  // -----------------------------------------------------------------

  function selectNode(nodeKey) {
    selectedNode = nodeKey;
    renderer.selectedNode = nodeKey;

    // Switch to details tab
    activateTab('details');

    if (currentState) {
      const node = currentState.nodes.find(n => n.key === nodeKey);
      if (node) {
        updateNodeDetail(node, currentState);
      }
    }
  }

  // -----------------------------------------------------------------
  // Tab switching
  // -----------------------------------------------------------------

  function activateTab(tabName) {
    $$('.panel-tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    $$('.tab-content').forEach(tc => {
      tc.classList.toggle('active', tc.id === 'tab-' + tabName);
    });
  }

  // -----------------------------------------------------------------
  // Event Listeners
  // -----------------------------------------------------------------

  // Topology select
  topologySelect.addEventListener('change', () => {
    const val = topologySelect.value;
    if (val) {
      send({ type: 'load_topology', topologyId: Number(val) });
      clearNodeDetail();
    }
  });

  // Simulation controls
  btnPlay.addEventListener('click', () => {
    send({ type: 'start' });
  });

  btnPause.addEventListener('click', () => {
    send({ type: 'pause' });
  });

  btnReset.addEventListener('click', () => {
    send({ type: 'reset' });
    eventsScroll.innerHTML = '';
    lastEventCount = 0;
    metricsHistory = [];
    clearNodeDetail();
  });

  // Speed slider
  speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value);
    speedLabel.textContent = val + '\u00D7';
    send({ type: 'set_speed', speed: val });
  });

  // Canvas click: select node
  networkCanvas.addEventListener('click', (e) => {
    const rect = networkCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const nodeKey = renderer.getNodeAtPosition(mx, my);

    if (nodeKey) {
      selectNode(nodeKey);
    } else {
      clearNodeDetail();
    }
  });

  // Canvas right-click: context menu
  networkCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = networkCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const nodeKey = renderer.getNodeAtPosition(mx, my);

    if (nodeKey) {
      showContextMenu(e.clientX, e.clientY, nodeKey);
    } else {
      hideContextMenu();
    }
  });

  // Canvas mousemove: hover + tooltip
  networkCanvas.addEventListener('mousemove', (e) => {
    const rect = networkCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const nodeKey = renderer.getNodeAtPosition(mx, my);

    renderer.hoveredNode = nodeKey;
    networkCanvas.style.cursor = nodeKey ? 'pointer' : 'default';

    if (nodeKey) {
      showTooltip(nodeKey, e.clientX, e.clientY);
    } else {
      hideTooltip();
    }
  });

  // Canvas mouseleave
  networkCanvas.addEventListener('mouseleave', () => {
    renderer.hoveredNode = null;
    hideTooltip();
  });

  // Click elsewhere to hide context menu
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Escape to hide context menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });

  // Tab buttons
  $$('.panel-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activateTab(tab.dataset.tab);
    });
  });

  // Heal button
  btnHeal.addEventListener('click', () => {
    if (selectedNode) {
      send({ type: 'heal_node', nodeKey: selectedNode });
    }
  });

  // Save simulation
  btnSaveSim.addEventListener('click', async () => {
    if (!currentState || !currentState.topology) {
      alert('No simulation data to save.');
      return;
    }

    const nodes = currentState.nodes || [];
    const failedCount = nodes.filter(n => n.status === 'failed' || n.status === 'failing').length;
    const blastPct = nodes.length > 0 ? (failedCount / nodes.length * 100) : 0;

    const payload = {
      topology_id: currentState.topology.id,
      resilience_score: currentState.resilienceScore || 0,
      total_downtime_sec: currentState.tick || 0,
      blast_radius_pct: Math.round(blastPct * 100) / 100,
      financial_impact: currentState.financialImpact ? currentState.financialImpact.totalAccumulated || 0 : 0,
      events: currentState.events || [],
      recommendations: currentState.recommendations || []
    };

    try {
      const res = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        alert('Simulation saved! ID: ' + data.id);
      } else {
        alert('Error: ' + (data.error || 'Unknown'));
      }
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  });

  // -----------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatNumber(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    if (n >= 1) return n.toFixed(0);
    return n.toFixed(2);
  }

  // -----------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------

  connectWS();

});
