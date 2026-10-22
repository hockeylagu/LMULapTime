import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Node release script has no declaration file.
import { mergeKeys, readEntries, readMapping, writeMapping } from '../../../tools/release/updateVehicleKeys.mjs';

// A cut-down vehicleMapping.ts: rows plus the generated keys block. Names are made up.
const SOURCE = `const VEHICLE_MODELS = [
  { carName: 'Test_GT', carClass: 'GT3', model: 'Test GT' },
  { carName: 'Test_P2', carClass: 'LMP2', model: 'Test P2' },
  { carName: 'Test_P2', carClass: 'LMP2_ELMS', model: 'Test P2' },
];
// <vehicle-keys> Generated.
const VEHICLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  "GT3/Test_GT": [
    "OLD_GT_KEY",
  ],
};
// </vehicle-keys>
`;

interface TestEntry { source: string; keys: string[]; classes: string[] }
const entry = (keys: string[], classes: string[]): TestEntry => ({ source: 'test', keys, classes });

describe('vehicle key generator', () => {
  it('adds keys by class and car name, keeps old keys, and rewrites the block it reads back', () => {
    const mapping = readMapping(SOURCE);
    const merged = mergeKeys(mapping, [
      entry(['NEW_GT_KEY', 'TEST TEAM 2026 #1:LM'], ['WEC2026', 'GT3', 'Test_GT']),
      entry(['P2_WEC'], ['WEC2026', 'LMP2', 'Test_P2', 'Extra_Token']),
      entry(['P2_ELMS'], ['ELMS2026', 'LMP2_ELMS', 'Test_P2', 'Default_Custom_Livery']),
    ]) as Map<string, Set<string>>;
    const written = writeMapping(SOURCE, merged) as string;
    expect(readMapping(written).keys).toEqual(new Map([
      ['GT3/Test_GT', new Set(['NEW_GT_KEY', 'OLD_GT_KEY', 'TEST TEAM 2026 #1:LM'])],
      ['LMP2/Test_P2', new Set(['P2_WEC'])],
      ['LMP2_ELMS/Test_P2', new Set(['P2_ELMS'])],
    ]));
    expect(writeMapping(written, mergeKeys(readMapping(written), []))).toBe(written);
  });

  it('fails on a car name without a row and on a key two cars claim', () => {
    const mapping = readMapping(SOURCE);
    expect(() => mergeKeys(mapping, [entry(['X'], ['WEC2026', 'GT3', 'Unknown_Car'])])).toThrow(/No row/);
    expect(() => mergeKeys(mapping, [entry(['OLD_GT_KEY'], ['WEC2026', 'LMP2', 'Test_P2'])])).toThrow(/OLD_GT_KEY/);
  });

  it('reads custom liveries from .veh files and entries from a getAllVehicles answer', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vehicle-keys-'));
    try {
      fs.mkdirSync(path.join(root, 'Test_GT_2026', '1.01'), { recursive: true });
      fs.writeFileSync(path.join(root, 'Test_GT_2026', '1.01', '397_26_TESTGT.veh'),
        'Description="Test GT Custom Team 2026 #397"\nClasses="WEC2026, GT3, Test_GT, Default_Custom_Livery"\n');
      const catalog = path.join(root, 'getAllVehicles.json');
      fs.writeFileSync(catalog, JSON.stringify([{ vehFile: String.raw`C:\LMU\Vehicles\Test_GT_2026\1.01\7_26_TEAM.VEH`, desc: 'Test Team 2026 #7:LM', classes: ['WEC2026', 'GT3', 'Test_GT'] }]));
      expect(readEntries([path.join(root, 'Test_GT_2026'), catalog])).toEqual([
        expect.objectContaining({ keys: ['397_26_TESTGT', 'TEST GT CUSTOM TEAM 2026 #397'], classes: ['WEC2026', 'GT3', 'Test_GT', 'Default_Custom_Livery'] }),
        expect.objectContaining({ keys: ['7_26_TEAM', 'TEST TEAM 2026 #7:LM'], classes: ['WEC2026', 'GT3', 'Test_GT'] }),
      ]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
