const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./src/routes/api');
const { SimulationManager } = require('./src/simulation/engine');

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client', 'dist')));
app.use('/api', apiRoutes);

// SPA catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  // Each connection gets its own simulation instance
  const sim = new SimulationManager();

  // Send connected acknowledgement
  ws.send(JSON.stringify({ type: 'connected' }));

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    try {
      switch (msg.type) {

        // -- Load topology ------------------------------------------------
        case 'load_topology': {
          const state = await sim.loadTopology(msg.topologyId);
          ws.send(JSON.stringify({ type: 'topology_loaded', data: state }));
          break;
        }

        // -- Start simulation ---------------------------------------------
        case 'start': {
          sim.start((state) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'tick', data: state }));
            }
          });
          ws.send(JSON.stringify({ type: 'started' }));
          break;
        }

        // -- Pause --------------------------------------------------------
        case 'pause': {
          sim.pause();
          ws.send(JSON.stringify({ type: 'paused' }));
          break;
        }

        // -- Resume -------------------------------------------------------
        case 'resume': {
          sim.resume();
          ws.send(JSON.stringify({ type: 'resumed' }));
          break;
        }

        // -- Reset --------------------------------------------------------
        case 'reset': {
          sim.reset();
          ws.send(JSON.stringify({ type: 'reset', data: sim.getState() }));
          break;
        }

        // -- Inject failure -----------------------------------------------
        case 'inject_failure': {
          sim.injectFailure(msg.nodeKey, msg.failureMode);
          ws.send(JSON.stringify({ type: 'failure_injected', data: sim.getState() }));
          break;
        }

        // -- Heal node ----------------------------------------------------
        case 'heal_node': {
          sim.healNode(msg.nodeKey);
          ws.send(JSON.stringify({ type: 'node_healed', data: sim.getState() }));
          break;
        }

        // -- Toggle resilience pattern ------------------------------------
        case 'toggle_resilience': {
          sim.toggleResilience(msg.nodeKey, msg.pattern);
          ws.send(JSON.stringify({ type: 'resilience_toggled', data: sim.getState() }));
          break;
        }

        // -- Set speed ----------------------------------------------------
        case 'set_speed': {
          sim.setSpeed(msg.speed);
          ws.send(JSON.stringify({ type: 'speed_changed', data: { speed: sim.speed } }));
          break;
        }

        // -- Toggle chaos mode --------------------------------------------
        case 'toggle_chaos': {
          sim.toggleChaos();
          ws.send(JSON.stringify({ type: 'chaos_toggled', data: sim.getState() }));
          break;
        }

        // -- Set chaos interval -------------------------------------------
        case 'set_chaos_interval': {
          sim.setChaosInterval(msg.interval);
          ws.send(JSON.stringify({ type: 'chaos_interval_set', data: sim.getState() }));
          break;
        }

        // -- Load scenario ------------------------------------------------
        case 'load_scenario': {
          await sim.loadScenario(msg.scenarioId);
          ws.send(JSON.stringify({ type: 'scenario_loaded', data: sim.getState() }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
      }
    } catch (err) {
      console.error(`WS message error (${msg.type}):`, err.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: err.message,
        context: msg.type
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    sim.stop();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    sim.stop();
  });
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Percolate server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
});
