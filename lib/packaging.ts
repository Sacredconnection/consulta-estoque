import type { WooProduct } from "./woo";
import type { Stock } from "./inventory";

export function netGrams(text:string):number|null {
 // A single explicit net mass only. Do not infer from SKU or shipping weight.
 const matches=[...text.toLowerCase().matchAll(/(?:^|[\s(·/])(\d+(?:[.,]\d+)?)\s*(kilograms?|kilogramas?|kgs?|grams?|gramas?|grs?|g)(?=$|[\s)/·])/g)];
 if(matches.length!==1||/\d\s*[x×]|\b(pack|kit|set|caixa)\b/i.test(text))return null;
 const amount=Number(matches[0][1].replace(",","."))*(matches[0][2].startsWith("k")?1000:1);
 return Number.isFinite(amount)&&amount>0?amount:null;
}
export function packaging(p:WooProduct,parent?:WooProduct):Pick<Stock,"grams"|"packaging"> {
 const attributes=p.attributes??[];
 const explicit=attributes.filter(a=>/weight|peso|weight-size|net.?mass/i.test((a.name??"")+" "+(a.slug??"")));
 const options=(explicit.length?explicit:attributes.filter(a=>a.option&&netGrams(a.option)!==null))
  .flatMap(a=>a.option?[a.option]:!parent&&a.options?.length===1?a.options:[]);
 const masses=options.map(netGrams).filter((g):g is number=>g!==null);
 const grams=options.length?(masses.length===1?masses[0]:null):netGrams(p.name??"");
 return {grams,packaging:grams===null?"other":[5,10,20,50].includes(grams)?"can":"bulk"};
}
