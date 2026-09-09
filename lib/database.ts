import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client';

let client: Client | undefined;
export function getClient(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('Configure TURSO_DATABASE_URL e aplique npm run db:migrate.');
  if (process.env.VERCEL && !/^(libsql|https):\/\//.test(url)) {
    throw new Error('Na Vercel, configure um banco remoto persistente.');
  }
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

function result<T>(value: ResultSet) {
  return { results: value.rows as unknown as T[], meta: { changes: value.rowsAffected } };
}

// Preserve parameter binding and atomic batches used by synchronization.
export class Statement {
  constructor(readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: InValue[]) { return new Statement(this.sql, args); }
  async all<T>() { return result<T>(await getClient().execute(this)); }
  async first<T>(): Promise<T | null> { return (await this.all<T>()).results[0] ?? null; }
  async run() { return this.all<Record<string, unknown>>(); }
}

export function getDatabase() {
  return {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      if (!statements.length) return [];
      return (await getClient().batch(statements, 'write')).map(value => result(value));
    },
  };
}
