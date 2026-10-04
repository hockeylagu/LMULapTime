import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {it,expect} from 'vitest';
// @ts-expect-error Node release script has no declaration file.
import {checkLocalData} from '../../../tools/release/checkLocalData.mjs';
it('allows bundled basic layouts and rejects seeded detailed assets in inputs and output',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'local-data-guard-'));
 try{
  fs.mkdirSync(path.join(root,'public/track-outlines'),{recursive:true});fs.writeFileSync(path.join(root,'public/track-outlines/test.svg'),'<svg/>');expect(()=>checkLocalData(root,true)).not.toThrow();
  fs.mkdirSync(path.join(root,'public/tracks'));expect(()=>checkLocalData(root)).toThrow('Detailed data');fs.rmdirSync(path.join(root,'public/tracks'));
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist/leak.json'),JSON.stringify({surfaceProfile:{bankDeg:[3]}}));expect(()=>checkLocalData(root,true)).toThrow('Detailed data');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
