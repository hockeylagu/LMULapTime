import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function checkLocalData(root, built=false) {
  const forbidden=['public/tracks','public/tracks-display','shared/domain/vehicleCatalog.ts','test/utils/lapAlignment/__snapshots__/lapAlignmentGolden.test.ts.snap',...(built?['dist/tracks','dist/tracks-display']:[])];
  for(const relative of forbidden)if(fs.existsSync(path.join(root,relative)))throw Error('Detailed data must stay local: '+relative);
  const replayFixtures=path.join(root,'test/fixtures/replays');
  if(fs.existsSync(replayFixtures)&&fs.readdirSync(replayFixtures).some(file=>file.endsWith('.json')))throw Error('Captured replay data must stay local');
  const walk=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]):[];
  for(const file of [...walk(path.join(root,'public')), ...(built?walk(path.join(root,'dist')):[])]) {
    if(!file.endsWith('.json'))continue;
    const text=fs.readFileSync(file,'utf8');
    if(/"(?:centerline|surfaceProfile|outlineXZ|replayOriginOffsetXZ|vehicleIds|geometryRevision|sourceRevision)"\s*:/.test(text))throw Error('Detailed data in static assets: '+path.relative(root,file));
  }
  // A local package must never become a tracked manifest or generated catalog.
  for(const dir of ['src','server','shared','public','test'])for(const file of walk(path.join(root,dir))) {
    if(!file.endsWith('.json'))continue;
    const text=fs.readFileSync(file,'utf8');
    if(/"coordinates"\s*:\s*"local-xz-metres-forward-minus-z"/.test(text)||(/"schemaVersion"\s*:\s*1/.test(text)&&/"(?:tracks|vehicles)"\s*:\s*\{\s*"catalog"/.test(text)))throw Error('Local package in release inputs: '+path.relative(root,file));
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {checkLocalData(path.resolve(import.meta.dirname,'../..'),process.argv.includes('--built'));console.log('Local data guard passed; bundled basic SVG layouts are allowed.');}
