/**
 * Run Drizzle migrations to create all tables.
 *
 * Usage: npx tsx scripts/migrate.ts
 *
 * Requires DATABASE_URL environment variable.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  console.log('🔧 Running migrations...');
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: './drizzle' });

  await client.end();
  console.log('✅ Migrations complete!');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
