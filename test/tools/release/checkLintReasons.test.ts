import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {it,expect} from 'vitest';
// @ts-expect-error Node release script has no declaration file.
import {findMissingLintReasons} from '../../../tools/release/checkLintReasons.mjs';
// Directive text is assembled so the fixtures are not read as real lint directives.
const directive=(kind:string)=>`oxlint-${kind}`;
it('requires a reason on every disable comment and every rule turned off in the config',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lint-reasons-'));
 try{
  fs.mkdirSync(path.join(root,'src'));
  fs.writeFileSync(path.join(root,'src/ok.ts'),`// ${directive('disable-next-line')} eslint/no-await-in-loop -- Runs in order.\n/* ${directive('disable')} react/refs -- Stable listeners. */\n/* ${directive('enable')} react/refs */\n`);
  fs.writeFileSync(path.join(root,'.oxlintrc.json'),'{ "rules": { "react/refs": "off" // Stable listeners.\n } }\n');
  expect(findMissingLintReasons(root)).toEqual([]);
  fs.writeFileSync(path.join(root,'src/bad.ts'),`x();\n// ${directive('disable-next-line')} eslint/no-await-in-loop\n`);
  fs.writeFileSync(path.join(root,'.oxlintrc.json'),'{ "rules": {\n "react/refs": "off"\n } }\n');
  expect(findMissingLintReasons(root)).toEqual(['src/bad.ts:2','.oxlintrc.json:2']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
