/**
 * Seed script — creates the initial admin user and enables pg_trgm extension.
 *
 * Usage: npx tsx scripts/seed.ts
 *
 * Requires DATABASE_URL environment variable.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { users } from '../src/lib/db/schema';
import bcrypt from 'bcryptjs';

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log('🔧 Enabling pg_trgm extension...');
  await client`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

  console.log('👤 Creating admin user...');
  const passwordHash = await bcrypt.hash('admin123', 10);

  try {
    await db.insert(users).values({
      username: 'admin',
      email: 'admin@cyborg.crm',
      passwordHash,
      fullName: 'Admin',
      role: 'admin',
      isActive: true,
    });
    console.log('✅ Admin user created (username: admin, password: admin123)');
  } catch (e: any) {
    if (e.message?.includes('duplicate')) {
      console.log('ℹ️  Admin user already exists');
    } else {
      throw e;
    }
  }

  // Create GIN trigram index for fast fuzzy search on leads
  console.log('🔍 Creating GIN trigram search index...');
  try {
    await client`
      CREATE INDEX IF NOT EXISTS idx_leads_search_trgm
      ON leads USING GIN (
        (COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(phone,'') || ' ' || COALESCE(card_issuer,''))
        gin_trgm_ops
      )
    `;
    console.log('✅ Trigram search index created');
  } catch (e: any) {
    console.log('ℹ️  Search index:', e.message);
  }

  await client.end();
  console.log('🎉 Seed complete!');
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
