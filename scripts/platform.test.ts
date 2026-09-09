import test from 'node:test';
import assert from 'node:assert/strict';
import { validAccess } from '../lib/auth';
import { getDatabase, getClient } from '../lib/database';

test('access rejects forged Sites identity and requires configured credentials', () => {
  process.env.APP_AUTH_USER = 'owner';
  process.env.APP_AUTH_PASSWORD = 'test-password';
  const request = (value: string) => new Request('https://example.com', { headers: { authorization: 'Basic ' + Buffer.from(value).toString('base64') } });
  assert.equal(validAccess(new Request('https://example.com', { headers: { 'oai-authenticated-user-id': 'owner' } })), false);
  assert.equal(validAccess(request('owner:wrong')), false);
  assert.equal(validAccess(request('owner:test-password')), true);
  delete process.env.APP_AUTH_PASSWORD;
  assert.equal(validAccess(request('owner:test-password')), false);
  delete process.env.APP_AUTH_USER;
});

test('database preserves bindings, affected counts and atomic rollback', async () => {
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  const db = getDatabase();
  try {
    await db.prepare('CREATE TABLE sample (id TEXT PRIMARY KEY, payload TEXT)').run();
    const inserted = await db.prepare('INSERT INTO sample VALUES (?,?)').bind('one', 'safe\' value').run();
    assert.equal(inserted.meta.changes, 1);
    assert.equal((await db.prepare('SELECT payload FROM sample WHERE id=?').bind('one').first<{payload: string}>())?.payload, "safe' value");
    assert.equal(await db.prepare('SELECT * FROM sample WHERE id=?').bind('missing').first(), null);
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO sample VALUES (?,?)').bind('two', 'rollback'),
      db.prepare('INSERT INTO sample VALUES (?,?)').bind('one', 'duplicate'),
    ]));
    assert.equal((await db.prepare('SELECT * FROM sample').all()).results.length, 1);
  } finally { getClient().close(); delete process.env.TURSO_DATABASE_URL; }
});
