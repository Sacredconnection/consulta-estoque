import {authorize,state,json,fail} from "@/lib/server";
export async function GET(request:Request){try{authorize(request);return json(await state());}catch(e){return fail(e);}}
