const express = require('express');
const router = express.Router();
const pool = require('../models/db');

// ---------------------------------------------------------------------------
// GET /health  - health check
// ---------------------------------------------------------------------------
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ---------------------------------------------------------------------------
// GET /topologies  - list all topologies
// ---------------------------------------------------------------------------
router.get('/topologies', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, description, category, revenue_per_min, created_at, updated_at FROM topologies ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /topologies error:', err.message);
    res.status(500).json({ error: 'Failed to fetch topologies' });
  }
});

// ---------------------------------------------------------------------------
// GET /topologies/:id  - full topology with nodes and edges
// ---------------------------------------------------------------------------
router.get('/topologies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [topologies] = await pool.query('SELECT * FROM topologies WHERE id = ?', [id]);
    if (topologies.length === 0) {
      return res.status(404).json({ error: 'Topology not found' });
    }

    const [nodes] = await pool.query('SELECT * FROM nodes WHERE topology_id = ?', [id]);

    const [edges] = await pool.query(
      `SELECT e.*, sn.node_key AS source_key, tn.node_key AS target_key
       FROM edges e
       JOIN nodes sn ON e.source_node_id = sn.id
       JOIN nodes tn ON e.target_node_id = tn.id
       WHERE e.topology_id = ?`,
      [id]
    );

    res.json({
      ...topologies[0],
      nodes,
      edges
    });
  } catch (err) {
    console.error(`GET /topologies/${req.params.id} error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch topology' });
  }
});

// ---------------------------------------------------------------------------
// GET /topologies/:id/stats  - node, edge, simulation counts
// ---------------------------------------------------------------------------
router.get('/topologies/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const [nodes] = await pool.query('SELECT COUNT(*) as nodeCount FROM nodes WHERE topology_id = ?', [id]);
    const [edges] = await pool.query('SELECT COUNT(*) as edgeCount FROM edges WHERE topology_id = ?', [id]);
    const [sims] = await pool.query('SELECT COUNT(*) as simCount FROM simulations WHERE topology_id = ?', [id]);
    res.json({ nodeCount: nodes[0].nodeCount, edgeCount: edges[0].edgeCount, simCount: sims[0].simCount });
  } catch (err) {
    console.error(`GET /topologies/${req.params.id}/stats error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ---------------------------------------------------------------------------
// GET /topologies/:id/scenarios  - scenarios for a topology
// ---------------------------------------------------------------------------
router.get('/topologies/:id/scenarios', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM scenarios WHERE topology_id = ?', [id]);
    res.json(rows);
  } catch (err) {
    console.error(`GET /topologies/${req.params.id}/scenarios error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch scenarios' });
  }
});

// ---------------------------------------------------------------------------
// GET /failure-modes  - all failure modes
// ---------------------------------------------------------------------------
router.get('/failure-modes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM failure_modes');
    res.json(rows);
  } catch (err) {
    console.error('GET /failure-modes error:', err.message);
    res.status(500).json({ error: 'Failed to fetch failure modes' });
  }
});

// ---------------------------------------------------------------------------
// POST /simulations  - save a completed simulation
// ---------------------------------------------------------------------------
router.post('/simulations', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      topology_id,
      resilience_score,
      total_downtime_sec,
      blast_radius_pct,
      financial_impact,
      events,
      recommendations
    } = req.body;

    await conn.beginTransaction();

    // Insert simulation record
    const [simResult] = await conn.query(
      `INSERT INTO simulations (topology_id, status, resilience_score, total_downtime_sec, blast_radius_pct, financial_impact, ended_at)
       VALUES (?, 'completed', ?, ?, ?, ?, NOW())`,
      [topology_id, resilience_score, total_downtime_sec || 0, blast_radius_pct || 0, financial_impact || 0]
    );
    const simulationId = simResult.insertId;

    // Batch insert events
    if (events && events.length > 0) {
      const eventValues = events.map(e => [
        simulationId,
        e.tick,
        e.type,
        e.nodeKey || null,
        JSON.stringify(e.data || {})
      ]);
      await conn.query(
        'INSERT INTO simulation_events (simulation_id, tick, event_type, node_key, data) VALUES ?',
        [eventValues]
      );
    }

    // Insert recommendations
    if (recommendations && recommendations.length > 0) {
      const recValues = recommendations.map(r => [
        simulationId,
        r.nodeKey || null,
        r.severity || 'medium',
        r.category || 'general',
        r.title,
        r.description || null,
        r.estimatedImpact || null
      ]);
      await conn.query(
        'INSERT INTO recommendations (simulation_id, node_key, severity, category, title, description, estimated_impact) VALUES ?',
        [recValues]
      );
    }

    await conn.commit();

    res.status(201).json({ id: simulationId, message: 'Simulation saved' });
  } catch (err) {
    await conn.rollback();
    console.error('POST /simulations error:', err.message);
    res.status(500).json({ error: 'Failed to save simulation' });
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------------------
// GET /simulations  - list last 20 simulations with topology name
// ---------------------------------------------------------------------------
router.get('/simulations', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, t.name AS topology_name
       FROM simulations s
       JOIN topologies t ON s.topology_id = t.id
       ORDER BY s.started_at DESC
       LIMIT 20`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /simulations error:', err.message);
    res.status(500).json({ error: 'Failed to fetch simulations' });
  }
});

// ---------------------------------------------------------------------------
// GET /simulations/:id  - full simulation with events and recommendations
// ---------------------------------------------------------------------------
router.get('/simulations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [simulations] = await pool.query(
      `SELECT s.*, t.name AS topology_name
       FROM simulations s
       JOIN topologies t ON s.topology_id = t.id
       WHERE s.id = ?`,
      [id]
    );
    if (simulations.length === 0) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    const [events] = await pool.query(
      'SELECT * FROM simulation_events WHERE simulation_id = ? ORDER BY tick ASC',
      [id]
    );

    const [recommendations] = await pool.query(
      'SELECT * FROM recommendations WHERE simulation_id = ? ORDER BY severity ASC',
      [id]
    );

    res.json({
      ...simulations[0],
      events,
      recommendations
    });
  } catch (err) {
    console.error(`GET /simulations/${req.params.id} error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch simulation' });
  }
});

module.exports = router;
