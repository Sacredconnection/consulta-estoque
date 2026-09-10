import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
await mkdir("work",{recursive:true});
const suites=["core","platform","pagnier","cache","whatsapp","replenishment","sacred","category-export","category-tree"];
for(const suite of suites){
 await build({entryPoints:["scripts/"+suite+".test.ts"],outfile:"work/"+suite+".test.mjs",bundle:true,platform:"node",format:"esm",packages:"external",plugins:suite==="whatsapp"?[{name:"test-database",setup(build){build.onResolve({filter:/database$/},args=>resolve(args.resolveDir,args.path)+".ts"===resolve("lib/database.ts")?{path:resolve("scripts/test-database.ts")}:undefined);}}]:[]});
}
const result=spawnSync(process.execPath,["--test",...suites.map(s=>"work/"+s+".test.mjs"),"scripts/relay.test.mjs"],{stdio:"inherit"});
process.exitCode=result.status??1;
