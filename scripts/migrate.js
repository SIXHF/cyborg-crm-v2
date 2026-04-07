// Standalone migration script — runs raw SQL to create tables + seed admin user
// Uses only postgres and bcryptjs (copied into Docker image separately)
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL set, skipping migration');
    return;
  }

  console.log('Connecting to database...');
  const sql = postgres(url, { max: 1, connect_timeout: 15 });

  // Test connection
  try {
    await sql`SELECT 1`;
    console.log('Connected to PostgreSQL');
  } catch (e) {
    console.error('Cannot connect to database:', e.message);
    await sql.end();
    return;
  }

  // Run migration SQL files
  const migrationDir = path.join('/app', 'drizzle');
  if (fs.existsSync(migrationDir)) {
    const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      console.log('Running migration:', file);
      // Split by Drizzle's statement-breakpoint marker and run each statement individually
      // This way one failing statement (e.g. enum already exists) doesn't block the rest
      const statements = content.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s.length > 0);
      let applied = 0, skipped = 0, errors = 0;
      for (const stmt of statements) {
        try {
          await sql.unsafe(stmt);
          applied++;
        } catch (e) {
          if (e.message && (e.message.includes('already exists') || e.message.includes('duplicate'))) {
            skipped++;
          } else {
            errors++;
            console.error('  Statement error:', e.message.slice(0, 100));
          }
        }
      }
      console.log(`  ${file}: ${applied} applied, ${skipped} skipped, ${errors} errors (${statements.length} total)`);
    }
  } else {
    console.log('No drizzle/ directory found, skipping SQL migration');
  }

  // Create enum types if they don't exist (Drizzle migration should handle this, but just in case)
  const enums = [
    "DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin','processor','agent'); EXCEPTION WHEN duplicate_object THEN null; END $$",
    "DO $$ BEGIN CREATE TYPE lead_status AS ENUM ('new','in_review','approved','declined','forwarded','on_hold'); EXCEPTION WHEN duplicate_object THEN null; END $$",
    "DO $$ BEGIN CREATE TYPE import_status AS ENUM ('pending','running','done','error','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$",
    "DO $$ BEGIN CREATE TYPE call_outcome AS ENUM ('picked_up','no_answer','voicemail','callback','wrong_number','do_not_call','busy','other'); EXCEPTION WHEN duplicate_object THEN null; END $$",
    "DO $$ BEGIN CREATE TYPE custom_field_type AS ENUM ('text','number','date','select','textarea','checkbox'); EXCEPTION WHEN duplicate_object THEN null; END $$",
    "DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('lead_assigned','lead_updated','comment_added','followup_due','import_done','system'); EXCEPTION WHEN duplicate_object THEN null; END $$",
  ];
  for (const e of enums) {
    try { await sql.unsafe(e); } catch (err) { /* ignore */ }
  }

  // Seed admin user
  try {
    const existing = await sql`SELECT id FROM users WHERE username = 'admin' LIMIT 1`;
    if (existing.length === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await sql`INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ('admin', 'admin@cyborg.crm', ${hash}, 'Admin', 'admin', true)`;
      console.log('Admin user created (admin / admin123)');
    } else {
      console.log('Admin user already exists');
    }
  } catch (e) {
    console.log('Seed error:', e.message);
  }

  await sql.end();
  console.log('Migration complete');
}

migrate().catch(e => {
  console.error('Migration failed:', e.message);
  // Don't exit with error — let the server start anyway
});
