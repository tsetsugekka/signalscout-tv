import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir,rm} from 'node:fs/promises';
await mkdir('work/tests',{recursive:true});
await build({entryPoints:['tests/catalog.test.ts','tests/player.test.ts','tests/relay.test.ts','tests/shared-health.test.ts'],bundle:true,platform:'node',format:'esm',outdir:'work/tests',outExtension:{'.js':'.mjs'}});
const result=spawnSync(process.execPath,['--test','work/tests/catalog.test.mjs','work/tests/player.test.mjs','work/tests/relay.test.mjs','work/tests/shared-health.test.mjs'],{stdio:'inherit'});
await rm('work/tests',{recursive:true,force:true});
process.exit(result.status??1);
