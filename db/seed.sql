USE `percolate_db`;

-- ============================================================
-- FAILURE MODES CATALOG
-- ============================================================
INSERT INTO failure_modes (name, slug, description, icon, propagation_type, default_severity, health_impact, load_impact, latency_impact, spread_rate) VALUES
('Process Crash',           'crash',              'Complete process failure — immediate shutdown.',                     '💥', 'immediate', 1.0, 100, 0,   0,   0.6),
('Memory Leak',             'memory_leak',        'Gradual memory exhaustion causing increasing GC pauses.',           '🧠', 'gradual',   0.6, 5,   8,   50,  0.2),
('CPU Saturation',          'cpu_saturation',     'CPU pinned at 100% — requests queue and timeout.',                  '🔥', 'gradual',   0.7, 8,   15,  200, 0.35),
('Network Partition',       'network_partition',  'Network split — node cannot reach some dependencies.',              '🔌', 'immediate', 0.8, 60,  0,   0,   0.5),
('Disk Full',               'disk_full',          'Storage exhausted — writes fail, logs lost.',                       '💾', 'gradual',   0.5, 3,   5,   20,  0.15),
('Connection Pool Exhaustion','conn_pool_exhaust','All DB connections consumed — new requests blocked.',               '🚰', 'threshold', 0.7, 4,   20,  300, 0.4),
('DNS Resolution Failure',  'dns_failure',        'DNS cannot resolve hostnames — services lose each other.',          '🌐', 'immediate', 0.9, 80,  0,   0,   0.7),
('Certificate Expiry',      'cert_expiry',        'TLS certificate expired — all HTTPS connections rejected.',         '🔒', 'immediate', 0.8, 70,  0,   0,   0.55),
('Dependency Timeout',      'dep_timeout',        'Upstream dependency responding too slowly — thread pool starvation.','⏱️','gradual',   0.6, 6,   12,  500, 0.3),
('Data Corruption',         'data_corruption',    'Silent data corruption causing downstream logic failures.',         '🗃️', 'threshold', 0.9, 10,  5,   0,   0.25);

-- ============================================================
-- TOPOLOGY 1: E-Commerce Platform (14 services)
-- ============================================================
INSERT INTO topologies (id, name, description, category, revenue_per_min, metadata) VALUES
(1, 'E-Commerce Platform',
 'A production-grade e-commerce microservice architecture with 14 interconnected services. Handles ~50k req/min with an average order value of $85.',
 'template', 4200,
 '{"version":"2.4","region":"us-east-1","estimatedRPS":50000}');

INSERT INTO nodes (id, topology_id, node_key, label, node_type, x, y, criticality, revenue_share, config, resilience) VALUES
(1,  1, 'cdn',          'CDN (CloudFront)',     'cdn',           0.12, 0.08, 0.6, 0.05, '{"maxHealth":100,"recoveryRate":5,"baseLatency":5}',   '{"circuitBreaker":false,"retry":true,"fallback":true,"redundancy":true,"rateLimit":false}'),
(2,  1, 'lb',           'Load Balancer',        'load_balancer', 0.50, 0.08, 0.95,0.0,  '{"maxHealth":100,"recoveryRate":3,"baseLatency":2}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":true}'),
(3,  1, 'gateway',      'API Gateway',          'gateway',       0.50, 0.22, 0.95,0.0,  '{"maxHealth":100,"recoveryRate":2,"baseLatency":10}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":true}'),
(4,  1, 'user_svc',     'User Service',         'service',       0.15, 0.38, 0.7, 0.10, '{"maxHealth":100,"recoveryRate":3,"baseLatency":25}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":false}'),
(5,  1, 'product_svc',  'Product Service',      'service',       0.35, 0.38, 0.8, 0.20, '{"maxHealth":100,"recoveryRate":3,"baseLatency":30}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":false,"rateLimit":false}'),
(6,  1, 'order_svc',    'Order Service',        'service',       0.55, 0.38, 0.9, 0.35, '{"maxHealth":100,"recoveryRate":2,"baseLatency":45}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":false}'),
(7,  1, 'search_svc',   'Search Service',       'service',       0.78, 0.38, 0.5, 0.10, '{"maxHealth":100,"recoveryRate":4,"baseLatency":20}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":false,"rateLimit":false}'),
(8,  1, 'payment_svc',  'Payment Service',      'service',       0.25, 0.55, 1.0, 0.35, '{"maxHealth":100,"recoveryRate":1,"baseLatency":80}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":true,"rateLimit":true}'),
(9,  1, 'inventory_svc','Inventory Service',     'service',       0.50, 0.55, 0.8, 0.15, '{"maxHealth":100,"recoveryRate":3,"baseLatency":35}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":false}'),
(10, 1, 'notif_svc',    'Notification Service', 'service',       0.75, 0.55, 0.3, 0.02, '{"maxHealth":100,"recoveryRate":5,"baseLatency":15}',  '{"circuitBreaker":false,"retry":true,"fallback":true,"redundancy":false,"rateLimit":false}'),
(11, 1, 'cache',        'Redis Cache',          'cache',         0.12, 0.75, 0.7, 0.0,  '{"maxHealth":100,"recoveryRate":6,"baseLatency":2}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":false,"rateLimit":false}'),
(12, 1, 'db_primary',   'Primary DB (MySQL)',   'database',      0.37, 0.75, 1.0, 0.0,  '{"maxHealth":100,"recoveryRate":1,"baseLatency":8}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":false}'),
(13, 1, 'db_replica',   'Read Replica',         'database',      0.58, 0.75, 0.5, 0.0,  '{"maxHealth":100,"recoveryRate":2,"baseLatency":8}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":false,"rateLimit":false}'),
(14, 1, 'mq',           'Message Queue (RMQ)',  'queue',         0.83, 0.75, 0.6, 0.0,  '{"maxHealth":100,"recoveryRate":4,"baseLatency":5}',   '{"circuitBreaker":false,"retry":true,"fallback":false,"redundancy":true,"rateLimit":false}');

-- Edges: source depends on target (source → target means source CALLS target)
INSERT INTO edges (topology_id, source_node_id, target_node_id, weight, edge_type, base_latency) VALUES
-- CDN → LB
(1, 1,  2,  0.3, 'sync',  5),
-- LB → Gateway
(1, 2,  3,  0.95,'sync',  2),
-- Gateway → services
(1, 3,  4,  0.6, 'sync',  10),
(1, 3,  5,  0.7, 'sync',  10),
(1, 3,  6,  0.8, 'sync',  10),
(1, 3,  7,  0.4, 'sync',  10),
-- Order → Payment, Inventory, Notification
(1, 6,  8,  0.9, 'sync',  15),
(1, 6,  9,  0.7, 'sync',  12),
(1, 6,  10, 0.3, 'async', 5),
-- Payment → DB, Notification
(1, 8,  12, 0.9, 'sync',  8),
(1, 8,  10, 0.2, 'async', 5),
-- Product → Cache, DB, Search
(1, 5,  11, 0.5, 'sync',  2),
(1, 5,  12, 0.7, 'sync',  8),
(1, 5,  7,  0.3, 'async', 10),
-- User → Cache, DB
(1, 4,  11, 0.4, 'sync',  2),
(1, 4,  12, 0.6, 'sync',  8),
-- Search → Read Replica
(1, 7,  13, 0.8, 'sync',  8),
-- Inventory → DB, MQ
(1, 9,  12, 0.8, 'sync',  8),
(1, 9,  14, 0.4, 'async', 5),
-- Notification → MQ
(1, 10, 14, 0.6, 'async', 5),
-- DB Primary → Replica (replication)
(1, 12, 13, 0.3, 'data',  2);

-- ============================================================
-- TOPOLOGY 2: Social Media Backend (12 services)
-- ============================================================
INSERT INTO topologies (id, name, description, category, revenue_per_min, metadata) VALUES
(2, 'Social Media Backend',
 'High-read social platform with feed generation, real-time notifications, and media processing. 200k+ concurrent users.',
 'template', 8500,
 '{"version":"3.1","region":"multi-region","estimatedRPS":120000}');

INSERT INTO nodes (id, topology_id, node_key, label, node_type, x, y, criticality, revenue_share, config, resilience) VALUES
(15, 2, 'edge_cdn',     'Edge CDN',             'cdn',           0.50, 0.05, 0.7, 0.05, '{"maxHealth":100,"recoveryRate":5,"baseLatency":3}',   '{"circuitBreaker":false,"retry":true,"fallback":true,"redundancy":true,"rateLimit":false}'),
(16, 2, 'api_gw',       'API Gateway',          'gateway',       0.50, 0.18, 0.95,0.0,  '{"maxHealth":100,"recoveryRate":2,"baseLatency":8}',   '{"circuitBreaker":true,"retry":false,"fallback":false,"redundancy":true,"rateLimit":true}'),
(17, 2, 'auth_svc',     'Auth Service',         'service',       0.15, 0.33, 0.9, 0.10, '{"maxHealth":100,"recoveryRate":2,"baseLatency":20}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":true,"rateLimit":true}'),
(18, 2, 'feed_svc',     'Feed Service',         'service',       0.38, 0.33, 0.9, 0.30, '{"maxHealth":100,"recoveryRate":2,"baseLatency":40}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":false,"rateLimit":false}'),
(19, 2, 'post_svc',     'Post Service',         'service',       0.62, 0.33, 0.8, 0.25, '{"maxHealth":100,"recoveryRate":3,"baseLatency":30}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":false}'),
(20, 2, 'realtime_svc', 'Realtime (WebSocket)', 'service',       0.85, 0.33, 0.6, 0.10, '{"maxHealth":100,"recoveryRate":4,"baseLatency":5}',   '{"circuitBreaker":false,"retry":false,"fallback":true,"redundancy":false,"rateLimit":true}'),
(21, 2, 'media_svc',    'Media Processing',     'service',       0.15, 0.55, 0.5, 0.05, '{"maxHealth":100,"recoveryRate":4,"baseLatency":200}', '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":true}'),
(22, 2, 'graph_db',     'Social Graph DB',      'database',      0.38, 0.55, 1.0, 0.0,  '{"maxHealth":100,"recoveryRate":1,"baseLatency":12}',  '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":false}'),
(23, 2, 'feed_cache',   'Feed Cache (Redis)',   'cache',         0.62, 0.55, 0.8, 0.0,  '{"maxHealth":100,"recoveryRate":5,"baseLatency":1}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":false}'),
(24, 2, 'event_bus',    'Event Bus (Kafka)',    'queue',         0.85, 0.55, 0.7, 0.0,  '{"maxHealth":100,"recoveryRate":3,"baseLatency":4}',   '{"circuitBreaker":false,"retry":true,"fallback":false,"redundancy":true,"rateLimit":false}'),
(25, 2, 'blob_store',   'Blob Storage (S3)',    'external',      0.25, 0.78, 0.5, 0.0,  '{"maxHealth":100,"recoveryRate":6,"baseLatency":15}',  '{"circuitBreaker":false,"retry":true,"fallback":true,"redundancy":true,"rateLimit":false}'),
(26, 2, 'search_idx',   'Search Index (ES)',    'database',      0.65, 0.78, 0.4, 0.0,  '{"maxHealth":100,"recoveryRate":3,"baseLatency":10}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":false,"rateLimit":false}');

INSERT INTO edges (topology_id, source_node_id, target_node_id, weight, edge_type, base_latency) VALUES
(2, 15, 16, 0.9, 'sync',  3),
(2, 16, 17, 0.8, 'sync',  8),
(2, 16, 18, 0.9, 'sync',  10),
(2, 16, 19, 0.7, 'sync',  10),
(2, 16, 20, 0.5, 'sync',  5),
(2, 18, 22, 0.9, 'sync',  12),
(2, 18, 23, 0.8, 'sync',  1),
(2, 18, 24, 0.3, 'async', 4),
(2, 19, 22, 0.7, 'sync',  12),
(2, 19, 23, 0.5, 'sync',  1),
(2, 19, 24, 0.6, 'async', 4),
(2, 19, 26, 0.4, 'async', 10),
(2, 20, 24, 0.7, 'sync',  4),
(2, 21, 25, 0.9, 'sync',  15),
(2, 21, 24, 0.5, 'async', 4),
(2, 17, 22, 0.6, 'sync',  12);

-- ============================================================
-- SCENARIOS: Pre-built incident recreations
-- ============================================================
INSERT INTO scenarios (topology_id, name, description, incident_date, company, failure_sequence, lessons_learned) VALUES
(1, 'The Database Meltdown',
 'Primary database hits connection pool exhaustion during a traffic spike. Writes fail, reads overwhelm the replica, and the failure percolates through ordering and payments.',
 '2024-03-15', 'Internal Template',
 '[{"tick":20,"nodeKey":"db_primary","failureMode":"conn_pool_exhaust"},{"tick":80,"nodeKey":"db_replica","failureMode":"cpu_saturation"}]',
 'Connection pool limits must be tuned for peak traffic. Read replicas need independent connection pools. Circuit breakers on DB-dependent services are essential.'),

(1, 'Cache Stampede',
 'Redis cache crashes. Every service that relied on cache now hammers the primary database directly, causing cascading connection exhaustion and total platform failure.',
 '2024-06-22', 'Internal Template',
 '[{"tick":15,"nodeKey":"cache","failureMode":"crash"}]',
 'Cache-aside with fallback is critical. Services must handle cache misses gracefully with request coalescing. Database rate limiting prevents stampede.'),

(1, 'Payment Provider Timeout Storm',
 'External payment processor starts responding slowly. Thread pools in Payment Service fill up, blocking Order Service, which backs up the API Gateway.',
 '2024-01-08', 'Internal Template',
 '[{"tick":25,"nodeKey":"payment_svc","failureMode":"dep_timeout"}]',
 'Aggressive timeouts on external dependencies. Circuit breakers must open quickly. Queue-based payment processing prevents synchronous failure propagation.'),

(1, 'The Memory Leak That Ate Production',
 'A subtle memory leak in Product Service causes gradual degradation over 30 minutes. By the time alerts fire, GC pauses are causing timeouts across the platform.',
 '2024-09-12', 'Internal Template',
 '[{"tick":10,"nodeKey":"product_svc","failureMode":"memory_leak"}]',
 'Memory leak detection requires proactive monitoring, not just reactive alerting. Canary deployments catch leaks before full rollout. Auto-scaling buys time but does not fix root cause.'),

(2, 'Feed Cache Avalanche',
 'Feed cache cluster loses a shard. Fan-out reads overwhelm the Social Graph DB, which starts rejecting connections. Feed and Post services degrade simultaneously.',
 '2024-04-01', 'Internal Template',
 '[{"tick":15,"nodeKey":"feed_cache","failureMode":"crash"},{"tick":60,"nodeKey":"graph_db","failureMode":"conn_pool_exhaust"}]',
 'Cache warming strategies are essential after cache failures. Social graph queries need circuit breakers. Stale-while-revalidate patterns prevent thundering herds.'),

(2, 'Event Bus Partition',
 'Kafka cluster experiences a network partition. Real-time notifications stop, media processing queue backs up, and eventually the post pipeline stalls.',
 '2024-07-18', 'Internal Template',
 '[{"tick":20,"nodeKey":"event_bus","failureMode":"network_partition"}]',
 'Event-driven architectures need dead letter queues and replay capabilities. Services must function in degraded mode when the event bus is unavailable.');
