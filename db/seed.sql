USE `percolate_db`;

-- ============================================================
-- FAILURE MODES CATALOG
-- ============================================================
INSERT INTO failure_modes (name, slug, description, icon, propagation_type, default_severity, health_impact, load_impact, latency_impact, spread_rate) VALUES
('Process Crash',           'crash',              'Complete process failure, immediate shutdown.',                      '', 'immediate', 1.0, 100, 0,   0,   0.6),
('Memory Leak',             'memory_leak',        'Gradual memory exhaustion causing increasing GC pauses.',           '', 'gradual',   0.6, 5,   8,   50,  0.2),
('CPU Saturation',          'cpu_saturation',     'CPU pinned at 100%. Requests queue and timeout.',                   '', 'gradual',   0.7, 8,   15,  200, 0.35),
('Network Partition',       'network_partition',  'Network split. Node cannot reach some dependencies.',               '', 'immediate', 0.8, 60,  0,   0,   0.5),
('Disk Full',               'disk_full',          'Storage exhausted. Writes fail, logs lost.',                        '', 'gradual',   0.5, 3,   5,   20,  0.15),
('Connection Pool Exhaustion','conn_pool_exhaust','All DB connections consumed. New requests blocked.',                '', 'threshold', 0.7, 4,   20,  300, 0.4),
('DNS Resolution Failure',  'dns_failure',        'DNS cannot resolve hostnames. Services lose each other.',           '', 'immediate', 0.9, 80,  0,   0,   0.7),
('Certificate Expiry',      'cert_expiry',        'TLS certificate expired. All HTTPS connections rejected.',          '', 'immediate', 0.8, 70,  0,   0,   0.55),
('Dependency Timeout',      'dep_timeout',        'Upstream dependency responding too slowly. Thread pool starvation.','', 'gradual',   0.6, 6,   12,  500, 0.3),
('Data Corruption',         'data_corruption',    'Silent data corruption causing downstream logic failures.',         '', 'threshold', 0.9, 10,  5,   0,   0.25);

-- ============================================================
-- TOPOLOGY 1: E-Commerce Platform (14 services)
-- ============================================================
INSERT INTO topologies (id, name, description, category, revenue_per_min, metadata) VALUES
(1, 'E-Commerce Platform',
 'Production e-commerce microservice architecture with 14 interconnected services handling ~50k req/min.',
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

INSERT INTO edges (topology_id, source_node_id, target_node_id, weight, edge_type, base_latency) VALUES
(1, 1,  2,  0.3, 'sync',  5),
(1, 2,  3,  0.95,'sync',  2),
(1, 3,  4,  0.6, 'sync',  10),
(1, 3,  5,  0.7, 'sync',  10),
(1, 3,  6,  0.8, 'sync',  10),
(1, 3,  7,  0.4, 'sync',  10),
(1, 6,  8,  0.9, 'sync',  15),
(1, 6,  9,  0.7, 'sync',  12),
(1, 6,  10, 0.3, 'async', 5),
(1, 8,  12, 0.9, 'sync',  8),
(1, 8,  10, 0.2, 'async', 5),
(1, 5,  11, 0.5, 'sync',  2),
(1, 5,  12, 0.7, 'sync',  8),
(1, 5,  7,  0.3, 'async', 10),
(1, 4,  11, 0.4, 'sync',  2),
(1, 4,  12, 0.6, 'sync',  8),
(1, 7,  13, 0.8, 'sync',  8),
(1, 9,  12, 0.8, 'sync',  8),
(1, 9,  14, 0.4, 'async', 5),
(1, 10, 14, 0.6, 'async', 5),
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
-- TOPOLOGY 3: Kubernetes Microservices Cluster (13 services)
-- ============================================================
INSERT INTO topologies (id, name, description, category, revenue_per_min, metadata) VALUES
(3, 'Kubernetes Cluster',
 'Cloud-native K8s deployment with Istio service mesh, gRPC backends, and observability stack. Runs on 3 availability zones.',
 'template', 6800,
 '{"version":"1.28","region":"us-west-2","estimatedRPS":80000}');

INSERT INTO nodes (id, topology_id, node_key, label, node_type, x, y, criticality, revenue_share, config, resilience) VALUES
(27, 3, 'ingress',      'Ingress Controller',   'gateway',       0.50, 0.05, 0.95,0.0,  '{"maxHealth":100,"recoveryRate":3,"baseLatency":3}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":true}'),
(28, 3, 'mesh',         'Istio Service Mesh',   'gateway',       0.50, 0.18, 0.9, 0.0,  '{"maxHealth":100,"recoveryRate":2,"baseLatency":2}',   '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":true,"rateLimit":true}'),
(29, 3, 'auth_api',     'Auth API',             'service',       0.15, 0.33, 0.9, 0.08, '{"maxHealth":100,"recoveryRate":3,"baseLatency":15}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":true,"rateLimit":true}'),
(30, 3, 'user_api',     'User API',             'service',       0.35, 0.33, 0.7, 0.12, '{"maxHealth":100,"recoveryRate":3,"baseLatency":20}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":false}'),
(31, 3, 'product_api',  'Product API (gRPC)',   'service',       0.55, 0.33, 0.8, 0.22, '{"maxHealth":100,"recoveryRate":3,"baseLatency":12}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":false,"rateLimit":false}'),
(32, 3, 'order_api',    'Order API (gRPC)',     'service',       0.75, 0.33, 0.9, 0.30, '{"maxHealth":100,"recoveryRate":2,"baseLatency":25}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":false}'),
(33, 3, 'payment_api',  'Payment API',          'service',       0.25, 0.55, 1.0, 0.28, '{"maxHealth":100,"recoveryRate":1,"baseLatency":60}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":true,"rateLimit":true}'),
(34, 3, 'pg_primary',   'PostgreSQL Primary',   'database',      0.45, 0.55, 1.0, 0.0,  '{"maxHealth":100,"recoveryRate":1,"baseLatency":6}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":false}'),
(35, 3, 'pg_replica',   'PostgreSQL Replica',   'database',      0.65, 0.55, 0.5, 0.0,  '{"maxHealth":100,"recoveryRate":2,"baseLatency":6}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":false,"rateLimit":false}'),
(36, 3, 'redis_cluster','Redis Cluster',        'cache',         0.15, 0.72, 0.7, 0.0,  '{"maxHealth":100,"recoveryRate":5,"baseLatency":1}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":false}'),
(37, 3, 'kafka_broker', 'Kafka Broker',         'queue',         0.40, 0.72, 0.7, 0.0,  '{"maxHealth":100,"recoveryRate":3,"baseLatency":4}',   '{"circuitBreaker":false,"retry":true,"fallback":false,"redundancy":true,"rateLimit":false}'),
(38, 3, 'prometheus',   'Prometheus',           'service',       0.65, 0.72, 0.4, 0.0,  '{"maxHealth":100,"recoveryRate":5,"baseLatency":10}',  '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":false,"rateLimit":false}'),
(39, 3, 'obj_store',    'Object Storage (S3)',  'external',      0.85, 0.72, 0.5, 0.0,  '{"maxHealth":100,"recoveryRate":6,"baseLatency":20}',  '{"circuitBreaker":false,"retry":true,"fallback":true,"redundancy":true,"rateLimit":false}');

INSERT INTO edges (topology_id, source_node_id, target_node_id, weight, edge_type, base_latency) VALUES
(3, 27, 28, 0.95,'sync',  2),
(3, 28, 29, 0.8, 'sync',  5),
(3, 28, 30, 0.7, 'sync',  5),
(3, 28, 31, 0.8, 'sync',  5),
(3, 28, 32, 0.9, 'sync',  5),
(3, 30, 34, 0.7, 'sync',  6),
(3, 30, 36, 0.5, 'sync',  1),
(3, 31, 34, 0.6, 'sync',  6),
(3, 31, 36, 0.4, 'sync',  1),
(3, 31, 35, 0.5, 'sync',  6),
(3, 32, 33, 0.9, 'sync',  10),
(3, 32, 34, 0.8, 'sync',  6),
(3, 32, 37, 0.5, 'async', 4),
(3, 33, 34, 0.9, 'sync',  6),
(3, 33, 37, 0.3, 'async', 4),
(3, 29, 34, 0.6, 'sync',  6),
(3, 29, 36, 0.4, 'sync',  1),
(3, 34, 35, 0.3, 'data',  2),
(3, 38, 28, 0.2, 'health',10),
(3, 32, 39, 0.3, 'async', 20);

-- ============================================================
-- TOPOLOGY 4: ML Inference Pipeline (12 services)
-- ============================================================
INSERT INTO topologies (id, name, description, category, revenue_per_min, metadata) VALUES
(4, 'ML Inference Pipeline',
 'Production ML serving system with real-time feature computation, model serving, A/B testing, and batch retraining via Airflow.',
 'template', 5200,
 '{"version":"1.0","region":"us-east-1","estimatedRPS":30000}');

INSERT INTO nodes (id, topology_id, node_key, label, node_type, x, y, criticality, revenue_share, config, resilience) VALUES
(40, 4, 'api_gw',       'API Gateway',          'gateway',       0.50, 0.05, 0.95,0.0,  '{"maxHealth":100,"recoveryRate":2,"baseLatency":5}',   '{"circuitBreaker":true,"retry":false,"fallback":false,"redundancy":true,"rateLimit":true}'),
(41, 4, 'lb',           'Load Balancer',        'load_balancer', 0.50, 0.18, 0.95,0.0,  '{"maxHealth":100,"recoveryRate":3,"baseLatency":2}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":true}'),
(42, 4, 'feature_svc',  'Feature Service',      'service',       0.20, 0.33, 0.9, 0.15, '{"maxHealth":100,"recoveryRate":2,"baseLatency":30}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":false,"rateLimit":false}'),
(43, 4, 'model_server', 'Model Server (TF)',    'service',       0.50, 0.33, 1.0, 0.40, '{"maxHealth":100,"recoveryRate":1,"baseLatency":50}',  '{"circuitBreaker":true,"retry":true,"fallback":true,"redundancy":true,"rateLimit":true}'),
(44, 4, 'preprocess',   'Preprocessing',        'service',       0.80, 0.33, 0.7, 0.10, '{"maxHealth":100,"recoveryRate":3,"baseLatency":20}',  '{"circuitBreaker":true,"retry":true,"fallback":false,"redundancy":false,"rateLimit":false}'),
(45, 4, 'batch_pipe',   'Batch Pipeline (Air)', 'service',       0.15, 0.55, 0.5, 0.05, '{"maxHealth":100,"recoveryRate":4,"baseLatency":100}', '{"circuitBreaker":false,"retry":true,"fallback":false,"redundancy":false,"rateLimit":false}'),
(46, 4, 'pg_db',        'PostgreSQL',           'database',      0.38, 0.55, 0.8, 0.0,  '{"maxHealth":100,"recoveryRate":1,"baseLatency":8}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":false}'),
(47, 4, 'feature_store','Feature Store (Redis)','cache',         0.60, 0.55, 0.9, 0.0,  '{"maxHealth":100,"recoveryRate":4,"baseLatency":1}',   '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":true,"rateLimit":false}'),
(48, 4, 'kafka_stream', 'Kafka Event Stream',   'queue',         0.82, 0.55, 0.6, 0.0,  '{"maxHealth":100,"recoveryRate":3,"baseLatency":4}',   '{"circuitBreaker":false,"retry":true,"fallback":false,"redundancy":true,"rateLimit":false}'),
(49, 4, 'model_reg',    'Model Registry (S3)',  'external',      0.15, 0.78, 0.6, 0.0,  '{"maxHealth":100,"recoveryRate":6,"baseLatency":25}',  '{"circuitBreaker":false,"retry":true,"fallback":true,"redundancy":true,"rateLimit":false}'),
(50, 4, 'monitoring',   'Monitoring (Prom)',    'service',       0.45, 0.78, 0.3, 0.0,  '{"maxHealth":100,"recoveryRate":5,"baseLatency":10}',  '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":false,"rateLimit":false}'),
(51, 4, 'fallback_mdl', 'Fallback Model',       'service',       0.75, 0.78, 0.5, 0.30, '{"maxHealth":100,"recoveryRate":5,"baseLatency":15}',  '{"circuitBreaker":false,"retry":false,"fallback":false,"redundancy":false,"rateLimit":false}');

INSERT INTO edges (topology_id, source_node_id, target_node_id, weight, edge_type, base_latency) VALUES
(4, 40, 41, 0.95,'sync',  2),
(4, 41, 42, 0.8, 'sync',  10),
(4, 41, 43, 0.9, 'sync',  10),
(4, 41, 44, 0.6, 'sync',  10),
(4, 42, 47, 0.9, 'sync',  1),
(4, 42, 46, 0.6, 'sync',  8),
(4, 43, 47, 0.7, 'sync',  1),
(4, 43, 49, 0.4, 'sync',  25),
(4, 43, 51, 0.3, 'sync',  15),
(4, 44, 48, 0.5, 'async', 4),
(4, 44, 46, 0.4, 'sync',  8),
(4, 45, 46, 0.7, 'sync',  8),
(4, 45, 47, 0.6, 'sync',  1),
(4, 45, 49, 0.5, 'sync',  25),
(4, 45, 48, 0.4, 'async', 4),
(4, 50, 43, 0.2, 'health',10),
(4, 50, 42, 0.2, 'health',10);

-- ============================================================
-- SCENARIOS
-- ============================================================

-- E-Commerce scenarios (6)
INSERT INTO scenarios (topology_id, name, description, incident_date, company, failure_sequence, lessons_learned) VALUES
(1, 'Database Meltdown',
 'Primary database hits connection pool exhaustion during a traffic spike. Writes fail, reads overwhelm the replica, and the failure percolates through ordering and payments.',
 NULL, NULL,
 '[{"tick":20,"nodeKey":"db_primary","failureMode":"conn_pool_exhaust"},{"tick":80,"nodeKey":"db_replica","failureMode":"cpu_saturation"}]',
 'Connection pool limits must be tuned for peak traffic. Read replicas need independent connection pools. Circuit breakers on DB-dependent services are essential.'),

(1, 'Cache Stampede',
 'Redis cache crashes. Every service that relied on cache now hammers the primary database directly, causing cascading connection exhaustion and total platform failure.',
 NULL, NULL,
 '[{"tick":15,"nodeKey":"cache","failureMode":"crash"}]',
 'Cache-aside with fallback is critical. Services must handle cache misses gracefully with request coalescing. Database rate limiting prevents stampede.'),

(1, 'Payment Timeout Storm',
 'External payment processor starts responding slowly. Thread pools in Payment Service fill up, blocking Order Service, which backs up the API Gateway.',
 NULL, NULL,
 '[{"tick":25,"nodeKey":"payment_svc","failureMode":"dep_timeout"}]',
 'Aggressive timeouts on external dependencies. Circuit breakers must open quickly. Queue-based payment processing prevents synchronous failure propagation.'),

(1, 'Slow Memory Leak',
 'A subtle memory leak in Product Service causes gradual degradation over time. By the time alerts fire, GC pauses are causing timeouts across the platform.',
 NULL, NULL,
 '[{"tick":10,"nodeKey":"product_svc","failureMode":"memory_leak"}]',
 'Memory leak detection requires proactive monitoring, not just reactive alerting. Canary deployments catch leaks before full rollout.'),

(1, 'CDN Origin Failure',
 'CDN loses connection to origin servers. Cached content continues serving but all dynamic API requests fail. Users see stale product data and cannot check out.',
 NULL, NULL,
 '[{"tick":10,"nodeKey":"cdn","failureMode":"network_partition"},{"tick":40,"nodeKey":"lb","failureMode":"cpu_saturation"}]',
 'CDN must have fallback origins. Static and dynamic content should be served through separate paths. Health checks on origin must be aggressive.'),

(1, 'Search Index Corruption',
 'Search service starts returning wrong results after a bad index deploy. Users cannot find products, product pages get wrong recommendations, conversion drops.',
 NULL, NULL,
 '[{"tick":15,"nodeKey":"search_svc","failureMode":"data_corruption"},{"tick":50,"nodeKey":"product_svc","failureMode":"cpu_saturation"}]',
 'Search indexes need rollback capability. Canary analysis should compare result quality metrics before full rollout. Feature flags on search ranking changes.');

-- Social Media scenarios (4)
INSERT INTO scenarios (topology_id, name, description, incident_date, company, failure_sequence, lessons_learned) VALUES
(2, 'Feed Cache Avalanche',
 'Feed cache cluster loses a shard. Fan-out reads overwhelm the Social Graph DB, which starts rejecting connections. Feed and Post services degrade simultaneously.',
 NULL, NULL,
 '[{"tick":15,"nodeKey":"feed_cache","failureMode":"crash"},{"tick":60,"nodeKey":"graph_db","failureMode":"conn_pool_exhaust"}]',
 'Cache warming strategies are essential after cache failures. Social graph queries need circuit breakers. Stale-while-revalidate patterns prevent thundering herds.'),

(2, 'Event Bus Partition',
 'Kafka cluster experiences a network partition. Real-time notifications stop, media processing queue backs up, and eventually the post pipeline stalls.',
 NULL, NULL,
 '[{"tick":20,"nodeKey":"event_bus","failureMode":"network_partition"}]',
 'Event-driven architectures need dead letter queues and replay capabilities. Services must function in degraded mode when the event bus is unavailable.'),

(2, 'Auth Service Overload',
 'Auth service gets overwhelmed by a credential stuffing attack. Token validation fails for all users, every API call returns 401, the entire platform becomes unusable.',
 NULL, NULL,
 '[{"tick":10,"nodeKey":"auth_svc","failureMode":"cpu_saturation"},{"tick":45,"nodeKey":"api_gw","failureMode":"conn_pool_exhaust"}]',
 'Auth services need aggressive rate limiting per IP. Token caching reduces auth service load. Fallback to cached auth decisions prevents total outage.'),

(2, 'Media Processing Backlog',
 'Media processing service runs out of disk space from unprocessed uploads. Upload queue fills in Kafka, posts with media start failing, users see broken images.',
 NULL, NULL,
 '[{"tick":15,"nodeKey":"media_svc","failureMode":"disk_full"},{"tick":50,"nodeKey":"event_bus","failureMode":"cpu_saturation"}]',
 'Disk usage monitoring with aggressive alerts. Dead letter queues for failed media jobs. Separate upload acceptance from processing to keep user experience stable.');

-- Kubernetes scenarios (3)
INSERT INTO scenarios (topology_id, name, description, incident_date, company, failure_sequence, lessons_learned) VALUES
(3, 'Service Mesh Failure',
 'Istio sidecar proxy configuration push fails across the cluster. All inter-service mTLS connections drop. Every gRPC call between services starts returning UNAVAILABLE.',
 NULL, NULL,
 '[{"tick":10,"nodeKey":"mesh","failureMode":"crash"},{"tick":30,"nodeKey":"order_api","failureMode":"network_partition"}]',
 'Service mesh control plane needs HA deployment. Sidecar proxies should cache last-known-good config. Gradual config rollout with canary analysis prevents cluster-wide impact.'),

(3, 'Pod OOM Cascade',
 'Order API pods hit OOM limits during a flash sale. Kubernetes restarts them but the restart storm causes resource contention. Payment API gets starved of CPU and starts timing out.',
 NULL, NULL,
 '[{"tick":15,"nodeKey":"order_api","failureMode":"memory_leak"},{"tick":50,"nodeKey":"payment_api","failureMode":"cpu_saturation"},{"tick":70,"nodeKey":"pg_primary","failureMode":"conn_pool_exhaust"}]',
 'Resource limits need headroom for burst traffic. Horizontal pod autoscaler should trigger before OOM. Pod disruption budgets prevent restart storms.'),

(3, 'PostgreSQL Failover Chaos',
 'Primary PostgreSQL goes down. Automatic failover promotes the replica, but connection strings are cached in Redis and service pods. Writes fail for 2 minutes during DNS propagation.',
 NULL, NULL,
 '[{"tick":20,"nodeKey":"pg_primary","failureMode":"crash"},{"tick":25,"nodeKey":"redis_cluster","failureMode":"data_corruption"}]',
 'Connection poolers like PgBouncer absorb failover impact. DNS TTLs must be low for database endpoints. Application retry logic must handle transient connection failures.');

-- ML Pipeline scenarios (3)
INSERT INTO scenarios (topology_id, name, description, incident_date, company, failure_sequence, lessons_learned) VALUES
(4, 'Model Server OOM',
 'Model server runs out of memory loading a new model version that is 3x larger than expected. Inference requests queue up, feature service times out waiting for predictions, fallback model activates but cannot handle the full load.',
 NULL, NULL,
 '[{"tick":15,"nodeKey":"model_server","failureMode":"memory_leak"},{"tick":45,"nodeKey":"fallback_mdl","failureMode":"cpu_saturation"}]',
 'Model size validation before deployment. Canary model serving with traffic splitting. Fallback models must be load-tested at full production traffic.'),

(4, 'Feature Store Corruption',
 'Bad batch pipeline run writes incorrect feature values to Redis. Model starts producing garbage predictions. Revenue impact is immediate but detection takes time since the model itself is healthy.',
 NULL, NULL,
 '[{"tick":10,"nodeKey":"feature_store","failureMode":"data_corruption"},{"tick":40,"nodeKey":"model_server","failureMode":"cpu_saturation"}]',
 'Feature validation checks before and after writes. Data quality monitoring on prediction distributions. Feature versioning allows instant rollback to previous values.'),

(4, 'Batch Pipeline Cascade',
 'Airflow batch pipeline fails mid-run, leaving partial data in PostgreSQL. Feature service reads stale features, model accuracy drops. Kafka consumer lag grows as reprocessing backs up.',
 NULL, NULL,
 '[{"tick":10,"nodeKey":"batch_pipe","failureMode":"crash"},{"tick":30,"nodeKey":"kafka_stream","failureMode":"cpu_saturation"},{"tick":55,"nodeKey":"feature_svc","failureMode":"dep_timeout"}]',
 'Batch pipelines need atomic writes with rollback. Feature freshness SLAs with automated fallback to last-known-good. Kafka consumer lag alerts must trigger before downstream impact.');
