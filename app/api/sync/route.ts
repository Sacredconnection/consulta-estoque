import {authorize,json,fail,synchronize} from "@/lib/server";
export async function POST(request:Request){try{
 authorize(request,true);const results=await synchronize();const successes=results.filter(r=>r.ok).length;
 return json({results,message:successes+" de "+results.length+" loja(s) atualizada(s)."+(successes<results.length?" Confira os erros em Conexões. O último estoque válido foi preservado.":"")},successes?200:502);
}catch(e){return fail(e);}}
