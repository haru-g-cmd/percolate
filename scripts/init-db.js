const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function init() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
    multipleStatements: true
  });

  console.log('Connected to MySQL. Initializing database...');

  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await conn.query(schema);
  console.log('✓ Schema created');

  // Check if seed data already exists
  await conn.query('USE `percolate_db`');
  const [rows] = await conn.query('SELECT COUNT(*) as c FROM topologies');
  if (rows[0].c === 0) {
    const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql'), 'utf8');
    await conn.query(seed);
    console.log('✓ Seed data inserted');
  } else {
    console.log('✓ Seed data already exists, skipping');
  }

  await conn.end();
  console.log('Database ready!');
}

init().catch(err => { console.error('DB init failed:', err); process.exit(1); });
