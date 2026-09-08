import {authorize,json,fail,body,ApiError,database} from "@/lib/server";
export async function PUT(request:Request){try{
 authorize(request,true);const r=await body(request);
 if(!Number.isInteger(r.minimum)||r.minimum<0||r.minimum>99999||!Number.isInteger(r.target)||r.target<=r.minimum||r.target>100000||typeof r.enabled!=="boolean"||![5,15,30,60].includes(r.interval))throw new ApiError(400,"Informe mínimo válido, estoque desejado maior que o mínimo e intervalo de 5, 15, 30 ou 60 minutos.");
 const rule={minimum:r.minimum,target:r.target,enabled:r.enabled,interval:r.interval};
 await database().prepare("INSERT INTO settings (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind("rule",JSON.stringify(rule)).run();
 return json({rule});
}catch(e){return fail(e);}}
