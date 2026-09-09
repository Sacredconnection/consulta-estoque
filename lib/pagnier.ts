import { createHash } from 'node:crypto';
import { CATALOG_VERSION } from './catalog-policy';
import { packaging } from './packaging';
import { IntegrationError } from './woo';
import type { Product } from './inventory';
import type { CatalogCursor } from './sync-cursor';

const VIEW='751489003726808170';
const ENDPOINT='https://reports.nomus.com.br/ZDBTableDataAction.ma';
const PAGE_SIZE=200;
export type PagnierCursor={columns:{id:string;name:string}[];ddl:string;total:number;next:number};
type Report={colHead?:unknown[][];new_grid?:unknown[];navigInfo?:number[];dataText?:unknown[][];grid_param?:{dataColOrder?:string[]}};
const required=['Código do produto','Revisão do produto','Descrição do produto','Unidade de medida abreviatura','Código da empresa','Nome da empresa','Código do setor de estoque','Nome do setor de estoque','Setor de estoque ativo?','Setor de estoque considera saldo disponível?','Saldo em estoque do produto no setor','Tipo de produto','Grupo de produto','Família de produto','Produto ativo?','Peso líquido unitário (kg)'];
const invalid=()=>new IntegrationError('O relatório Pagnier mudou de formato ou retornou dados incompletos. O catálogo anterior foi preservado.');

async function requestReport(query:URLSearchParams,body:string,xml:boolean,request:typeof fetch):Promise<Report>{
 let response:Response;
 try {response=await request(ENDPOINT+'?'+query,{method:'POST',headers:{'Content-Type':xml?'text/xml':'application/x-www-form-urlencoded'},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw new IntegrationError('O relatório Pagnier não respondeu. Tente atualizar novamente.');}
 if(!response.ok)throw new IntegrationError('O relatório Pagnier recusou a leitura (HTTP '+response.status+').');
 let data:Report;try{data=await response.json();}catch{throw invalid();}
 if(!data||!Array.isArray(data.dataText)||!Array.isArray(data.navigInfo))throw invalid();
 return data;
}

export function parsePagnierRows(rows:unknown[][],columns:PagnierCursor['columns'],at:string):Product[]{
 const indexes=new Map(columns.map((c,i)=>[c.name,i]));
 if(required.some(name=>!indexes.has(name)))throw invalid();
 const products:Product[]=[];
 for(const row of rows){
  const cell=(name:string):string|null=>{const value=row[indexes.get(name)!];if(!Array.isArray(value))throw invalid();return value[0]===null?null:String(value[0]);};
  const decimal=(name:string):number|null=>{const raw=cell(name);if(raw===null||raw.trim()==='')return null;const n=Number(raw);if(!Number.isFinite(n))throw invalid();return n;};
  if(cell('Produto ativo?')!=='Sim'||cell('Setor de estoque ativo?')!=='Sim'||cell('Setor de estoque considera saldo disponível?')!=='Sim')continue;
  const sku=cell('Código do produto')?.trim(),name=cell('Descrição do produto')?.trim();
  if(!sku||!name)throw invalid();
  const identity=[sku,cell('Revisão do produto'),cell('Código da empresa'),cell('Código do setor de estoque')].join('|');
  const id=Number.parseInt(createHash('sha256').update(identity).digest('hex').slice(0,12),16);
  const unit=cell('Unidade de medida abreviatura')?.trim().toUpperCase();
  const quantity=decimal('Saldo em estoque do produto no setor');
  const type=cell('Tipo de produto')??'';
  const packed=packaging({id,name});
  const net=decimal('Peso líquido unitário (kg)');
  const grams=unit==='KG'?1000:unit==='G'||unit==='GR'?1:unit==='UNID'||unit==='UN'?(/embalagem/i.test(type)?null:net!==null&&net>0?net*1000:(packed.grams??null)):null;
  const kind=unit==='KG'||unit==='G'||unit==='GR'?'bulk':grams===null?'other':[5,10,20,50].some(g=>Math.abs(g-grams)<1e-6)?'can':'bulk';
  const location=[cell('Nome da empresa'),cell('Nome do setor de estoque')].filter(Boolean).join(' · ');
  products.push({catalogVersion:CATALOG_VERSION,key:'pagnier:'+identity,sku,name,category:[type,cell('Grupo de produto'),cell('Família de produto')].filter(Boolean).join(', '),stocks:[{storeId:'pagnier',id,parentId:id,productName:name,variationName:unit==='KG'?'Granel (kg)':grams!==null?grams+' g':unit??'Unidade',quantity,quantityUnit:unit==='KG'?'kg':unit==='G'||unit==='GR'?'g':unit==='UN'||unit==='UNID'?'un.':unit??'unidade não informada',location,grams,packaging:kind,status:quantity===null?'unknown':quantity<=0?'outofstock':'instock',updatedAt:at}]});
 }
 return products;
}

export async function advancePagnier(previous:CatalogCursor,request:typeof fetch=fetch){
 const cursor=structuredClone(previous);
 if(!cursor.pagnier){
  const first=await requestReport(new URLSearchParams({SUBREQUEST:'XMLHTTP',_ZVER_:'101'}),'OBJID='+VIEW+'&ZDBACTION=DATAVIEW',false,request);
  const columns=first.colHead?.map(c=>({id:String(c[0]),name:String(c[2])}));
  const total=first.navigInfo![2],ddl=String(first.new_grid?.[5]??'');
  if(!columns?.length||columns.some(c=>!/^\d+$/.test(c.id))||!/^\d+$/.test(ddl)||!Number.isSafeInteger(total)||total<0||total>50000)throw invalid();
  cursor.pagnier={columns,ddl,total,next:1};
 }
 const state=cursor.pagnier;
 const sortNames=['Código do produto','Revisão do produto','Código da empresa','Código do setor de estoque'];
 const ids=state.columns.map(c=>c.id).join(';');
 const indexes=state.columns.map(c=>sortNames.indexOf(c.name));
 const query=new URLSearchParams({ZDBACTION:'DATAVIEW',CONFIGASXML:'true',GRIDID:'0',OBJTYPE:'Table',OBJID:VIEW,DDLTIME:state.ddl,CHANGESLIDERBOUNDS:'false',EXCLUDEHEADER:'true',SUBREQUEST:'XMLHTTP',_ZVER_:'101'});
 const body=`<DBSVRequest><DBSVParams RECORDSTART='${state.next}' FETCHSIZE='${PAGE_SIZE}' REFRESHDATAONLY='true' FETCHTOTALCOUNT='true' TOTALRECORDS='${state.total}' ALLSUMCOUNT='0' SUMRECADJ='0' COLID='${ids}' SORTORDER='${indexes.map(i=>i<0?0:1).join(';')}' SORTINDEX='${indexes.join(';')}' GROUPED='${state.columns.map(()=>false).join(';')}' SECTION='${state.columns.map(()=>false).join(';')}' UPDATECONFIG='${VIEW}'></DBSVParams></DBSVRequest>`;
 const data=await requestReport(query,body,true,request);
 if(data.navigInfo![0]!==state.next||data.navigInfo![2]!==state.total||data.dataText!.length!==Math.min(PAGE_SIZE,Math.max(0,state.total-state.next+1))||data.grid_param?.dataColOrder?.join(';')!==ids)throw invalid();
 const records=parsePagnierRows(data.dataText!,state.columns,new Date().toISOString());
 state.next+=data.dataText!.length;
 cursor.productsSeen=cursor.productsDone=state.next-1;cursor.totalProducts=state.total;cursor.records+=records.length;
 cursor.catalogDone=state.next>state.total;cursor.page++;
 return {cursor,records,done:cursor.catalogDone};
}
