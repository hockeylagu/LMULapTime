import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {it,expect} from 'vitest';
import {checkLocalData} from '../../../tools/release/checkLocalData.mjs';
it('allows bundled basic layouts and rejects seeded detailed assets in inputs and output',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'local-data-guard-'));
 try{
  fs.mkdirSync(path.join(root,'public/track-outlines'),{recursive:true});fs.writeFileSync(path.join(root,'public/track-outlines/test.svg'),'<svg/>');expect(()=>checkLocalData(root,true)).not.toThrow();
  fs.mkdirSync(path.join(root,'public/tracks'));expect(()=>checkLocalData(root)).toThrow('Detailed data');fs.rmdirSync(path.join(root,'public/tracks'));
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist/leak.json'),JSON.stringify({surfaceProfile:{bankDeg:[3]}}));expect(()=>checkLocalData(root,true)).toThrow('Detailed data');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
it('rejects binary scenes and v2 scene manifests from release inputs', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-data-guard-'));
 try {
  fs.mkdirSync(path.join(root,'public'),{recursive:true}); fs.writeFileSync(path.join(root,'public/track.glb'),Buffer.alloc(4));
  expect(()=>checkLocalData(root)).toThrow('3D scene data'); fs.unlinkSync(path.join(root,'public/track.glb'));
  fs.mkdirSync(path.join(root,'src'),{recursive:true}); fs.writeFileSync(path.join(root,'src/package.json'),JSON.stringify({schemaVersion:2,scenes:{catalog:'scenes/index.json'}}));
  expect(()=>checkLocalData(root)).toThrow('Local package');
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
