import {readFile} from 'node:fs/promises';
import {createClient} from '@libsql/client';
const data=JSON.parse(await readFile('work/sacred-minimums.json','utf8'));
if(data.storeId!=='sacred'||!data.items?.length||new Set(data.items.map(r=>r.sku)).size!==data.items.length||data.items.some(r=>!r.sku||!Number.isSafeInteger(r.minimum)||r.minimum<0))throw Error('Invalid Sacred import');
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{await db.execute({sql:'INSERT INTO settings (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',args:['sacred_minimums',JSON.stringify({...data,importedAt:new Date().toISOString()})]});console.log('Sacred minima saved:',data.items.length);}finally{db.close();}
