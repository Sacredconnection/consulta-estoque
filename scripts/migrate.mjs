import { createClient } from '@libsql/client';
import { readFile } from 'node:fs/promises';

if (!process.env.TURSO_DATABASE_URL) throw new Error('Configure TURSO_DATABASE_URL.');
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  await client.execute('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY NOT NULL)');
  for (const name of ['0000_free_cerebro.sql', '0001_puzzling_goliath.sql', '0002_persistent_cache.sql']) {
    const tx = await client.transaction('write');
    try {
      const applied = await tx.execute({ sql: 'SELECT name FROM app_migrations WHERE name=?', args: [name] });
      if (!applied.rows.length) {
        const sql = await readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8');
        for (const statement of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) {
          await tx.execute(statement);
        }
        await tx.execute({ sql: 'INSERT INTO app_migrations (name) VALUES (?)', args: [name] });
      }
      await tx.commit();
      console.log('OK:', name);
    } finally { tx.close(); }
  }
} finally { client.close(); }
