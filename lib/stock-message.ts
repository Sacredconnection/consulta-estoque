import { STORES, type Product, type StoreId, type Rule } from "./inventory";

const number=(n:number)=>n.toLocaleString("pt-BR",{maximumFractionDigits:6});
const safe=(s:string)=>s.replace(/[*_~`#<>\[\]\\]/g,"").replace(/\s+/g," ").trim();
export function formatStockMessage(products:Product[],storeIds:readonly StoreId[],rule?:Rule){
 const lines:string[]=[];
 let allKg=0,allBulk=0,allExcluded=0;
 for(const store of STORES.filter(s=>storeIds.includes(s.id))){
  lines.push("## "+store.name);
  const groups=new Map<string,{name:string;rows:{product:Product;stock:Product["stocks"][number]}[]}>();
  for(const product of products)for(const stock of product.stocks.filter(s=>s.storeId===store.id)){
   const key=String(stock.parentId??stock.id);
   if(!groups.has(key))groups.set(key,{name:stock.productName??product.name,rows:[]});
   groups.get(key)!.rows.push({product,stock});
  }
  if(!groups.size){lines.push("Produto não encontrado no catálogo disponível desta loja.","");continue;}
  let storeKg=0,storeBulk=0,storeExcluded=0;
  for(const group of groups.values()){
   lines.push("### "+safe(group.name));
   let productKg=0,productBulk=0,productExcluded=0;
   for(const [kind,title] of [["can","Latas · 5, 10, 20 e 50 g"],["bulk","Granel (atacado)"],["other","Outras apresentações / peso não identificado"],["shared","Estoque compartilhado"]] as const){
    const rows=group.rows.filter(r=>(r.stock.shared||r.stock.packaging==="shared"?"shared":r.stock.packaging??"other")===kind)
     .sort((a,b)=>(a.stock.grams??Infinity)-(b.stock.grams??Infinity));
    if(!rows.length)continue;
    lines.push("**"+title+"**");
    for(const {product,stock} of rows){
     const q=stock.quantity,grams=stock.grams;
     const label=safe(stock.variationName||(grams?number(grams)+" g":product.sku||"Unidade"));
     let entry="- "+label+": **"+(q===null?"quantidade não informada":number(q)+" un.")+"**";
     if(stock.shared)entry+=" · saldo do produto pai; não somado";
     else if(kind==="shared")entry+=" · saldo único, sem distribuição entre variações";
     if(kind==="bulk"){
      productBulk++;
      if(q!==null&&grams!=null){const kg=Math.max(0,q)*grams/1000;productKg+=kg;entry+=" × "+number(grams/1000)+" kg = **"+number(kg)+" kg**";}
      else {productExcluded++;entry+=" · kg não calculável";}
     }
     if(q!==null&&q<=0)entry+=" · esgotado";
     if(rule&&q!==null&&!stock.shared&&kind!=="shared"&&q<=rule.minimum)entry+=" · reposição sugerida: "+number(Math.max(0,rule.target-Math.max(0,q)))+" un.";
     lines.push(entry);
    }
    lines.push("");
   }
   if(productBulk)lines.push("**Total de granel deste produto: "+(productExcluded===productBulk?"não calculável":number(productKg)+" kg")+(productExcluded&&productExcluded<productBulk?" (parcial)":"")+"**","");
   storeKg+=productKg;storeBulk+=productBulk;storeExcluded+=productExcluded;
  }
  if(storeBulk)lines.push("**Total de granel · "+store.name+": "+(storeExcluded===storeBulk?"não calculável":number(storeKg)+" kg")+(storeExcluded&&storeExcluded<storeBulk?" (parcial)":"")+"**","");
  allKg+=storeKg;allBulk+=storeBulk;allExcluded+=storeExcluded;
 }
 if(storeIds.length>1&&allBulk)lines.push("## Total de granel entre as lojas",allExcluded===allBulk?"Não calculável com os saldos disponíveis.":"**"+number(allKg)+" kg"+(allExcluded?" (parcial)":"")+"**","");
 if(products.some(p=>p.stocks.some(s=>s.packaging==="other")))lines.push("Apresentações sem peso identificado ficam fora do total em kg.");
 if(allExcluded)lines.push("O total parcial inclui somente variações com quantidade e peso conhecidos.");
 if(products.some(p=>p.stocks.some(s=>s.shared||s.packaging==="shared")))lines.push("Saldos compartilhados não entram no total em kg, pois a distribuição por peso não é informada.");
 lines.push("Latas ficam separadas e não entram no total de granel. Quantidade não informada não significa estoque zero.");
 return lines.join("\n").trim();
}
