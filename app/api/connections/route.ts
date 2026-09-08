import {authorize,json,fail,body,ApiError,database,seal,configuredEnvironmentConnections} from "@/lib/server";
import {STORES} from "@/lib/inventory";
import {wooPage} from "@/lib/woo";
export async function POST(request:Request){try{
 authorize(request,true);const input=await body(request);
 const store=STORES.find(s=>s.id===input.storeId);if(!store)throw new ApiError(400,"Loja inválida.");
 if(configuredEnvironmentConnections().some(c=>c.id===store.id))throw new ApiError(409,"Esta conexão usa as credenciais do ambiente. Atualize o .env.local e os segredos da hospedagem.");
 if(typeof input.key!=="string"||typeof input.secret!=="string"||!/^ck_[a-f0-9]{40}$/i.test(input.key.trim())||!/^cs_[a-f0-9]{40}$/i.test(input.secret.trim()))throw new ApiError(400,"Informe Consumer key e Consumer secret válidos, começando com ck_ e cs_.");
 const credentials={key:input.key.trim(),secret:input.secret.trim()};
 // Check encryption availability before sending an external request.
 const ciphertext=await seal(store.id,credentials);
 await wooPage(store.id,credentials,"products",{per_page:"1",_fields:"id"});
 const result=await database().prepare("INSERT INTO connections (id,credentials) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET credentials=excluded.credentials,error=NULL WHERE connections.lock_until < ?").bind(store.id,ciphertext,Date.now()).run();
 if(!result.meta.changes)throw new ApiError(409,"Aguarde a sincronização terminar antes de trocar as chaves.");
 return json({connected:true,storeId:store.id});
}catch(e){return fail(e);}}
