import fs from 'fs';
import path from 'path';
import { LmuParser, computeProgression, computeTrackSummaries } from './parser.js';
import { formatTime } from '../src/utils/formatters.js';

const RESULTS_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\LOG\\Results';
const REPLAYS_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';

console.log('--- Testing LMU Session Parser ---');
console.log(`Results Dir: ${RESULTS_DIR}`);
console.log(`Replays Dir: ${REPLAYS_DIR}`);

const parser = new LmuParser(REPLAYS_DIR);

if (!fs.existsSync(RESULTS_DIR)) {
  console.error('Results directory not found!');
  process.exit(1);
}

const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.xml'));
console.log(`Found ${files.length} XML result files.`);

const parsedSessions = [];
let sampleSession = null;

for (const f of files.slice(0, 50)) { // test first 50 files
  const filePath = path.join(RESULTS_DIR, f);
  const session = parser.parseSessionXml(filePath);
  if (session) {
    parsedSessions.push(session);
    if (!sampleSession && session.drivers.length > 0 && session.bestSessionLap) {
      sampleSession = session;
    }
  }
}

console.log(`Successfully parsed ${parsedSessions.length} sessions.`);

if (sampleSession) {
  console.log('\n--- Sample Parsed Session ---');
  console.log(`Filename: ${sampleSession.filename}`);
  console.log(`Track: ${sampleSession.trackVenue}`);
  console.log(`Date: ${sampleSession.timeString}`);
  console.log(`Session Type: ${sampleSession.sessionType} (${sampleSession.sessionName})`);
  console.log(`Drivers Count: ${sampleSession.driversCount}`);
  if (sampleSession.bestSessionLap) {
    console.log(`Best Lap: ${sampleSession.bestSessionLap.driverName} - ${sampleSession.bestSessionLap.lapTimeString} (${sampleSession.bestSessionLap.carType})`);
  }
  if (sampleSession.playerDriver) {
    const p = sampleSession.playerDriver;
    console.log(`Player Driver: ${p.name} | Car: ${p.carType}`);
    console.log(`Best Lap: ${p.bestLapTimeString} | S1: ${formatTime(p.bestS1)} | S2: ${formatTime(p.bestS2)} | S3: ${formatTime(p.bestS3)}`);
    console.log(`Theoretical Best: ${p.theoreticalBestString}`);
    console.log(`Total Laps: ${p.lapsCount}`);
  }
}

const progression = computeProgression(parsedSessions);
console.log(`\nComputed ${progression.length} progression data points over time.`);

const trackSummaries = computeTrackSummaries(parsedSessions);
console.log(`Found tracks: ${Object.keys(trackSummaries).join(', ')}`);

console.log('\n--- Test Completed Successfully ---');
