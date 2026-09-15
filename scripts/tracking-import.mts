import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { importTracking } from '../lib/tracking-service';
import { parseTrackingSheet } from '../lib/tracking-sheet';
const path=process.argv[2];
if(!path)throw Error('Informe o caminho da planilha.');
const buffer=await readFile(path);
const state=process.argv.includes('--dry-run')?{rows:await parseTrackingSheet(buffer)}:await importTracking(buffer,basename(path));
console.log(JSON.stringify({rows:state.rows.length,active:state.rows.filter(r=>!r.historical).length,issues:state.rows.filter(r=>r.issue).length,carriers:[...new Set(state.rows.map(r=>r.carrier))]},null,2));
