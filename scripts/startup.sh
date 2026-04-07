#!/bin/sh
# Run database migration on startup using raw SQL (no npx/drizzle-kit needed)
# Uses node + postgres package already in the standalone build

echo "🔧 Running database migration..."
node -e "
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log('No DATABASE_URL, skipping migration'); return; }

  const sql = postgres(url, { max: 1, connect_timeout: 10 });

  // Run the Drizzle migration SQL file
  const migrationDir = path.join(__dirname, 'drizzle');
  if (fs.existsSync(migrationDir)) {
    const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      console.log('Running migration:', file);
      try {
        await sql.unsafe(content);
        console.log('✅', file, 'done');
      } catch (e) {
        // Ignore 'already exists' errors
        if (e.message && (e.message.includes('already exists') || e.message.includes('duplicate'))) {
          console.log('⏭️', file, '(already applied)');
        } else {
          console.error('❌', file, e.message);
        }
      }
    }
  }

  // Seed admin user if not exists
  try {
    const bcrypt = require('./node_modules/bcryptjs');
    const existing = await sql\`SELECT id FROM users WHERE username = 'admin' LIMIT 1\`;
    if (existing.length === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await sql\`INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ('admin', 'admin@cyborg.crm', \${hash}, 'Admin', 'admin', true)\`;
      console.log('✅ Admin user created (admin / admin123)');
    } else {
      console.log('ℹ️  Admin user exists');
    }
  } catch (e) {
    console.log('Seed:', e.message);
  }

  await sql.end();
  console.log('🎉 Migration complete');
}

migrate().catch(e => console.error('Migration error:', e.message));
" && echo "Starting server..." && node server.js
