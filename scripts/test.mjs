import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir("work",{recursive:true});
await build({entryPoints:["scripts/core.test.ts"],outfile:"work/core.test.mjs",bundle:true,platform:"node",format:"esm"});
const result=spawnSync(process.execPath,["--test","work/core.test.mjs"],{stdio:"inherit"});
process.exitCode=result.status??1;
