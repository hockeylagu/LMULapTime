import fs from 'node:fs';
import {expect, it} from 'vitest';
import {validateSceneGlb} from '../../../server/plugins/sceneGlb.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../../fixtures/scenes/meshopt-glb.json', import.meta.url), 'utf8')) as {glb: string; meshopt: string};
const bytes = Buffer.from(fixture.meshopt, 'base64');

function changed(patch: (json: Record<string, unknown>) => void): Buffer {
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.toString('utf8', 20, 20 + length)) as Record<string, unknown>;
  patch(json);
  const text = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(padded);
  const header = Buffer.from(bytes.subarray(0, 20)), tail = bytes.subarray(20 + length);
  header.writeUInt32LE(20 + padded.length + tail.length, 8); header.writeUInt32LE(padded.length, 12);
  return Buffer.concat([header, padded, tail]);
}

it('validates standard Meshopt GLBs with the same coordinate, triangle and decoded budgets', () => {
  expect(validateSceneGlb(bytes)).toEqual(validateSceneGlb(Buffer.from(fixture.glb, 'base64')));
});

it('rejects unknown extensions, external resources and decoded allocation bombs', () => {
  expect(() => validateSceneGlb(changed(json => {json.extensionsRequired = ['unknown'];}))).toThrow();
  expect(() => validateSceneGlb(changed(json => {
    (json.buffers as Array<Record<string, unknown>>)[0].uri = 'https://example.com/data';
  }))).toThrow();
  expect(() => validateSceneGlb(changed(json => {
    (json.buffers as Array<Record<string, unknown>>)[1].byteLength = 2_000_000_000;
  }))).toThrow();
});

it.each([{filter: 'EXPONENTIAL'}, {byteStride: 8}, {count: 2_000_000_000}, {byteOffset: 2_000_000_000}, {buffer: 1}, {mode: 'unknown'}])('rejects unsupported or out-of-bounds Meshopt parameters %j', patch => {
  expect(() => validateSceneGlb(changed(json => {
    const views = json.bufferViews as Array<{extensions: {EXT_meshopt_compression: Record<string, unknown>}}>;
    Object.assign(views[0].extensions.EXT_meshopt_compression, patch);
  }))).toThrow();
});
