// WhatsApp uses *bold* instead of Markdown **bold**, with no heading syntax.
export function whatsappText(markdown:string){
 return markdown.split("\n").map(line=>line.replace(/^#{2,3} (.+)$/,"*$1*").replace(/\*\*([^*]+)\*\*/g,"*$1*")).join("\n");
}
export function whatsappMessages(markdown:string,limit=3500):string[]{
 if(!Number.isSafeInteger(limit)||limit<100||limit>4000)throw Error("Limite de mensagem inválido.");
 const text=whatsappText(markdown),chunks:string[]=[];let current="";
 for(const original of text.split("\n")){
  // Split by Unicode code points; keep short paragraphs/lines together.
  let rest=original;
  while(rest.length>limit){
   if(current){chunks.push(current.trim());current="";}
   let cut=limit;if(/[\uD800-\uDBFF]/.test(rest[cut-1]))cut--;
   chunks.push(rest.slice(0,cut));rest=rest.slice(cut);
  }
  const line=rest;
  if((current+(current?"\n":"")+line).length>limit){chunks.push(current.trim());current=line;}
  else current+=(current?"\n":"")+line;
 }
 if(current.trim())chunks.push(current.trim());
 if(chunks.length<=1)return chunks;
 return chunks.map((chunk,i)=>"("+String(i+1)+"/"+String(chunks.length)+")\n"+chunk);
}
