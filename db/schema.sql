CREATE DATABASE IF NOT EXISTS `percolate_db`;
USE `percolate_db`;

-- ============================================================
-- TOPOLOGIES: Saved infrastructure architectures
-- ============================================================
CREATE TABLE IF NOT EXISTS topologies (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    category        ENUM('custom','template','incident') DEFAULT 'custom',
    revenue_per_min FLOAT DEFAULT 0 COMMENT 'Estimated revenue per minute for financial impact',
    metadata        JSON,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- NODES: Services / components within a topology
-- ============================================================
CREATE TABLE IF NOT EXISTS nodes (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    topology_id   INT NOT NULL,
    node_key      VARCHAR(100) NOT NULL,
    label         VARCHAR(255) NOT NULL,
    node_type     ENUM('service','database','cache','queue','gateway','cdn','dns','load_balancer','external') NOT NULL,
    x             FLOAT NOT NULL COMMENT 'Normalized 0-1 canvas position',
    y             FLOAT NOT NULL,
    criticality   FLOAT DEFAULT 0.5 COMMENT '0-1 how critical this node is',
    revenue_share FLOAT DEFAULT 0 COMMENT 'Fraction of topology revenue this node affects',
    config        JSON COMMENT '{"maxHealth":100,"recoveryRate":2,"baseLatency":50}',
    resilience    JSON COMMENT '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":false,"rateLimit":false}',
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE,
    UNIQUE KEY uq_topo_node (topology_id, node_key)
) ENGINE=InnoDB;

-- ============================================================
-- EDGES: Dependencies / connections between nodes
-- ============================================================
CREATE TABLE IF NOT EXISTS edges (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    topology_id     INT NOT NULL,
    source_node_id  INT NOT NULL,
    target_node_id  INT NOT NULL,
    weight          FLOAT DEFAULT 0.5 COMMENT 'Dependency strength 0-1',
    edge_type       ENUM('sync','async','data','health') DEFAULT 'sync',
    base_latency    FLOAT DEFAULT 10 COMMENT 'Base latency in ms',
    config          JSON,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE,
    FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- FAILURE MODES: Catalog of possible failure types
-- ============================================================
CREATE TABLE IF NOT EXISTS failure_modes (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    name              VARCHAR(100) NOT NULL,
    slug              VARCHAR(100) NOT NULL UNIQUE,
    description       TEXT,
    icon              VARCHAR(10) DEFAULT '💥',
    propagation_type  ENUM('immediate','gradual','threshold') NOT NULL,
    default_severity  FLOAT DEFAULT 0.5,
    health_impact     FLOAT DEFAULT 50 COMMENT 'How much health drops per tick',
    load_impact       FLOAT DEFAULT 20 COMMENT 'How much load increases per tick',
    latency_impact    FLOAT DEFAULT 100 COMMENT 'Latency increase in ms',
    spread_rate       FLOAT DEFAULT 0.3 COMMENT 'How fast it spreads to dependents 0-1'
) ENGINE=InnoDB;

-- ============================================================
-- SIMULATIONS: Individual simulation runs
-- ============================================================
CREATE TABLE IF NOT EXISTS simulations (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    topology_id         INT NOT NULL,
    status              ENUM('running','paused','completed','aborted') DEFAULT 'running',
    speed               FLOAT DEFAULT 1.0,
    total_ticks         INT DEFAULT 0,
    resilience_score    FLOAT COMMENT 'Calculated 0-100 score',
    total_downtime_sec  FLOAT DEFAULT 0,
    blast_radius_pct    FLOAT DEFAULT 0 COMMENT 'Percentage of nodes affected',
    peak_error_rate     FLOAT DEFAULT 0,
    financial_impact    FLOAT DEFAULT 0 COMMENT 'Estimated $ lost',
    started_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at            TIMESTAMP NULL,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE,
    INDEX idx_topo_status (topology_id, status)
) ENGINE=InnoDB;

-- ============================================================
-- SIMULATION EVENTS: Timestamped events during a run
-- ============================================================
CREATE TABLE IF NOT EXISTS simulation_events (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    simulation_id   INT NOT NULL,
    tick            INT NOT NULL,
    event_type      VARCHAR(50) NOT NULL,
    node_key        VARCHAR(100),
    data            JSON,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
    INDEX idx_sim_tick (simulation_id, tick)
) ENGINE=InnoDB;

-- ============================================================
-- METRICS SNAPSHOTS: Periodic aggregate metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS metrics_snapshots (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    simulation_id   INT NOT NULL,
    tick            INT NOT NULL,
    overall_health  FLOAT,
    nodes_healthy   INT DEFAULT 0,
    nodes_degraded  INT DEFAULT 0,
    nodes_failed    INT DEFAULT 0,
    avg_latency     FLOAT DEFAULT 0,
    error_rate      FLOAT DEFAULT 0,
    throughput      FLOAT DEFAULT 0,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
    INDEX idx_sim_tick (simulation_id, tick)
) ENGINE=InnoDB;

-- ============================================================
-- SCENARIOS: Pre-built failure sequences
-- ============================================================
CREATE TABLE IF NOT EXISTS scenarios (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    topology_id       INT NOT NULL,
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    incident_date     VARCHAR(20),
    company           VARCHAR(100),
    failure_sequence  JSON COMMENT '[{"tick":10,"nodeKey":"db_primary","failureMode":"crash"}]',
    lessons_learned   TEXT,
    FOREIGN KEY (topology_id) REFERENCES topologies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- RECOMMENDATIONS: Generated resilience advice
-- ============================================================
CREATE TABLE IF NOT EXISTS recommendations (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    simulation_id   INT NOT NULL,
    node_key        VARCHAR(100),
    severity        ENUM('critical','high','medium','low') NOT NULL,
    category        VARCHAR(100) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    estimated_impact FLOAT COMMENT 'How much resilience score would improve',
    FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE
) ENGINE=InnoDB;
