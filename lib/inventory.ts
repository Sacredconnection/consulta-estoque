import { formatStockMessage } from "./stock-message";
import { equivalenceSearchText, includeEquivalentProducts } from "./product-equivalences";
export const STORES = [
  { id: "sacred", name: "Sacred Snuff", short: "Sacred", host: "backend-wholesale.sacred-snuff.com", color: "#226b5b", initials: "SS" },
  { id: "maya", name: "Maya Herbs", short: "Maya", host: "backend-wholesale.mayaherbs.com", color: "#ac7330", initials: "MH" },
  { id: "sc23", name: "SC23 Trading", short: "SC23", host: "wholesale.sc23trading.com", color: "#5976b4", initials: "23" },
  { id: "pagnier", name: "Pagnier", short: "Pagnier", host: "reports.nomus.com.br", color: "#7955a3", initials: "PG" },
] as const;
export type StoreId = typeof STORES[number]["id"];
export type WooStoreId = Exclude<StoreId, "pagnier">;
export type Stock = { categories?:string[]; sourceChannel?:"wholesale"|"retail"|"combined"; quantityUnit?:string; location?:string; storeId: StoreId; id: number; quantity: number | null; status: string; updatedAt: string; shared?: boolean; parentId?:number; productName?:string; variationName?:string; grams?:number|null; packaging?:"can"|"bulk"|"other"|"shared" };
export type Product = { catalogVersion?:number; key: string; sku: string; name: string; category: string; stocks: Stock[] };
export type Rule = { minimum: number; target: number; enabled: boolean; interval: number };
export const DEFAULT_RULE: Rule = { minimum: 10, target: 40, enabled: true, interval: 30 };
const samples: [string,string,string,(number|null)[]][] = [
  ["RAP-TSU-10","Rapé Tsunu · 10 g","Rapés",[8,24,0]],
  ["RAP-HUN-10","Rapé Huni Kuin · 10 g","Rapés",[42,6,18]],
  ["RAP-CUM-10","Rapé Cumaru · 10 g","Rapés",[28,35,22]],
  ["HER-BLU-25","Blue Lotus · 25 g","Ervas",[0,7,32]],
  ["RES-COP-50","Copal branco · 50 g","Resinas",[64,48,36]],
  ["RAP-MUR-10","Rapé Murici · 10 g","Rapés",[17,26,14]],
  ["ACC-KUR-M","Kuripe de bambu","Acessórios",[9,0,12]],
  ["HER-MUG-50","Mugwort · 50 g","Ervas",[null,21,16]],
  ["RES-BRE-50","Breu branco · 50 g","Resinas",[32,19,27]],
  ["RAP-FOR-10","Rapé Força · 10 g","Rapés",[14,8,23]],
];
export const DEMO_PRODUCTS: Product[] = samples.map(([sku,name,category,counts],i)=>({
  key: sku,sku,name,category,stocks: STORES.filter(s=>s.id!=="pagnier").map((s,j)=>({storeId:s.id,id:100+i,quantity:counts[j]??null,status:counts[j]===0?"outofstock":"instock",updatedAt:"",}))
}));
export function normalize(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
export function searchProducts(products: Product[], query: string) {
  const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
  // A rapé family code must include its children even when the parent SKU exists.
  const familyQuery=terms.length===1&&/^ra[a-z]{2}\d{2}$/.test(terms[0]);
  const exact=terms.length===1&&!familyQuery?products.filter(p=>[p.sku,...equivalenceSearchText(p).split(' ')].some(code=>normalize(code.trim())===terms[0])):[];
  if(exact.length)return includeEquivalentProducts(products,exact);
  const matches=products.filter(p=>terms.every(t=>normalize(p.name+" "+p.sku+" "+p.category+" "+equivalenceSearchText(p)+" "+p.stocks.map(s=>(s.productName??"")+" "+(s.variationName??"")).join(" ")).includes(t)));
  return includeEquivalentProducts(products,matches);
}
export function stockLevel(stock: Stock, rule: Rule) {
  if(stock.quantity===null) return "unknown";
  if(stock.quantity<=0) return "out";
  if(stock.quantity<=rule.minimum) return "low";
  return "ok";
}
export function recommendations(products: Product[],rule: Rule) {
  return products.flatMap(product=>product.stocks.filter(s=>!s.shared && s.quantity!==null && s.quantity<=rule.minimum).map(stock=>({
    product,stock,quantity:Math.max(0,rule.target-Math.max(0,stock.quantity!)),
  }))).sort((a,b)=>a.stock.quantity!-b.stock.quantity!);
}
export function scopeProductsToStores(products:Product[],ids:readonly StoreId[]):Product[]{
 const allowed=new Set(ids);
 return products.map(p=>({...p,stocks:p.stocks.filter(s=>allowed.has(s.storeId))})).filter(p=>p.stocks.length>0);
}
function findAnswer(products: Product[],rule: Rule,message: string,storeIds:readonly StoreId[]=STORES.map(s=>s.id)) {
  const question=normalize(message);
  const store=STORES.find(s=>question.includes(normalize(s.short))||question.includes(normalize(s.name)));
  if(!storeIds.length)return {text:"Nenhuma loja possui integração configurada no ambiente local.",products:[],kind:"stock"};
  if(store&&!storeIds.includes(store.id))return {text:"Essa loja não possui integração configurada no ambiente local.",products:[],kind:"stock"};
  const scoped=scopeProductsToStores(products,store?storeIds.filter(id=>id===store.id):storeIds);
  if(/repor|reposicao|comprar|estoque baixo|baixos|acabando|zerados|esgotados|sem estoque/.test(question)){
    const rec=recommendations(scoped,rule).filter(r=>!/zerados|esgotados|sem estoque/.test(question)||r.stock.quantity!<=0);
    return {text:rec.length?`Encontrei ${rec.length} posições de estoque que precisam de atenção. A sugestão completa até ${rule.target} unidades por loja, com mínimo de ${rule.minimum}. Não considera previsão de vendas nem pedidos em trânsito.`:"Nenhuma posição com estoque conhecido atende a esse filtro.", products:Array.from(new Map(rec.map(r=>[r.product.key,r.product])).values()), kind:"replenishment"};
  }
  const ignored=new Set("veja para mim o a os as de do da dos das um uma produto produtos estoque estoques qual quanto quantos quantidade tem tenho unidades em cada site sites loja lojas no na nos nas por favor me mostre consultar consulta disponivel disponiveis disponibilidade granel atacado lata latas kg quilos somados total todas todos e esta desse daquele desse daquele preciso saber voce pode ver".split(" "));
  const words=question.replace(/[^a-z0-9-\s]/g," ").split(/\s+/).filter(w=>w&&!ignored.has(w)&&!STORES.some(s=>normalize(s.name).split(" ").includes(w)||normalize(s.short)===w));
  const matches=words.length?searchProducts(scoped,words.join(" ")):[];
  return {text:matches.length?`Encontrei ${matches.length} produto(s). Abaixo está o último estoque registrado em cada loja. “—” significa produto não encontrado; “N/D”, quantidade não controlada.`:"Não encontrei uma correspondência. Tente o nome do produto ou o SKU, por exemplo: “estoque de Tsunu” ou “RAP-TSU-10”. Também posso listar estoques baixos e sugerir reposição.",products:matches,kind:"stock"};
}

export function agentAnswer(products:Product[],rule:Rule,message:string,storeIds:readonly StoreId[]=STORES.map(s=>s.id)) {
 const answer=findAnswer(products,rule,message,storeIds);
 if(!answer.products.length)return answer;
 const question=normalize(message),store=STORES.find(s=>question.includes(normalize(s.short))||question.includes(normalize(s.name)));
 const selected=store?[store.id]:storeIds;
 return {...answer,text:(answer.kind==="replenishment"?answer.text+"\n\n":"")+formatStockMessage(answer.products,selected,answer.kind==="replenishment"?rule:undefined)};
}
