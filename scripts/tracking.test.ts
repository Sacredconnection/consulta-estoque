import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {parseTrackingSheet,codes,cellText} from '../lib/tracking-sheet';
import {statusLabel,track} from '../lib/tracking-carriers';
test('extracts several AWBs, preserves leading zeros and does not guess a numeric carrier',()=>{
 assert.deepEqual(codes('DHL - 0012345678 | 1234567890'),[{carrier:'DHL',tracking:'0012345678'},{carrier:'DHL',tracking:'1234567890'}]);
 assert.equal(codes('123456789012')[0].carrier,'Não identificada');
 assert.equal(codes('UPS - 1ZA1030K0330380839')[0].carrier,'UPS');
 assert.equal(cellText({richText:[{text:'Canal '},{text:'Vermelho'}]}),'Canal Vermelho');
});
test('finds shifted columns, keeps missing tracking and never uses sheet status as carrier result',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('Setembro 2026');
 s.addRow(['Título']);s.addRow(['N° ped - Data','Descrição','Cliente','Trasportadora - AWB','Data da Coleta','Status']);
 s.addRow(['001','Produto','Cliente','DHL - 0012345678',new Date('2026-09-10'),'Entregue']);
 s.addRow(['002','Produto','Outro','',new Date('2026-09-10'),'Em trânsito']);
 const rows=await parseTrackingSheet(Buffer.from(await w.xlsx.writeBuffer()),Date.parse('2026-09-15'));
 assert.equal(rows.length,2);assert.equal(rows[0].tracking,'0012345678');assert.equal(rows[0].historical,false);
 assert.equal('result' in rows[0],false);assert.ok(rows[1].issue);
});
test('does not infer delivery from an unknown carrier code',()=>{assert.equal(statusLabel('DL'),'Entregue');assert.equal(statusLabel('unknown'),'Em acompanhamento');});
test('DHL validates the returned tracking, preserves missing ETA and reports rate limits',async()=>{
 const originalFetch=globalThis.fetch,originalKey=process.env.DHL_TRACKING_API_KEY;
 process.env.DHL_TRACKING_API_KEY='test-only';
 try{
  globalThis.fetch=async()=>Response.json({shipments:[{id:'0012345678',status:{statusCode:'transit',description:'In transit'}}]});
  const result=await track('DHL','0012345678');assert.equal(result.status,'Em trânsito');assert.equal(result.expectedDelivery,null);
  await assert.rejects(()=>track('DHL','9999999999'),/não encontrou/);
  globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(()=>track('DHL','0012345678'),/Limite/);
 }finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.DHL_TRACKING_API_KEY;else process.env.DHL_TRACKING_API_KEY=originalKey;}
});
