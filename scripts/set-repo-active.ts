/**
 * Script to set a repository's isActive flag
 * Run with: npx tsx scripts/set-repo-active.ts <repo-id> <true|false>
 * Example: npx tsx scripts/set-repo-active.ts 977557912 true
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { registeredRepositories } from '../shared/schema';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './server/.env' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not defined');
  process.exit(1);
}

const client = postgres(connectionString, {
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(client);

async function setRepoActive() {
  const repoId = process.argv[2];
  const isActive = process.argv[3] === 'true';

  if (!repoId) {
    console.error('Usage: npx tsx scripts/set-repo-active.ts <repo-id> <true|false>');
    process.exit(1);
  }

  console.log(`Setting repo ${repoId} isActive=${isActive}...`);

  const result = await db.update(registeredRepositories)
    .set({ isActive })
    .where(eq(registeredRepositories.githubRepoId, repoId))
    .returning({ id: registeredRepositories.id, name: registeredRepositories.githubRepoFullName, isActive: registeredRepositories.isActive });

  if (result.length > 0) {
    console.log(`Updated: ${result[0].name} (ID: ${result[0].id}) -> isActive: ${result[0].isActive}`);
  } else {
    console.log('Repository not found in registered_repositories');
  }

  await client.end();
}

setRepoActive()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
