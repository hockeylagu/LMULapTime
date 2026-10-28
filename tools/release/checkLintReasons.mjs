import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Every lint opt-out must say why: disable comments end with "-- reason" and each "off" in .oxlintrc.json carries a trailing comment.
/** @param {string} root @returns {string[]} */
export function findMissingLintReasons(root) {
  /** @type {string[]} */
  const missing=[];
  /** @type {(dir: string) => string[]} */
  const walk=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='node_modules'?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]):[];
  for(const dir of ['src','server','shared','test','tools'])for(const file of walk(path.join(root,dir))) {
    if(!/\.(?:ts|tsx|mjs|js)$/.test(file))continue;
    fs.readFileSync(file,'utf8').split('\n').forEach((line,i)=>{
      if(/(?:eslint|oxlint)-disable/.test(line)&&!/(?:eslint|oxlint)-disable[\w-]*\s+\S.*?\s--\s+\S/.test(line))missing.push(path.relative(root,file).split(path.sep).join('/')+':'+(i+1));
    });
  }
  const config=path.join(root,'.oxlintrc.json');
  if(fs.existsSync(config))fs.readFileSync(config,'utf8').split('\n').forEach((line,i)=>{
    if(/"off"/.test(line)&&!/"off"\s*,?\s*\/\/\s*\S/.test(line))missing.push('.oxlintrc.json:'+(i+1));
  });
  return missing;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const missing=findMissingLintReasons(path.resolve(import.meta.dirname,'../..'));
  if(missing.length){console.error('Lint opt-outs without a reason:\n'+missing.join('\n'));process.exit(1);}
}
