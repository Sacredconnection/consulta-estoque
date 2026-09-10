import {authorize,json,fail,body} from "@/lib/server";
import {queryStock} from "@/lib/query-service";
export async function POST(request:Request){try{
 authorize(request,true);const input=await body(request);
 return json(await queryStock(input.message,input.storeIds,input.category));
}catch(e){return fail(e);}}
