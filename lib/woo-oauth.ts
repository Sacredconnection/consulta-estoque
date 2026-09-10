const encode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());

// WordPress may see HTTP behind an HTTPS reverse proxy. Only the signature
// base changes for that case; the actual request always stays on HTTPS.
export async function signedWooUrl(url:URL,credentials:{key:string;secret:string},scheme:'https:'|'http:'='https:',nonce=crypto.randomUUID().replaceAll('-',''),timestamp=String(Math.floor(Date.now()/1000))){
 if(url.protocol!=='https:')throw Error('OAuth transport requires HTTPS');
 const signed=new URL(url);
 for(const [key,value] of Object.entries({oauth_consumer_key:credentials.key,oauth_nonce:nonce,oauth_timestamp:timestamp,oauth_signature_method:'HMAC-SHA256'}))signed.searchParams.set(key,value);
 const pairs=[...signed.searchParams].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>encode(k)+'='+encode(v)).join('&');
 const base=new URL(url);base.search='';base.hash='';base.protocol=scheme;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(credentials.secret+'&'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('GET&'+encode(base.href)+'&'+encode(pairs)));
 signed.searchParams.set('oauth_signature',btoa(String.fromCharCode(...new Uint8Array(signature))));
 return signed;
}
