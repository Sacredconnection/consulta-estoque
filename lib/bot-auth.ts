export async function secretEquals(a:string,b:string){
 const digest=(s:string)=>crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
 const [aa,bb]=await Promise.all([digest(a),digest(b)]);
 const x=new Uint8Array(aa),y=new Uint8Array(bb);let difference=0;
 for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
 return difference===0;
}
export async function hasBearer(request:Request,expected?:string){
 const match=request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/);
 return !!expected&&expected.length>=32&&!!match&&await secretEquals(expected,match[1]);
}
