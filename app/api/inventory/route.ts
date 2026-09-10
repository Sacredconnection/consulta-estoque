import {refreshCategoryTrees} from '@/lib/category-tree-cache';
import {authorize,state,json,fail} from "@/lib/server";
export async function GET(request:Request){try{authorize(request);await refreshCategoryTrees();return json(await state());}catch(e){return fail(e);}}

export const maxDuration=60;
