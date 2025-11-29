/**
 * Script to add is_active column to registered_repositories table
 * Run with: npx tsx scripts/add-is-active-column.ts
 */
import postgres from 'postgres';
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

async function addColumn() {
  console.log('Adding is_active column to registered_repositories table...');

  try {
    // Add column if it doesn't exist
    await client`
      ALTER TABLE registered_repositories
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false
    `;
    console.log('Column added successfully!');
  } catch (error: any) {
    if (error.code === '42701') {
      console.log('Column already exists');
    } else {
      throw error;
    }
  }

  await client.end();
}

addColumn()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
