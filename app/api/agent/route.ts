import {authorize,json,fail,body} from "@/lib/server";
import {queryStock} from "@/lib/query-service";
export async function POST(request:Request){try{
 authorize(request,true);return json(await queryStock((await body(request)).message));
}catch(e){return fail(e);}}
