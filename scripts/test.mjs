import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir("work",{recursive:true});
await build({entryPoints:["scripts/core.test.ts", "scripts/platform.test.ts", "scripts/pagnier.test.ts"],outdir:"work",bundle:true,platform:"node",format:"esm",packages:"external",outExtension:{".js":".mjs"}});
const result=spawnSync(process.execPath,["--test","work/core.test.mjs","work/platform.test.mjs","work/pagnier.test.mjs"],{stdio:"inherit"});
process.exitCode=result.status??1;
