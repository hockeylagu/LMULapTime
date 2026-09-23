import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseReplayMetadata,
  extractReplayTrajectory,
  extractReplayLapSummaries,
} from '../../server/replay/replayParser.js';
import { LmuParser } from '../../server/sessions/parser.js';
import { MockSlice, createSliceVcrBuffer } from '../utils/mockVcr.js';

const runRealReplayTests = process.env.RUN_REAL_REPLAY_TESTS === '1';

describe('replayParser - extended format & pit info', () => {
  const tempDir = path.join(process.cwd(), 'test', 'fixtures', 'replays_temp_ext');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

    describe('extended VCR format features', () => {
      it('extracts modUid and trackPath strings from replay metadata', () => {
        const filePath = path.join(tempDir, 'meta_extended.vcr');
        fs.writeFileSync(filePath, createSliceVcrBuffer());
        const meta = parseReplayMetadata(filePath);
        expect(meta.modUid).toBe('hash_123');
        expect(meta.trackPath).toBe('C:\\Tracks\\Test');
        fs.unlinkSync(filePath);
      });

      it('decodes sessionType and privateSession flag from session byte in metadata', () => {
        // Construct VCR with session configuration byte: 133 (0x85 -> private=true, code=5 -> Qualifying)
        const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
        const headerBuf = Buffer.from(headerText, 'ascii');
        const irsrBuf = Buffer.from('IRSR', 'ascii');
        const verBuf = Buffer.alloc(4);
        verBuf.writeUInt32LE(0x80000008, 0);
        const offsetBuf = Buffer.alloc(4);

        function makeStr4(str: string): Buffer {
          const sBuf = Buffer.from(str, 'utf8');
          const lBuf = Buffer.alloc(4);
          lBuf.writeUInt32LE(sBuf.length, 0);
          return Buffer.concat([lBuf, sBuf]);
        }

        const metaParts = [
          makeStr4(JSON.stringify({ eventTitle: 'Q1 Session' })),
          makeStr4('PORTIMAO.SCN'),
          makeStr4('PORTIMAO.AIW'),
          makeStr4('Portimao'),
          makeStr4('1.23'),
          makeStr4('uid_456'),
          makeStr4('C:\\Tracks\\Portimao'),
          Buffer.from([0x0d, 133]), // Byte 0 = unknown, Byte 1 = 133 (0x85 -> private=true, sessionType=Qualifying)
        ];

        // Environment block + numDrivers (0) + trailer
        metaParts.push(Buffer.alloc(67)); // 67-byte env block
        const nDrvBuf = Buffer.alloc(4);
        nDrvBuf.writeInt32LE(0, 0); // 0 drivers
        metaParts.push(nDrvBuf);
        const trailer = Buffer.alloc(28);
        metaParts.push(trailer);

        const metaBuf = Buffer.concat(metaParts);
        const metaOffset = 57;
        offsetBuf.writeUInt32LE(metaOffset, 0);
        const fullBuf = Buffer.concat([headerBuf, irsrBuf, verBuf, offsetBuf, metaBuf]);

        const filePath = path.join(tempDir, 'session_byte_test.vcr');
        fs.writeFileSync(filePath, fullBuf);
        const meta = parseReplayMetadata(filePath);

        expect(meta.sessionType).toBe('Qualifying');
        expect(meta.privateSession).toBe(true);
        expect(meta.modUid).toBe('uid_456');
        expect(meta.trackPath).toBe('C:\\Tracks\\Portimao');
        fs.unlinkSync(filePath);
      });

      it('parses deterministic structured driver table with entryTime and exitTime', () => {
        const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
        const headerBuf = Buffer.from(headerText, 'ascii');
        const irsrBuf = Buffer.from('IRSR', 'ascii');
        const verBuf = Buffer.alloc(4);
        verBuf.writeUInt32LE(0x80000008, 0);
        const offsetBuf = Buffer.alloc(4);

        function makeStr4(str: string): Buffer {
          const sBuf = Buffer.from(str, 'utf8');
          const lBuf = Buffer.alloc(4);
          lBuf.writeUInt32LE(sBuf.length, 0);
          return Buffer.concat([lBuf, sBuf]);
        }

        function makePStr(str: string): Buffer {
          const b = Buffer.from(str, 'utf8');
          return Buffer.concat([Buffer.from([b.length]), b]);
        }

        const metaParts = [
          makeStr4(JSON.stringify({ eventTitle: 'Multi Driver Test' })),
          makeStr4('TRACK.SCN'),
          makeStr4('TRACK.AIW'),
          makeStr4('Track'),
          makeStr4('1.0'),
          makeStr4('uid'),
          makeStr4('path'),
          Buffer.from([0x01, 0x01]), // session byte: Practice
          Buffer.alloc(67), // 67 bytes environment block
        ];

        // numDrivers = 2
        const nDrvBuf = Buffer.alloc(4);
        nDrvBuf.writeInt32LE(2, 0);
        metaParts.push(nDrvBuf);

        // Driver 0: slot 0, Douglas Riviera, entryTime=10.5, exitTime=120.0
        metaParts.push(Buffer.from([0])); // slot 0
        metaParts.push(makePStr('Douglas Riviera'));
        metaParts.push(makePStr('32_26_WRT_83524148'));
        metaParts.push(makePStr('')); // livery
        metaParts.push(makePStr('Team WRT 2026 #32'));
        metaParts.push(makePStr('32')); // carNumber
        const fixed0 = Buffer.alloc(24);
        fixed0.writeFloatLE(10.5, 16); // entryTime
        fixed0.writeFloatLE(120.0, 20); // exitTime
        metaParts.push(fixed0);

        // Transition: 2 bytes index (0), 2 bytes next slot (1)
        const trans = Buffer.alloc(4);
        trans.writeUInt16BE(0, 0);
        trans.writeUInt16BE(1, 2);
        metaParts.push(trans);

        // Driver 1: slot 1, Vincenzo Maggio, entryTime=0.0, exitTime=250.0
        metaParts.push(makePStr('Vincenzo Maggio'));
        metaParts.push(makePStr('86_24_GRR_82B297D8'));
        metaParts.push(makePStr(''));
        metaParts.push(makePStr('GR Racing 2024 #86'));
        metaParts.push(makePStr('86'));
        const fixed1 = Buffer.alloc(24);
        fixed1.writeFloatLE(0.0, 16);
        fixed1.writeFloatLE(250.0, 20);
        metaParts.push(fixed1);

        const trailer = Buffer.alloc(28);
        metaParts.push(trailer);

        const metaBuf = Buffer.concat(metaParts);
        const metaOffset = 57;
        offsetBuf.writeUInt32LE(metaOffset, 0);
        const fullBuf = Buffer.concat([headerBuf, irsrBuf, verBuf, offsetBuf, metaBuf]);

        const filePath = path.join(tempDir, 'struct_driver_test.vcr');
        fs.writeFileSync(filePath, fullBuf);
        const meta = parseReplayMetadata(filePath);

        expect(meta.drivers.length).toBe(2);
        expect(meta.drivers[0].name).toBe('Douglas Riviera');
        expect(meta.drivers[0].carModel).toBe('BMW M4 GT3');
        expect(meta.drivers[0].entryTime).toBe(10.5);
        expect(meta.drivers[0].exitTime).toBe(120.0);

        expect(meta.drivers[1].name).toBe('Vincenzo Maggio');
        expect(meta.drivers[1].carNumber).toBe('86');
        expect(meta.drivers[1].exitTime).toBe(250.0);
        fs.unlinkSync(filePath);
      });

      it('extracts rotX, rotZ, and detachablePartState in trajectory points', () => {
        const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
        const headerBuf = Buffer.from(headerText, 'ascii');
        const irsrBuf = Buffer.from('IRSR', 'ascii');
        const verBuf = Buffer.alloc(4);
        verBuf.writeUInt32LE(0x80000008, 0);
        const streamPrefix = Buffer.alloc(4);

        // Build 10 trajectory slices with pitch (rotX), roll (rotZ), and damage
        const sliceBufs: Buffer[] = [];
        for (let i = 0; i < 10; i++) {
          const sBuf = Buffer.alloc(6);
          sBuf.writeFloatLE(10.0 + i * 0.1, 0);
          sBuf.writeUInt16LE(1, 4); // 1 event

          const evHdr = Buffer.alloc(4);
          evHdr.writeUInt32LE((9 << 17) | (65 << 8) | 1, 0); // Type 9, sz=65, drv=1, class=0
          const evPad = Buffer.from([0]);

          const evData = Buffer.alloc(65);
          // info2 at offset 4: detachablePartState = 42
          evData.writeUInt32LE(42, 4);

          // Position
          evData.writeFloatLE(100.0 + i * 10, 41);
          evData.writeFloatLE(5.0, 45);
          evData.writeFloatLE(200.0, 49);

          // 3D orientation: rotX = -0.05 (pitch), rotY = 1.57, rotZ = 0.02 (roll)
          evData.writeFloatLE(-0.05, 53);
          evData.writeFloatLE(1.57, 57);
          evData.writeFloatLE(0.02, 61);

          sliceBufs.push(sBuf, evHdr, evPad, evData);
        }

        const framesBuf = Buffer.concat([streamPrefix, ...sliceBufs]);

        function makeStr4(str: string): Buffer {
          const sBuf = Buffer.from(str, 'utf8');
          const lBuf = Buffer.alloc(4);
          lBuf.writeUInt32LE(sBuf.length, 0);
          return Buffer.concat([lBuf, sBuf]);
        }

        const metaParts = [
          makeStr4(JSON.stringify({ eventTitle: 'Telemetry Test' })),
          makeStr4('T.SCN'),
          makeStr4('T.AIW'),
          makeStr4('Track'),
          makeStr4('1.0'),
          makeStr4('mod'),
          makeStr4('path'),
          Buffer.from([1, 'Player Driver\0', '21_26_AFCO95641716\0', 'Ferrari Team\0', '21\0'].join(''), 'utf8'),
        ];
        const trailer = Buffer.alloc(28);
        trailer.writeUInt32LE(10, 4);
        trailer.writeUInt32LE(10, 8);
        trailer.writeFloatLE(10.0, 12);
        trailer.writeFloatLE(11.0, 16);
        metaParts.push(trailer);

        const metaBuf = Buffer.concat(metaParts);
        const metaOffset = 57 + framesBuf.length;
        const offsetBuf = Buffer.alloc(4);
        offsetBuf.writeUInt32LE(metaOffset, 0);

        const fullBuf = Buffer.concat([headerBuf, irsrBuf, verBuf, offsetBuf, framesBuf, metaBuf]);
        const filePath = path.join(tempDir, '3d_telemetry_test.vcr');
        fs.writeFileSync(filePath, fullBuf);

        const traj = extractReplayTrajectory(filePath, { driverSlot: 1 });
        expect(traj.points.length).toBeGreaterThan(0);
        const pt = traj.points[0];
        expect(pt.rotX).toBe(-0.05);
        expect(pt.rotZ).toBe(0.02);
        expect(pt.detachablePartState).toBe(42);
        fs.unlinkSync(filePath);
      });

      it('extracts penalties and pit lane events from slice streams', () => {
        const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
        const headerBuf = Buffer.from(headerText, 'ascii');
        const irsrBuf = Buffer.from('IRSR', 'ascii');
        const verBuf = Buffer.alloc(4);
        verBuf.writeUInt32LE(0x80000008, 0);
        const streamPrefix = Buffer.alloc(4);

        const sliceBufs: Buffer[] = [];
        // Slice 1: Car position + Class 2 Type 5 (Penalty given: "Cut track")
        const sBuf1 = Buffer.alloc(6);
        sBuf1.writeFloatLE(25.5, 0);
        sBuf1.writeUInt16LE(2, 4); // 2 events

        // Event 1: Motion (sz=65)
        const evHdr1 = Buffer.alloc(4);
        evHdr1.writeUInt32LE((9 << 17) | (65 << 8) | 1, 0);
        const evData1 = Buffer.alloc(65);
        evData1.writeFloatLE(100, 41);
        evData1.writeFloatLE(0, 45);
        evData1.writeFloatLE(200, 49);

        // Event 2: Class 2 Type 5 Penalty Given: "Cut track warning"
        // class = 2 (1 << 30), type = 5 (5 << 17), drv = 1
        const penaltyText = Buffer.from('Cut track warning', 'utf8');
        const penaltySize = 3 + penaltyText.length;
        const evHdr2 = Buffer.alloc(4);
        const hVal = (2 << 29) | (5 << 17) | (penaltySize << 8) | 1;
        evHdr2.writeUInt32LE(hVal >>> 0, 0);
        const evData2 = Buffer.concat([Buffer.from([1, 0, 0]), penaltyText]); // 3-byte prefix + string

        sliceBufs.push(sBuf1, evHdr1, Buffer.from([0]), evData1, evHdr2, Buffer.from([0]), evData2);

        // Slice 2: Motion + Class 5 Type 2 Pit Event (code 34 = entered pit lane)
        const sBuf2 = Buffer.alloc(6);
        sBuf2.writeFloatLE(30.0, 0);
        sBuf2.writeUInt16LE(2, 4);

        const evHdr3 = Buffer.alloc(4);
        evHdr3.writeUInt32LE((9 << 17) | (65 << 8) | 1, 0);
        const evData3 = Buffer.alloc(65);
        evData3.writeFloatLE(120, 41);
        evData3.writeFloatLE(0, 45);
        evData3.writeFloatLE(220, 49);

        const evHdr4 = Buffer.alloc(4);
        // class = 5 (5 << 29), type = 2 (2 << 17), size = 1, drv = 1
        const pitVal = ((5 << 29) | (2 << 17) | (1 << 8) | 1) >>> 0;
        evHdr4.writeUInt32LE(pitVal, 0);
        const evData4 = Buffer.from([34]); // code 34: entered pit lane

        sliceBufs.push(sBuf2, evHdr3, Buffer.from([0]), evData3, evHdr4, Buffer.from([0]), evData4);

        const framesBuf = Buffer.concat([streamPrefix, ...sliceBufs]);

        function makeStr4(str: string): Buffer {
          const sBuf = Buffer.from(str, 'utf8');
          const lBuf = Buffer.alloc(4);
          lBuf.writeUInt32LE(sBuf.length, 0);
          return Buffer.concat([lBuf, sBuf]);
        }

        const metaParts = [
          makeStr4(JSON.stringify({ eventTitle: 'Penalty/Pit Test' })),
          makeStr4('T.SCN'),
          makeStr4('T.AIW'),
          makeStr4('Track'),
          makeStr4('1.0'),
          makeStr4('mod'),
          makeStr4('path'),
          Buffer.from([1, 'Player Driver\0', '21_26_AFCO95641716\0', 'Ferrari Team\0', '21\0'].join(''), 'utf8'),
        ];
        const trailer = Buffer.alloc(28);
        metaParts.push(trailer);

        const metaBuf = Buffer.concat(metaParts);
        const metaOffset = 57 + framesBuf.length;
        const offsetBuf = Buffer.alloc(4);
        offsetBuf.writeUInt32LE(metaOffset, 0);

        const fullBuf = Buffer.concat([headerBuf, irsrBuf, verBuf, offsetBuf, framesBuf, metaBuf]);
        const filePath = path.join(tempDir, 'penalty_pit_test.vcr');
        fs.writeFileSync(filePath, fullBuf);

        const traj = extractReplayTrajectory(filePath, { driverSlot: 1 });
        expect(traj.penalties).toBeDefined();
        expect(traj.penalties?.length).toBe(1);
        expect(traj.penalties?.[0].penaltyText).toBe('Cut track warning');
        expect(traj.penalties?.[0].action).toBe('given');

        expect(traj.pitEvents).toBeDefined();
        expect(traj.pitEvents?.length).toBe(1);
        expect(traj.pitEvents?.[0].code).toBe(34);
        expect(traj.pitEvents?.[0].action).toBe('entered pit lane');
        fs.unlinkSync(filePath);
      });

      it('extracts structured fuelAddedLiters from a service-complete pit event (code 37)', () => {
        const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
        const headerBuf = Buffer.from(headerText, 'ascii');
        const irsrBuf = Buffer.from('IRSR', 'ascii');
        const verBuf = Buffer.alloc(4);
        verBuf.writeUInt32LE(0x80000008, 0);
        const streamPrefix = Buffer.alloc(4);

        const sBuf = Buffer.alloc(6);
        sBuf.writeFloatLE(45.0, 0);
        sBuf.writeUInt16LE(1, 4);

        // Class 5 Type 2, code 37 (service complete): +1 status byte, +2..5 fuelAddedLiters (Float32LE)
        const evHdr = Buffer.alloc(4);
        const pitVal = ((5 << 29) | (2 << 17) | (6 << 8) | 1) >>> 0;
        evHdr.writeUInt32LE(pitVal, 0);
        const evData = Buffer.alloc(6);
        evData[0] = 37;
        evData.writeFloatLE(62.5, 2);

        const framesBuf = Buffer.concat([streamPrefix, sBuf, evHdr, Buffer.from([0]), evData]);

        function makeStr4(str: string): Buffer {
          const sBuf2 = Buffer.from(str, 'utf8');
          const lBuf = Buffer.alloc(4);
          lBuf.writeUInt32LE(sBuf2.length, 0);
          return Buffer.concat([lBuf, sBuf2]);
        }

        const metaParts = [
          makeStr4(JSON.stringify({ eventTitle: 'Fuel Test' })),
          makeStr4('T.SCN'),
          makeStr4('T.AIW'),
          makeStr4('Track'),
          makeStr4('1.0'),
          makeStr4('mod'),
          makeStr4('path'),
          Buffer.from([1, 'Player Driver\0', '21_26_AFCO95641716\0', 'Ferrari Team\0', '21\0'].join(''), 'utf8'),
        ];
        const trailer = Buffer.alloc(28);
        metaParts.push(trailer);

        const metaBuf = Buffer.concat(metaParts);
        const metaOffset = 57 + framesBuf.length;
        const offsetBuf = Buffer.alloc(4);
        offsetBuf.writeUInt32LE(metaOffset, 0);

        const fullBuf = Buffer.concat([headerBuf, irsrBuf, verBuf, offsetBuf, framesBuf, metaBuf]);
        const filePath = path.join(tempDir, 'fuel_added_test.vcr');
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(filePath, fullBuf);

        const traj = extractReplayTrajectory(filePath, { driverSlot: 1 });
        expect(traj.pitEvents).toBeDefined();
        expect(traj.pitEvents?.length).toBe(1);
        expect(traj.pitEvents?.[0].code).toBe(37);
        expect(traj.pitEvents?.[0].fuelAddedLiters).toBeCloseTo(62.5, 1);
        expect(traj.pitEvents?.[0].details).toBe('Fuel: 62.5L');
        fs.unlinkSync(filePath);
      });

      const steamReplays = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
      const realP1File = path.join(steamReplays, 'Algarve International Circuit P1 39.Vcr');
      const realQ1File = path.join(steamReplays, 'Algarve International Circuit Q1 10.Vcr');

      if (runRealReplayTests && fs.existsSync(realP1File) && fs.existsSync(realQ1File)) {
        it('validates sessionType, modUid, trackPath, and structured drivers on real LMU replay files', () => {
          const p1Meta = parseReplayMetadata(realP1File);
          expect(p1Meta.sessionType).toBe('Practice');
          expect(p1Meta.privateSession).toBe(false);
          expect(p1Meta.modUid).toBeDefined();
          expect(p1Meta.trackPath).toContain('Locations');
          expect(p1Meta.drivers.length).toBe(21);
          expect(p1Meta.drivers[0].entryTime).toBeDefined();

          const q1Meta = parseReplayMetadata(realQ1File);
          expect(q1Meta.sessionType).toBe('Qualifying');
          expect(q1Meta.privateSession).toBe(true);
          expect(q1Meta.drivers.length).toBe(20);
        });
      }

      it('extracts 100% official lap summaries, sector splits, and lap validity via extractReplayLapSummaries', () => {
        // Build a VCR buffer with 2 full laps:
        // Lap 1: valid flying lap (S1 = 25.0s, S2 cum = 60.0s -> S2 = 35.0s, Finish = 95.0s -> S3 = 35.0s)
        // Lap 2: cut/invalidated lap (splitSec = -1)
        const slices: MockSlice[] = [];
        let t = 100.0;

        // Out-lap / approach to S/F line
        for (let i = 0; i < 5; i++) {
          t += 1.0;
          slices.push({ sTime: t, driverSlot: 1, x: 0, y: 0, z: i * 20 });
        }
        // Crossing S/F to start Lap 1
        const lap1StartTime = t;
        slices.push({
          sTime: lap1StartTime,
          driverSlot: 1,
          x: 0,
          y: 0,
          z: 100,
          timing: { splitSec: -1, sector: 0, lapIdx: 0 },
        });

        // Driving Sector 1
        t += 25.0;
        slices.push({
          sTime: t,
          driverSlot: 1,
          x: 200,
          y: 0,
          z: 500,
          timing: { splitSec: 25.0, sector: 1, lapIdx: 1 },
        });

        // Driving Sector 2
        t += 35.0;
        slices.push({
          sTime: t,
          driverSlot: 1,
          x: 400,
          y: 0,
          z: 1000,
          timing: { splitSec: 60.0, sector: 2, lapIdx: 1 },
        });

        // Completing Lap 1 at S/F line
        t += 35.0;
        slices.push({
          sTime: t,
          driverSlot: 1,
          x: 0,
          y: 0,
          z: 100,
          timing: { splitSec: 95.0, sector: 0, lapIdx: 1 },
        });

        // Driving Lap 2 (cut lap)
        t += 24.0;
        slices.push({
          sTime: t,
          driverSlot: 1,
          x: 200,
          y: 0,
          z: 500,
          timing: { splitSec: 24.0, sector: 1, lapIdx: 2 },
        });
        t += 34.0;
        slices.push({
          sTime: t,
          driverSlot: 1,
          x: 400,
          y: 0,
          z: 1000,
          timing: { splitSec: 58.0, sector: 2, lapIdx: 2 },
        });
        t += 36.0;
        slices.push({
          sTime: t,
          driverSlot: 1,
          x: 0,
          y: 0,
          z: 100,
          timing: { splitSec: -1.0, sector: 0, lapIdx: 2 },
        });

        const vcrPath = path.join(tempDir, 'official_laps_test.vcr');
        fs.writeFileSync(vcrPath, createSliceVcrBuffer({ slices }));

        const laps = extractReplayLapSummaries(vcrPath, { driverSlot: 1 });
        expect(laps.length).toBeGreaterThanOrEqual(2);

        // Lap 1: valid flying lap
        const lap1 = laps.find(l => l.lapNumber === 2);
        expect(lap1).toBeDefined();
        expect(lap1?.lapTimeSec).toBe(95.0);
        expect(lap1?.s1Sec).toBe(25.0);
        expect(lap1?.s2Sec).toBe(35.0);
        expect(lap1?.s3Sec).toBe(35.0);
        expect(lap1?.isValid).toBe(true);
        expect(lap1?.isBest).toBe(true);

        // Lap 2: cut lap
        const lap2 = laps.find(l => l.lapNumber === 3);
        expect(lap2).toBeDefined();
        expect(lap2?.isValid).toBe(false);
        expect(lap2?.lapTimeSec).toBeCloseTo(94.0, 0);

        fs.unlinkSync(vcrPath);
      });

      const p1_41_File = path.join(steamReplays, 'Algarve International Circuit P1 41.Vcr');
      if (runRealReplayTests && fs.existsSync(p1_41_File)) {
        it('extracts official lap summaries directly from Class 6 Type 6 events on real Algarve P1 41 replay', () => {
          // Driver slot 2 had 19 timing events in our inspection
          const laps = extractReplayLapSummaries(p1_41_File, { driverSlot: 2 });
          expect(laps.length).toBeGreaterThan(0);
          // Has valid flying lap with lapTimeSec = 106.805s
          const lap17 = laps.find(l => l.lapTimeSec === 106.805 || l.lapNumber === 17);
          expect(lap17).toBeDefined();
          if (lap17) {
            expect(lap17.isValid).toBe(true);
            expect(lap17.lapTimeSec).toBeCloseTo(106.805, 1);
          }
        });
      }

      const daytonaQ1_File = path.join(steamReplays, 'Daytona International Speedway Road Course Q1 6.Vcr');
      if (runRealReplayTests && fs.existsSync(daytonaQ1_File)) {
        it('extracts official lap summaries and sector splits on Daytona Q1 replay', () => {
          const laps = extractReplayLapSummaries(daytonaQ1_File, { playerName: 'Samuel' });
          expect(laps.length).toBeGreaterThanOrEqual(4);
          const best = laps.find(l => l.isBest);
          expect(best).toBeDefined();
          expect(best?.lapTimeSec).toBeCloseTo(107.1, 0);
          expect(best?.s1Sec).toBeGreaterThan(20);
          expect(best?.s2Sec).toBeGreaterThan(20);
          expect(best?.s3Sec).toBeGreaterThan(20);
          expect(best?.isValid).toBe(true);
        });
      }

      const spaR1_File = path.join(steamReplays, 'Circuit de Spa-Francorchamps R1 35.Vcr');
      if (runRealReplayTests && fs.existsSync(spaR1_File)) {
        it('extracts official lap summaries and sector splits on Spa R1 race replay', () => {
          const traj = extractReplayTrajectory(spaR1_File, { playerName: 'Samuel' });
          console.log('Spa driverSlot:', traj.driverSlot, 'driverName:', traj.driverName, 'laps:', traj.laps?.length);
          const laps = extractReplayLapSummaries(spaR1_File, { playerName: 'Samuel' });
          console.log('Spa extracted summaries:', laps.length);
          expect(laps.length).toBeGreaterThanOrEqual(14);
          expect(laps[0].isOutlap).toBe(true);
          // Valid flying racing lap
          const best = laps.find(l => l.isBest);
          expect(best).toBeDefined();
          expect(best?.lapTimeSec).toBeCloseTo(129.336, 1);
          expect(best?.s1Sec).toBeGreaterThan(30);
          expect(best?.s2Sec).toBeGreaterThan(30);
          expect(best?.s3Sec).toBeGreaterThan(30);
          expect(best?.isValid).toBe(true);
        });
      }

      const bahrainR1_File = path.join(steamReplays, 'Bahrain International Circuit R1 1.Vcr');
      if (runRealReplayTests && fs.existsSync(bahrainR1_File)) {
        it('extracts official lap summaries and sector splits on Bahrain International R1 race replay', () => {
          const laps = extractReplayLapSummaries(bahrainR1_File, { playerName: 'Samuel' });
          expect(laps.length).toBeGreaterThan(0);
          for (const l of laps) {
            expect(l.lapTimeSec).toBeGreaterThan(0);
            expect(l.s1Sec).toBeGreaterThan(0);
            expect(l.s2Sec).toBeGreaterThan(0);
            expect(l.s3Sec).toBeGreaterThan(0);
          }
        });
      }

      const sebringR1_File = path.join(steamReplays, 'Sebring International Raceway R1 13.Vcr');
      if (runRealReplayTests && fs.existsSync(sebringR1_File)) {
        it('extracts official lap summaries and sector splits on Sebring R1 race replay', () => {
          const laps = extractReplayLapSummaries(sebringR1_File, { playerName: 'Samuel' });
          expect(laps.length).toBeGreaterThan(0);
          for (const l of laps) {
            expect(l.lapTimeSec).toBeGreaterThan(0);
            expect(l.s1Sec).toBeGreaterThan(0);
            expect(l.s2Sec).toBeGreaterThan(0);
            expect(l.s3Sec).toBeGreaterThan(0);
          }
        });
      }

      const lagunaR1_File = path.join(steamReplays, 'WeatherTech Raceway Laguna Seca R1 4.Vcr');
      if (runRealReplayTests && fs.existsSync(lagunaR1_File)) {
        it('extracts official lap summaries and sector splits on Laguna Seca R1 race replay', () => {
          const laps = extractReplayLapSummaries(lagunaR1_File, { playerName: 'Samuel' });
          expect(laps.length).toBeGreaterThan(0);
          for (const l of laps) {
            expect(l.lapTimeSec).toBeGreaterThan(0);
            expect(l.s1Sec).toBeGreaterThan(0);
            expect(l.s2Sec).toBeGreaterThan(0);
            expect(l.s3Sec).toBeGreaterThan(0);
          }
        });
      }

      const imolaR1_File = path.join(steamReplays, 'Autodromo Enzo e Dino Ferrari R1 8.Vcr');
      if (runRealReplayTests && fs.existsSync(imolaR1_File)) {
        it('extracts official lap summaries and sector splits on Imola R1 race replay', () => {
          const laps = extractReplayLapSummaries(imolaR1_File, { playerName: 'Samuel' });
          expect(laps.length).toBeGreaterThanOrEqual(15);
          const best = laps.find(l => l.isBest);
          expect(best).toBeDefined();
          expect(best?.lapTimeSec).toBeCloseTo(100.520, 1);
          expect(best?.s1Sec).toBeCloseTo(20.672, 1);
          expect(best?.s2Sec).toBeCloseTo(32.751, 1);
          expect(best?.s3Sec).toBeCloseTo(47.097, 1);
          expect(best?.isValid).toBe(true);
        });
      }
    });

    describe.skipIf(!runRealReplayTests)('Cross-track & cross-session validation: official VCR timing vs XML simulation logs', () => {
      const steamReplays = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
      const steamResults = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\LOG\\Results';
      const lmuParser = new LmuParser();

      const validationCases = [
        // 1. Imola
        { name: 'Imola Online Race (R1 8)', vcr: 'Autodromo Enzo e Dino Ferrari R1 8.Vcr', xml: '2026_09_04_14_15_58-09R1.xml', minLaps: 15, bestLap: 100.520 },
        { name: 'Imola Online Quali (Q1 8)', vcr: 'Autodromo Enzo e Dino Ferrari Q1 8.Vcr', xml: '2026_09_04_13_42_35-50Q1.xml', minLaps: 3, bestLap: 100.275 },
        { name: 'Imola Online Practice (P1 14)', vcr: 'Autodromo Enzo e Dino Ferrari P1 14.Vcr', xml: '2026_09_02_12_29_31-43P1.xml', minLaps: 2, bestLap: 125.280 },

        // 2. Sebring
        { name: 'Sebring Online Race (R1 13)', vcr: 'Sebring International Raceway R1 13.Vcr', xml: '2026_08_21_16_22_42-86R1.xml', minLaps: 9, bestLap: 127.428 },
        { name: 'Sebring Online Quali (Q1 13)', vcr: 'Sebring International Raceway Q1 13.Vcr', xml: '2026_08_21_15_58_03-69Q1.xml', minLaps: 3, bestLap: 124.392 },
        { name: 'Sebring Online Practice (P1 33)', vcr: 'Sebring International Raceway P1 33.Vcr', xml: '2026_08_24_15_47_36-22P1.xml', minLaps: 2, bestLap: 124.918 },

        // 3. Spa-Francorchamps
        { name: 'Spa Online Race (R1 35)', vcr: 'Circuit de Spa-Francorchamps R1 35.Vcr', xml: '2026_08_28_14_17_16-16R1.xml', minLaps: 14, bestLap: 129.336 },
        { name: 'Spa Online Quali (Q1 27)', vcr: 'Circuit de Spa-Francorchamps Q1 27.Vcr', xml: '2026_08_17_21_12_34-93Q1.xml', minLaps: 2, bestLap: 141.502 },
        { name: 'Spa Offline Practice (P1 79)', vcr: 'Circuit de Spa-Francorchamps P1 79.Vcr', xml: '2026_08_28_15_11_48-04P1.xml', minLaps: 6, bestLap: 127.777 },

        // 4. Bahrain
        { name: 'Bahrain Online Race (R1 2)', vcr: 'Bahrain International Circuit R1 2.Vcr', xml: '2026_08_31_12_51_21-03R1.xml', minLaps: 9, bestLap: 121.843 },
        { name: 'Bahrain Online Quali (Q1 2)', vcr: 'Bahrain International Circuit Q1 2.Vcr', xml: '2026_08_31_12_28_06-56Q1.xml', minLaps: 3, bestLap: 121.575 },
        { name: 'Bahrain Online Practice (P1 16)', vcr: 'Bahrain International Circuit P1 16.Vcr', xml: '2026_08_31_12_15_57-46P1.xml', minLaps: 2, bestLap: 124.866 },

        // 5. Daytona
        { name: 'Daytona Online Race (R1 3)', vcr: 'Daytona International Speedway Road Course R1 3.Vcr', xml: '2026_08_05_14_43_54-05R1.xml', minLaps: 25, bestLap: 107.604 },
        { name: 'Daytona Online Quali (Q1 3)', vcr: 'Daytona International Speedway Road Course Q1 3.Vcr', xml: '2026_08_05_13_38_47-22Q1.xml', minLaps: 3, bestLap: 107.973 },
        { name: 'Daytona Online Practice (P1 16)', vcr: 'Daytona International Speedway Road Course P1 16.Vcr', xml: '2026_08_27_13_23_01-77P1.xml', minLaps: 8, bestLap: 107.713 },
        { name: 'Daytona Offline Practice (P1 20)', vcr: 'Daytona International Speedway Road Course P1 20.Vcr', xml: '2026_08_28_21_38_12-53P1.xml', minLaps: 26, bestLap: 95.658 },

        // 6. Laguna Seca
        { name: 'Laguna Seca Online Race (R1 4)', vcr: 'WeatherTech Raceway Laguna Seca R1 4.Vcr', xml: '2026_07_29_09_57_18-26R1.xml', minLaps: 18, bestLap: 84.473 },
        { name: 'Laguna Seca Online Quali (Q1 1)', vcr: 'WeatherTech Raceway Laguna Seca Q1 1.Vcr', xml: '2026_07_28_15_22_29-84Q1.xml', minLaps: 4, bestLap: 85.252 },

        // 7. Algarve
        { name: 'Algarve Online Race (R1 13)', vcr: 'Algarve International Circuit R1 13.Vcr', xml: '2026_09_01_09_37_28-03R1.xml', minLaps: 10, bestLap: 106.137 },
        { name: 'Algarve Online Quali (Q1 10)', vcr: 'Algarve International Circuit Q1 10.Vcr', xml: '2026_09_01_09_12_19-94Q1.xml', minLaps: 3, bestLap: 106.827 },
        { name: 'Algarve Online Practice (P1 41)', vcr: 'Algarve International Circuit P1 41.Vcr', xml: '2026_09_03_18_43_58-60P1.xml', minLaps: 3, bestLap: 106.927 },

        // 8. Monza
        { name: 'Monza Offline Race (R1 6)', vcr: 'Autodromo Nazionale Monza R1 6.Vcr', xml: '2026_07_02_22_20_56-02R1.xml', minLaps: 10, bestLap: 112.303 },
        { name: 'Monza Offline Quali (Q1 6)', vcr: 'Autodromo Nazionale Monza Q1 6.Vcr', xml: '2026_07_02_21_57_10-23Q1.xml', minLaps: 2, bestLap: 112.313 },

        // 9. Fuji (Modern & Classic variations)
        { name: 'Fuji Online Race (R1 24)', vcr: 'Fuji Speedway R1 24.Vcr', xml: '2026_08_26_09_36_30-78R1.xml', minLaps: 10, bestLap: 102.818 },
        { name: 'Fuji Online Quali (Q1 16)', vcr: 'Fuji Speedway Q1 16.Vcr', xml: '2026_08_26_09_12_36-41Q1.xml', minLaps: 2, bestLap: 102.269 },
        { name: 'Fuji Online Practice (P1 55)', vcr: 'Fuji Speedway P1 55.Vcr', xml: '2026_08_31_09_01_54-28P1.xml', minLaps: 3, bestLap: 102.749 },
        { name: 'Fuji Speedway Classic Online Race (R1 1)', vcr: 'Fuji Speedway Classic R1 1.Vcr', xml: '2026_06_07_20_56_12-29R1.xml', minLaps: 12, bestLap: 101.231 },
        { name: 'Fuji Speedway Classic Online Quali (Q1 1)', vcr: 'Fuji Speedway Classic Q1 1.Vcr', xml: '2026_06_07_20_32_44-91Q1.xml', minLaps: 2, bestLap: 106.244 },

        // 10. Le Mans
        { name: 'Le Mans Online Race (R1 26)', vcr: 'Circuit de la Sarthe R1 26.Vcr', xml: '2026_09_03_09_42_07-80R1.xml', minLaps: 8, bestLap: 213.273 },
        { name: 'Le Mans Online Quali (Q1 24)', vcr: 'Circuit de la Sarthe Q1 24.Vcr', xml: '2026_09_03_09_04_58-90Q1.xml', minLaps: 2, bestLap: 216.086 },

        // 11. Lusail Short Circuit (Track Variation)
        { name: 'Lusail Short Circuit Online Race (R1 1)', vcr: 'Lusail Short Circuit R1 1.Vcr', xml: '2026_08_04_09_56_44-89R1.xml', minLaps: 20, bestLap: 71.668 },
        { name: 'Lusail Short Circuit Online Quali (Q1 1)', vcr: 'Lusail Short Circuit Q1 1.Vcr', xml: '2026_08_04_09_22_24-30Q1.xml', minLaps: 3, bestLap: 72.584 },

        // 12. Paul Ricard - 1A-V2-Short (Track Variation)
        { name: 'Paul Ricard Short Online Race (R1 1)', vcr: 'Paul Ricard - 1A-V2-Short R1 1.Vcr', xml: '2026_08_19_14_17_41-91R1.xml', minLaps: 12, bestLap: 105.120 },
        { name: 'Paul Ricard Short Online Quali (Q1 1)', vcr: 'Paul Ricard - 1A-V2-Short Q1 1.Vcr', xml: '2026_08_19_13_42_39-47Q1.xml', minLaps: 3, bestLap: 105.667 },
      ];

      for (const tc of validationCases) {
        const vcrPath = path.join(steamReplays, tc.vcr);
        const xmlPath = path.join(steamResults, tc.xml);

        if (runRealReplayTests && fs.existsSync(vcrPath) && fs.existsSync(xmlPath)) {
          it(`validates ${tc.name} against official XML simulation log`, () => {
            const vcrLaps = extractReplayLapSummaries(vcrPath, { playerName: 'Samuel' });
            expect(vcrLaps.length).toBeGreaterThanOrEqual(tc.minLaps);

            const session = lmuParser.parseSessionXml(xmlPath);
            expect(session).toBeDefined();
            const player = session?.playerDriver || session?.drivers[0];
            expect(player).toBeDefined();

            const vcrBest = vcrLaps.find(l => l.isBest);
            expect(vcrBest).toBeDefined();
            expect(vcrBest?.lapTimeSec).toBeCloseTo(tc.bestLap, 1);
            if (player?.bestLapTime) {
              expect(vcrBest?.lapTimeSec).toBeCloseTo(player.bestLapTime, 1);
            }

            // Cross-validate each valid flying lap with the corresponding XML lap
            const validXmlLaps = (player?.laps || []).filter(l => l.isValid && l.lapTime && l.lapTime > 0);
            for (const xl of validXmlLaps) {
              const vl = vcrLaps.find(l => l.lapNumber === xl.lapNum);
              if (vl && vl.isValid && vl.lapTimeSec) {
                expect(vl.lapTimeSec).toBeCloseTo(xl.lapTime!, 1);
                if (xl.s1 && vl.s1Sec) expect(Math.abs(vl.s1Sec - xl.s1)).toBeLessThan(3.0);
                if (xl.s2 && vl.s2Sec) expect(Math.abs(vl.s2Sec - xl.s2)).toBeLessThan(3.0);
                if (xl.s3 && vl.s3Sec) expect(Math.abs(vl.s3Sec - xl.s3)).toBeLessThan(3.0);
              }
            }
          });
        }
      }
    });

    describe('pit stop and garage info extraction', () => {
      const steamReplays = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
      const daytonaRace = path.join(steamReplays, 'Daytona International Speedway Road Course R1 3.Vcr');
      const lagunaPractice = path.join(steamReplays, 'WeatherTech Raceway Laguna Seca P1 5.Vcr');

      it('extracts full pitstop lifecycle across all drivers in online race replay (Daytona R1 3)', () => {
        if (!runRealReplayTests || !fs.existsSync(daytonaRace)) return;

        const allTraj = extractReplayTrajectory(daytonaRace, { maxPoints: 10 });
        const allPitEvents = allTraj.pitEvents || [];
        expect(allPitEvents.length).toBeGreaterThan(100);

        // Verify driver slot 32 pit sequence
        const traj = extractReplayTrajectory(daytonaRace, { driverSlot: 32, maxPoints: 50 });
        const slot32Events = (traj.pitEvents || []).filter(e => e.driverSlot === 32);
        expect(slot32Events.length).toBeGreaterThanOrEqual(4);
        expect(slot32Events.every(e => e.driverSlot === 32)).toBe(true);

        const actions = slot32Events.map(e => e.action);
        expect(actions).toContain('requested pit');
        expect(actions).toContain('entered pit lane');
        expect(actions).toContain('on jacks');
        expect(actions).toContain('service complete');
        expect(actions).toContain('exited pit lane');

        // Verify trajectory also carries pitEvents
        expect(traj.pitEvents).toBeDefined();
        expect(traj.pitEvents?.length).toBeGreaterThan(100);
      });

      it('extracts garage exits and returns during practice sessions (Laguna Seca P1 5)', () => {
        if (!runRealReplayTests || !fs.existsSync(lagunaPractice)) return;

        const traj = extractReplayTrajectory(lagunaPractice, { driverSlot: 0, maxPoints: 10 });
        const pitEvents = (traj.pitEvents || []).filter(e => e.driverSlot === 0);
        expect(pitEvents.length).toBeGreaterThanOrEqual(4);

        const garageExits = pitEvents.filter(e => e.code === 16 && e.action === 'exited garage');
        const garageReturns = pitEvents.filter(e => (e.code === 21 || e.code === 49) && (e.action === 'returned to garage' || e.action === 'entered pit / garage'));

        expect(garageExits.length).toBeGreaterThanOrEqual(2);
        expect(garageReturns.length).toBeGreaterThanOrEqual(2);
        expect(garageExits.every(e => e.isGarage === true)).toBe(true);
        expect(garageReturns.every(e => e.isGarage === true)).toBe(true);
      });

      it('correctly sets inGarage and inPit flags on trajectory points based on event intervals', () => {
        if (!runRealReplayTests || !fs.existsSync(lagunaPractice)) return;

        // Extract full points around the first stint start (time 0 to 40s)
        const traj = extractReplayTrajectory(lagunaPractice, { driverSlot: 0, maxPoints: 0 });
        expect(traj.points.length).toBeGreaterThan(50);

        // First garage exit for driver 0 in Laguna Seca P1 5 is at 28.41s
        const garagePoints = traj.points.filter(p => p.timeSec !== undefined && p.timeSec < 28.0);
        const flyingPoints = traj.points.filter(p => p.timeSec !== undefined && p.timeSec > 35.0 && p.timeSec < 340.0 && (p.speedKmh ?? 0) > 40);

        if (garagePoints.length > 0) {
          expect(garagePoints.every(p => p.inGarage === true)).toBe(true);
        }
        if (flyingPoints.length > 0) {
          expect(flyingPoints.every(p => p.inGarage === false && p.inPit === false)).toBe(true);
        }
      });

      it('emits authentic wheel telemetry (brakeTemps) when present and omits unverified tire wear', () => {
        if (!runRealReplayTests || !fs.existsSync(lagunaPractice)) return;

        const traj = extractReplayTrajectory(lagunaPractice, { driverSlot: 0, maxPoints: 200 });
        expect(traj.wheelTelemetryAvailable).toBe(true);
        expect(traj.points.length).toBeGreaterThan(10);

        // Does NOT emit unverified/refuted tire wear or carcass temps
        const pointsWithWear = traj.points.filter(p => p.tireTemps !== undefined || p.tireWear !== undefined);
        expect(pointsWithWear.length).toBe(0);

        // Does emit authentic brake rotor temperatures and suspension deflection
        const pointsWithBrakes = traj.points.filter(p => p.brakeTemps !== undefined);
        expect(pointsWithBrakes.length).toBeGreaterThan(0);
        const sampleBrake = pointsWithBrakes[0].brakeTemps!;
        expect(sampleBrake.length).toBe(4);
        expect(sampleBrake[0]).toBeGreaterThanOrEqual(20);
        expect(sampleBrake[0]).toBeLessThanOrEqual(1000);
      });

      it('decodes engine RPM from the 10-bit pose packet field (byte 6 bit 5 through byte 7 bit 6)', () => {
        fs.mkdirSync(tempDir, { recursive: true });
        const rpmVcrPath = path.join(tempDir, 'synthetic_rpm.vcr');
        // raw10 = round(rpm / 10.9228); 5000rpm -> raw 458, 8000rpm -> raw 733
        const buf = createSliceVcrBuffer({
          slices: [
            { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, rpmRaw10: 458 },
            { sTime: 1.1, driverSlot: 1, x: 20, y: 0, z: 20, rpmRaw10: 733 },
            // Saturated field (0x3ff) must be treated as unknown, not a real rpm value
            { sTime: 1.2, driverSlot: 1, x: 30, y: 0, z: 30, rpmRaw10: 1023 },
          ],
        });
        fs.writeFileSync(rpmVcrPath, buf);

        const traj = extractReplayTrajectory(rpmVcrPath, { driverSlot: 1, maxPoints: 10 });
        expect(traj.points.length).toBe(3);
        expect(traj.points[0].engineRpm).toBeCloseTo(5002, -1);
        expect(traj.points[1].engineRpm).toBeCloseTo(8006, -1);
        expect(traj.points[2].engineRpm).toBeUndefined();

        fs.unlinkSync(rpmVcrPath);
      });

      it('decodes track flag status events (Class 3 Type 10)', () => {
        fs.mkdirSync(tempDir, { recursive: true });
        const flagVcrPath = path.join(tempDir, 'synthetic_flags.vcr');
        const buf = createSliceVcrBuffer({
          slices: [
            { sTime: 0.0, driverSlot: 1, x: 10, y: 0, z: 10, flag: { flagState: 1, sectorMask: 33, driverFlag: 0 } },
            { sTime: 66.0, driverSlot: 1, x: 20, y: 0, z: 20, flag: { flagState: 0, sectorMask: 33, driverFlag: 0 } },
            { sTime: 1400.0, driverSlot: 1, x: 30, y: 0, z: 30, flag: { flagState: 8, sectorMask: 1, driverFlag: 0 } },
          ],
        });
        fs.writeFileSync(flagVcrPath, buf);

        const traj = extractReplayTrajectory(flagVcrPath, { driverSlot: 1, maxPoints: 10 });
        expect(traj.flagEvents).toBeDefined();
        expect(traj.flagEvents?.length).toBe(3);
        expect(traj.flagEvents?.[0]).toMatchObject({ flagState: 1, flagName: 'Local Yellow', sectorMask: 33 });
        expect(traj.flagEvents?.[1]).toMatchObject({ flagState: 0, flagName: 'Green' });
        expect(traj.flagEvents?.[2]).toMatchObject({ flagState: 8, flagName: 'Checkered' });

        fs.unlinkSync(flagVcrPath);
      });

      it('decodes live standings snapshots (Type 48) into running-order history', () => {
        fs.mkdirSync(tempDir, { recursive: true });
        const standingsVcrPath = path.join(tempDir, 'synthetic_standings.vcr');
        const buf = createSliceVcrBuffer({
          slices: [
            { sTime: 4.0, driverSlot: 1, x: 10, y: 0, z: 10, standings: [2, 1, 3] },
            { sTime: 8.0, driverSlot: 1, x: 20, y: 0, z: 20, standings: [1, 2, 3] },
          ],
        });
        fs.writeFileSync(standingsVcrPath, buf);

        const traj = extractReplayTrajectory(standingsVcrPath, { driverSlot: 1, maxPoints: 10 });
        expect(traj.standingsHistory).toBeDefined();
        expect(traj.standingsHistory?.length).toBe(2);
        expect(traj.standingsHistory?.[0]).toEqual({ timeSec: 4, order: [2, 1, 3] });
        expect(traj.standingsHistory?.[1]).toEqual({ timeSec: 8, order: [1, 2, 3] });
        // sessionRunningOrder reflects the most recent snapshot
        expect(traj.sessionRunningOrder).toEqual([1, 2, 3]);

        fs.unlinkSync(standingsVcrPath);
      });
    });

});
