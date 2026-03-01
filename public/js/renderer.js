/* ===================================================================
   PERCOLATE — Canvas Rendering Engine
   Draws the network topology, particles, shockwaves, and handles
   mouse interaction hit-testing.
   =================================================================== */

class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    // State
    this.nodes = {};          // nodeKey -> { key, label, type, x, y, px, py, health, status, ... }
    this.edges = [];          // [{ sourceKey, targetKey, weight, edgeType }]
    this.particles = new Map(); // edgeIndex -> [{ progress, speed, size }]
    this.shockwaves = [];     // [{ x, y, radius, maxRadius, opacity, color }]

    // Interaction
    this.selectedNode = null;
    this.hoveredNode = null;
    this.mouseX = 0;
    this.mouseY = 0;

    // Animation
    this.animFrame = null;
    this.lastTime = 0;

    // Sizing
    this.width = 0;
    this.height = 0;
    this.padding = 60;

    // Init
    this.resize();
    this._bindResize();
    this._startLoop();
  }

  // -----------------------------------------------------------------
  // Sizing
  // -----------------------------------------------------------------

  resize() {
    const container = this.canvas.parentElement;
    if (!container) return;

    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._recalcPositions();
  }

  _bindResize() {
    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  _recalcPositions() {
    const pad = this.padding;
    const w = this.width - pad * 2;
    const h = this.height - pad * 2;

    for (const key in this.nodes) {
      const n = this.nodes[key];
      n.px = pad + n.x * w;
      n.py = pad + n.y * h;
    }
  }

  // -----------------------------------------------------------------
  // State updates from simulation
  // -----------------------------------------------------------------

  updateState(state) {
    if (!state) return;

    const prevNodeKeys = new Set(Object.keys(this.nodes));

    // Update / create nodes
    if (state.nodes) {
      const newNodes = {};
      for (const n of state.nodes) {
        const existing = this.nodes[n.key];
        newNodes[n.key] = {
          key: n.key,
          label: n.label,
          type: n.type,
          x: n.x,
          y: n.y,
          px: existing ? existing.px : 0,
          py: existing ? existing.py : 0,
          health: n.health,
          load: n.load,
          status: n.status,
          latency: n.latency,
          errorRate: n.errorRate,
          throughput: n.throughput,
          criticality: n.criticality,
          revenueShare: n.revenueShare,
          failureMode: n.failureMode,
          resilience: n.resilience,
          config: n.config
        };
      }
      this.nodes = newNodes;
      this._recalcPositions();
    }

    // Update edges and initialize particles for new edges
    if (state.edges) {
      const oldEdgeCount = this.edges.length;
      this.edges = state.edges;

      if (this.edges.length !== oldEdgeCount || !prevNodeKeys.size) {
        this.particles.clear();
        for (let i = 0; i < this.edges.length; i++) {
          this._initParticles(i);
        }
      }
    }
  }

  _initParticles(edgeIndex) {
    const edge = this.edges[edgeIndex];
    if (!edge) return;

    const count = Math.ceil((edge.weight || 0.5) * 6);
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        progress: Math.random(),
        speed: 0.003 + Math.random() * 0.005,
        size: 1 + Math.random() * 1.5
      });
    }
    this.particles.set(edgeIndex, particles);
  }

  // -----------------------------------------------------------------
  // Main render loop
  // -----------------------------------------------------------------

  _startLoop() {
    const loop = (time) => {
      this.animFrame = requestAnimationFrame(loop);
      const dt = time - this.lastTime;
      this.lastTime = time;
      if (dt > 0 && dt < 200) {
        this.render(dt);
      }
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  render(dt) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background subtle grid
    this._drawGrid(ctx, w, h);

    // Edges + particles
    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      this.drawEdge(edge);
      const parts = this.particles.get(i);
      if (parts) {
        this.drawParticles(edge, parts, dt);
      }
    }

    // Shockwaves (behind nodes)
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      this.drawShockwave(sw);
      sw.radius += 1.5;
      sw.opacity -= 0.012;
      if (sw.opacity <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Nodes
    for (const key in this.nodes) {
      this.drawNode(this.nodes[key]);
    }
  }

  _drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.3)';
    ctx.lineWidth = 0.5;
    const step = 40;
    for (let x = step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  // -----------------------------------------------------------------
  // Edge drawing
  // -----------------------------------------------------------------

  drawEdge(edge) {
    const src = this.nodes[edge.sourceKey];
    const tgt = this.nodes[edge.targetKey];
    if (!src || !tgt) return;

    const ctx = this.ctx;
    const cp = this._getControlPoint(src.px, src.py, tgt.px, tgt.py);

    // Color based on worst health of endpoints
    const worstHealth = Math.min(src.health, tgt.health);
    let color;
    if (worstHealth > 65) color = 'rgba(6, 182, 212, 0.25)';
    else if (worstHealth > 30) color = 'rgba(245, 158, 11, 0.3)';
    else color = 'rgba(239, 68, 68, 0.35)';

    ctx.beginPath();
    ctx.moveTo(src.px, src.py);
    ctx.quadraticCurveTo(cp.x, cp.y, tgt.px, tgt.py);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + (edge.weight || 0.5) * 1.5;

    // Dashed for async edges
    if (edge.edgeType === 'async') {
      ctx.setLineDash([6, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }

  // -----------------------------------------------------------------
  // Particle drawing
  // -----------------------------------------------------------------

  drawParticles(edge, particles, dt) {
    const src = this.nodes[edge.sourceKey];
    const tgt = this.nodes[edge.targetKey];
    if (!src || !tgt) return;

    const ctx = this.ctx;
    const cp = this._getControlPoint(src.px, src.py, tgt.px, tgt.py);

    // Particle color based on source health
    let pColor;
    if (src.health > 65) pColor = '#06b6d4';
    else if (src.health > 30) pColor = '#f59e0b';
    else pColor = '#ef4444';

    const speedMul = Math.max(0.1, (src.throughput || 50) / 100);

    for (const p of particles) {
      p.progress += p.speed * speedMul;
      if (p.progress >= 1) p.progress -= 1;

      const pos = this._getPointOnQuadBezier(
        p.progress,
        { x: src.px, y: src.py },
        cp,
        { x: tgt.px, y: tgt.py }
      );

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = pColor;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // -----------------------------------------------------------------
  // Node drawing
  // -----------------------------------------------------------------

  drawNode(node) {
    const ctx = this.ctx;
    const x = node.px;
    const y = node.py;
    const radius = 16 + (node.criticality || 0.5) * 14;
    const statusColor = this.getStatusColor(node.status);
    const isSelected = this.selectedNode === node.key;
    const isHovered = this.hoveredNode === node.key;

    // 1. Outer glow
    const glowGrad = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 2.5);
    glowGrad.addColorStop(0, this._hexToRgba(statusColor, isSelected ? 0.25 : 0.12));
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 2. Health arc (background track)
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, -Math.PI / 2, Math.PI * 1.5);
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Health arc (filled portion)
    const healthPct = Math.max(0, Math.min(100, node.health)) / 100;
    if (healthPct > 0) {
      const endAngle = -Math.PI / 2 + healthPct * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, -Math.PI / 2, endAngle);
      ctx.strokeStyle = statusColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 3. Main circle fill
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = this._hexToRgba(statusColor, isHovered ? 0.25 : 0.15);
    ctx.fill();

    // Main circle stroke
    ctx.strokeStyle = this._hexToRgba(statusColor, isHovered ? 0.9 : 0.6);
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    // 4. Selection highlight ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = this._hexToRgba(statusColor, 0.4);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. Inner icon
    const icon = this.getNodeIcon(node.type);
    ctx.fillStyle = statusColor;
    ctx.font = `${radius * 0.65}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y);

    // 6. Label below node
    ctx.fillStyle = isHovered || isSelected ? '#e2e8f0' : '#94a3b8';
    ctx.font = `${isSelected ? '600' : '500'} 11px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(node.label, x, y + radius + 10);

    // 7. Failure mode indicator
    if (node.failureMode) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('\u26A0', x + radius * 0.7, y - radius * 0.5);
    }
  }

  // -----------------------------------------------------------------
  // Shockwave drawing
  // -----------------------------------------------------------------

  drawShockwave(sw) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.strokeStyle = this._hexToRgba(sw.color, sw.opacity);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Second ring (slightly delayed)
    if (sw.radius > 10) {
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = this._hexToRgba(sw.color, sw.opacity * 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  addShockwave(nodeKey) {
    const node = this.nodes[nodeKey];
    if (!node) return;

    this.shockwaves.push({
      x: node.px,
      y: node.py,
      radius: 0,
      maxRadius: 120,
      opacity: 0.7,
      color: '#ef4444'
    });
  }

  // -----------------------------------------------------------------
  // Hit testing
  // -----------------------------------------------------------------

  getNodeAtPosition(mx, my) {
    for (const key in this.nodes) {
      const n = this.nodes[key];
      const r = 16 + (n.criticality || 0.5) * 14 + 6; // slight extra for easier clicking
      const dx = mx - n.px;
      const dy = my - n.py;
      if (dx * dx + dy * dy <= r * r) {
        return key;
      }
    }
    return null;
  }

  // -----------------------------------------------------------------
  // Bezier helpers
  // -----------------------------------------------------------------

  _getControlPoint(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: mx, y: my };

    // Perpendicular offset
    const offset = Math.min(30, len * 0.15);
    const sign = (dx * dy >= 0) ? 1 : -1;
    return {
      x: mx + (-dy / len) * offset * sign,
      y: my + (dx / len) * offset * sign
    };
  }

  _getPointOnQuadBezier(t, p0, p1, p2) {
    const mt = 1 - t;
    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
    };
  }

  // -----------------------------------------------------------------
  // Color helpers
  // -----------------------------------------------------------------

  getStatusColor(status) {
    switch (status) {
      case 'healthy':    return '#06b6d4';
      case 'degraded':   return '#f59e0b';
      case 'failing':    return '#f97316';
      case 'failed':     return '#ef4444';
      case 'recovering': return '#10b981';
      default:           return '#475569';
    }
  }

  getNodeIcon(type) {
    switch (type) {
      case 'service':        return '\u2699';   // gear
      case 'database':       return '\u2B21';   // hexagon
      case 'cache':          return '\u25C6';   // diamond
      case 'queue':          return '\u2261';   // triple bar
      case 'gateway':        return '\u25C7';   // diamond outline
      case 'cdn':            return '\u2601';   // cloud
      case 'load_balancer':  return '\u2295';   // circled plus
      case 'external':       return '\u2B22';   // filled hexagon
      case 'dns':            return '@';
      default:               return '\u25CB';   // circle
    }
  }

  _hexToRgba(hex, alpha) {
    // Handle hex shorthand or named colors
    if (!hex || hex.charAt(0) !== '#') return `rgba(100,100,100,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // -----------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------

  destroy() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    window.removeEventListener('resize', this._resizeHandler);
  }
}
