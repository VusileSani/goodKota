import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../",import.meta.url);
const output = new URL("../public/",import.meta.url);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for (const name of ["index.html","manifest.webmanifest","service-worker.js","assets","css","js"]) {
  await cp(new URL(name,root),new URL(name,output),{recursive:true});
}
const entries = await readdir(output);
if (entries.length !== 6) throw new Error("Hosting build is incomplete.");
process.stdout.write("Static Hosting assets prepared.\n");
