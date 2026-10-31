import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {afterEach,describe,it,expect} from 'vitest';
import express from 'express';
import request from 'supertest';
import {DataPlugin,formatPluginStatusLog,parseVehicleCatalog,parseVehicleLogos} from '../../../server/plugins/dataPlugin.js';
import {createDataPluginRouter} from '../../../server/routes/dataPluginRoutes.js';
import {syntheticTrack} from '../../helpers/syntheticTrack.js';
import {TrackGeometryStore} from '../../../server/tracks/trackGeometryStore.js';
import {applyCanonicalProjection,enrichTrajectoryWithTrackGeometry} from '../../../server/tracks/serverTrackSync.js';
import type {ReplayTrajectoryData} from '../../../shared/types/replay.js';
import {trackRevisions} from '../../../server/plugins/trackPackage.js';

const directories:string[]=[];
afterEach(()=>{for(const dir of directories.splice(0))fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
const catalog={schemaVersion:1,coordinates:'local-xz-metres-forward-minus-z',vehicles:[{id:'synthetic',model:'Test Car',carClass:'Hyper',vehicleIds:['TEST_CAR'],dimensions:{lengthM:5,widthM:2},outlineXZ:[[-1,-2.5],[1,-2.5],[1,2.5],[-1,2.5]],replayOriginOffsetXZ:[0,0]}]};
it('accepts bounded physics defaults while rejecting incomplete or inconsistent steering data',()=>{
  const handling={wheelbaseM:3.1,steeringRatio:12,defaultSteeringWheelRangeDeg:480,defaultSteeringLockDeg:20};
  const parse=(value:unknown)=>parseVehicleCatalog({...catalog,vehicles:[{...catalog.vehicles[0],handling:value}]});
  expect(parse(handling)[0].handling).toEqual(handling);
  expect(parse({wheelbaseM:3.1})[0].handling).toEqual({wheelbaseM:3.1});
  for(const value of [{},null,{wheelbaseM:NaN},{wheelbaseM:6},{wheelbaseM:'3'},
    {steeringRatio:12},{...handling,defaultSteeringLockDeg:10},{...handling,source:'private'},
    {...handling,defaultSteeringWheelRangeDeg:Infinity}])expect(()=>parse(value)).toThrow();
});
it('accepts an ascending kW deployment list and rejects malformed ones',()=>{
  const parse=(value:unknown)=>parseVehicleCatalog({...catalog,vehicles:[{...catalog.vehicles[0],deploymentKw:value}]});
  expect(parse([0,40,60,120])[0].deploymentKw).toEqual([0,40,60,120]);
  expect(parseVehicleCatalog(catalog)[0].deploymentKw).toBeUndefined();
  for(const value of [[],[60],[0,20,20],[0,40,20],[0,NaN],[-5,0],[0,600],['20',40],{}])expect(()=>parse(value)).toThrow();
});
function fixture(kind:'vehicles'|'tracks'|'both'='both') {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lmu-plugin-'));directories.push(dir);
  const write=(file:string,value:unknown)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),JSON.stringify(value));};
  const manifest={schemaVersion:1,id:'synthetic',version:'1',...(kind!=='vehicles'?{tracks:{catalog:'tracks/index.json'}}:{}),...(kind!=='tracks'?{vehicles:{catalog:'vehicles/index.json'}}:{})};
  const geometry=syntheticTrack();
  write('manifest.json',manifest);write('tracks/monza_gp.json',geometry);
  write('tracks/index.json',[{layoutKey:'monza_gp',circuitId:'monza',layoutId:'gp',lengthM:geometry.lengthM,pointsCount:geometry.centerline.length}]);
  write('tracks-display/monza_gp.json',{layoutKey:'monza_gp',sourceRevision:geometry.geometryRevision,surfaces:{road:[],kerb:[],runoff:[],pit:[],otherRoad:[]}});
  write('vehicles/index.json',catalog);return {dir,write,manifest,geometry};
}
describe('local data plugin snapshot',()=>{
  it('has explicit absent and invalid states without paths',()=>{expect(new DataPlugin().status.state).toBe('absent');expect(new DataPlugin('/missing').status).toEqual({state:'invalid',revision:'none',tracks:false,vehicles:false});});
  it('formats human-readable startup log indicating if plugins are loaded or not', () => {
    expect(formatPluginStatusLog({ state: 'absent', revision: 'none', tracks: false, vehicles: false }))
      .toBe('[Data Plugin] Plugins loaded: no (LMU_PLUGIN_ROOT not configured)');
    expect(formatPluginStatusLog({ state: 'invalid', revision: 'none', tracks: false, vehicles: false }))
      .toBe('[Data Plugin] Plugins loaded: no (package at LMU_PLUGIN_ROOT is invalid)');
    expect(formatPluginStatusLog({ state: 'ready', revision: '0123456789abcdef', tracks: true, vehicles: true }))
      .toBe('[Data Plugin] Plugins loaded: yes (tracks: yes, vehicles: yes, revision: 01234567)');
    expect(formatPluginStatusLog({ state: 'ready', revision: '0123456789abcdef', tracks: false, vehicles: true }))
      .toBe('[Data Plugin] Plugins loaded: yes (tracks: no, vehicles: yes, revision: 01234567)');
    expect(formatPluginStatusLog({
      state: 'ready',
      revision: '0123456789abcdef',
      tracks: true,
      vehicles: true,
      logos: true,
      scenes: true,
      counts: {
        tracks: 32,
        vehicles: 80,
        logos: 25,
        scenes: 32,
      },
    })).toBe('[Data Plugin] Plugins loaded: yes (tracks: 32, vehicles: 80, logos: 25, scenes: 32, revision: 01234567)');
    const { dir } = fixture('both');
    const plugin = new DataPlugin(dir);
    expect(plugin.status.packageId).toBe('synthetic');
    expect(plugin.status.packageVersion).toBe('1');
    expect(plugin.status.counts).toEqual({ tracks: 1, vehicles: 1 });
    expect(plugin.trackKeys()).toEqual(['monza_gp']);
    expect(formatPluginStatusLog(plugin.status)).toBe(
      `[Data Plugin] Plugins loaded: yes (tracks: 1, vehicles: 1, revision: ${plugin.status.revision.slice(0, 8)})`
    );
  });
  it.each(['vehicles','tracks','both'] as const)('loads %s capabilities independently',kind=>{const {dir}=fixture(kind);const p=new DataPlugin(dir);expect(p.status.state).toBe('ready');expect(p.status.vehicles).toBe(kind!=='tracks');expect(p.status.tracks).toBe(kind!=='vehicles');});
  it('uses exact aliases, unambiguous model fallback and defensive snapshots',()=>{const {dir,write}=fixture();const p=new DataPlugin(dir);expect(p.vehicle({vehicleId:'test_car.veh'})?.model).toBe('Test Car');expect(p.vehicle({carType:'Test Car'})?.id).toBe('synthetic');expect(p.vehicle({carType:'Unknown'})).toBeNull();p.vehicles()[0].model='Changed';expect(p.vehicles()[0].model).toBe('Test Car');write('vehicles/index.json',{});expect(p.vehicle({vehicleId:'TEST_CAR'})?.id).toBe('synthetic');expect(new DataPlugin(dir).status.state).toBe('invalid');});
  it('shares a deployment list across model variants only when they agree',()=>{
    const {dir,write}=fixture('vehicles');const car={...catalog.vehicles[0],deploymentKw:[0,20,40]};
    write('vehicles/index.json',{...catalog,vehicles:[car,{...car,id:'variant',vehicleIds:['TEST_VARIANT']}]});
    expect(new DataPlugin(dir).deploymentKw({carType:'Test Car',carClass:'Hyper'})).toEqual([0,20,40]);
    expect(new DataPlugin(dir).deploymentKw({carType:'Test Car',carClass:'GT3'})).toBeNull();
    write('vehicles/index.json',{...catalog,vehicles:[car,{...car,id:'variant',vehicleIds:['TEST_VARIANT'],deploymentKw:[0,10,20]}]});
    expect(new DataPlugin(dir).deploymentKw({carType:'Test Car',carClass:'Hyper'})).toBeNull();
    write('vehicles/index.json',{...catalog,vehicles:[car,{...catalog.vehicles[0],id:'variant',vehicleIds:['TEST_VARIANT']}]});
    expect(new DataPlugin(dir).deploymentKw({carType:'Test Car',carClass:'Hyper'})).toBeNull();
  });
  it('does not choose arbitrary model variants',()=>{const {dir,write}=fixture('vehicles');write('vehicles/index.json',{...catalog,vehicles:[...catalog.vehicles,{...catalog.vehicles[0],id:'variant',vehicleIds:['TEST_VARIANT']}]});const p=new DataPlugin(dir);expect(p.vehicle({carType:'Test Car'})).toBeNull();expect(p.vehicle({vehicleId:'TEST_VARIANT'})?.id).toBe('variant');});
  it.each(['../outside.json','C:/outside.json','vehicles\\index.json'])('rejects resource escape %s',file=>{const {dir,write,manifest}=fixture('vehicles');write('manifest.json',{...manifest,vehicles:{catalog:file}});expect(new DataPlugin(dir).status.state).toBe('invalid');});
  it('rejects junction escapes and stale display pairs',()=>{const a=fixture('vehicles'),b=fixture('vehicles');fs.symlinkSync(path.join(b.dir,'vehicles'),path.join(a.dir,'escape'),'junction');a.write('manifest.json',{...a.manifest,vehicles:{catalog:'escape/index.json'}});expect(new DataPlugin(a.dir).status.state).toBe('invalid');const c=fixture();c.write('tracks-display/monza_gp.json',{layoutKey:'monza_gp',sourceRevision:'old',surfaces:{road:[],kerb:[],runoff:[],pit:[],otherRoad:[]}});expect(new DataPlugin(c.dir).status.state).toBe('invalid');});
  it('rejects malformed dimensions, polygons, aliases and unknown payload fields',()=>{
    for(const record of [{...catalog.vehicles[0],dimensions:{lengthM:NaN,widthM:2}},{...catalog.vehicles[0],outlineXZ:[[-1,-2.5],[1,2.5],[1,-2.5],[-1,2.5]]},{...catalog.vehicles[0],source:'private'}])expect(()=>parseVehicleCatalog({...catalog,vehicles:[record]})).toThrow();
    expect(()=>parseVehicleCatalog({...catalog,vehicles:[...catalog.vehicles,{...catalog.vehicles[0],id:'second'}]})).toThrow();
  });
  it('rejects changed content under old revisions and unsupported track fields',()=>{
    const a=fixture('tracks');a.write('tracks/monza_gp.json',{...a.geometry,lengthM:a.geometry.lengthM+1});expect(new DataPlugin(a.dir).status.state).toBe('invalid');
    const b=fixture('tracks');b.write('tracks/monza_gp.json',{...b.geometry,source:'private'});expect(new DataPlugin(b.dir).status.state).toBe('invalid');
  });
  it.each(['collapsed','duplicate','length'] as const)('rejects a correctly hashed but unusable route (%s)',kind=>{
    const {dir,write,geometry}=fixture('tracks');
    if(kind==='collapsed') geometry.centerline=geometry.centerline.map(()=>[0,0]);
    if(kind==='duplicate') geometry.centerline[1]=[...geometry.centerline[0]];
    if(kind==='length') geometry.lengthM+=100;
    Object.assign(geometry,trackRevisions(geometry as unknown as Record<string,unknown>));
    write('tracks/monza_gp.json',geometry);
    write('tracks/index.json',[{layoutKey:geometry.layoutKey,circuitId:geometry.circuitId,layoutId:geometry.layoutId,lengthM:geometry.lengthM,pointsCount:geometry.centerline.length}]);
    write('tracks-display/monza_gp.json',{layoutKey:geometry.layoutKey,sourceRevision:geometry.geometryRevision,surfaces:{road:[],kerb:[],runoff:[],pit:[],otherRoad:[]}});
    const plugin=new DataPlugin(dir);
    expect(plugin.status.state).toBe('invalid');
    expect(plugin.track(geometry.layoutKey)).toBeNull();
  });
  it('feeds the same metric geometry into banking and kerb enrichment while missing profiles remain null',()=>{
    const {dir}=fixture();const p=new DataPlugin(dir),store=new TrackGeometryStore(key=>p.trackGeometry(key)),definition=store.get('monza_gp')!;
    const shared = p.trackGeometry('monza_gp')!;
    expect(definition.centerline).toBe(shared.centerline);
    expect(definition.surfaceProfile).toBe(shared.surfaceProfile);
    expect(Object.isFrozen(shared.centerline[0])).toBe(true);
    expect(() => { shared.centerline[0][0] = 42; }).toThrow(TypeError);
    const publicCopy = p.track('monza_gp')!;
    publicCopy.geometry.centerline[0][0] = 42;
    expect(shared.centerline[0][0]).not.toBe(42);
    const trajectory:ReplayTrajectoryData={replayName:'Test.Vcr',pointsCount:2,points:definition.centerline.slice(2,4).map(([x,z],i)=>({x,y:0,z,timeSec:i})),bounds:definition.bounds};
    applyCanonicalProjection(trajectory,definition);expect(trajectory.stationSource).toBe('track');expect(trajectory.points[0].roadBankDeg).toBe(3);expect(trajectory.points[0].leftKerbWidthM).toBe(1);expect(trajectory.points[0].rightKerbWidthM).toBeNull();
    const without=enrichTrajectoryWithTrackGeometry(trajectory,'Unknown','Unknown');expect(without.stationSource).toBe('odometer');expect(without.points[0].roadBankDeg).toBeUndefined();expect(without.points[0].leftRoadDistanceM).toBeUndefined();
  });
  it('serves validated payloads without a local caller restriction and does not expose package files',async()=>{
    const {dir}=fixture();const app=express();app.use('/api/data-plugin',createDataPluginRouter(new DataPlugin(dir)));
    expect((await request(app).get('/api/data-plugin/tracks/monza_gp')).body).toHaveProperty('geometry.layoutKey', 'monza_gp');
    expect((await request(app).get('/api/data-plugin/tracks/monza_gp').set('Host','app.example')).status).toBe(200);
    expect((await request(app).get('/api/data-plugin/tracks/monza_gp').set('Origin','https://app.example')).status).toBe(200);
    expect((await request(app).get('/api/data-plugin/manifest.json')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/tracks/unknown')).status).toBe(404);
  });
  it('loads and serves optional vehicle logos catalog', async () => {
    const { dir, write, manifest } = fixture('vehicles');
    const svgContent = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    write('vehicles/logos.json', { schemaVersion: 1, logos: { Ferrari: svgContent } });
    write('manifest.json', { ...manifest, vehicles: { ...manifest.vehicles, logos: 'vehicles/logos.json' } });
    const plugin = new DataPlugin(dir);
    expect(plugin.status.logos).toBe(true);
    expect(plugin.logo('Ferrari')).toBe(svgContent);
    expect(plugin.logo('Porsche')).toBeNull();
    expect(plugin.logos()).toEqual({ Ferrari: svgContent });

    const app = express();
    app.use('/api/data-plugin', createDataPluginRouter(plugin));
    const res = await request(app).get('/api/data-plugin/vehicles/logos');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logos.Ferrari', svgContent);
    // Invalid entries are skipped, never thrown
    expect(parseVehicleLogos({ schemaVersion: 1, logos: { Ferrari: 'not an svg', Audi: svgContent } })).toEqual({ Audi: svgContent });
    expect(parseVehicleLogos({ schemaVersion: 2, logos: {} })).toEqual({});
    expect(parseVehicleLogos({ schemaVersion: 1, logos: { 'invalid/key': svgContent } })).toEqual({});
    expect(parseVehicleLogos('garbage')).toEqual({});
  });
  it('keeps tracks and vehicles ready when a logo is invalid', () => {
    const { dir, write, manifest } = fixture('both');
    const svgContent = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    write('vehicles/logos.json', { schemaVersion: 1, logos: { Ferrari: svgContent, 'bad/key': svgContent, Porsche: 'not an svg' } });
    write('manifest.json', { ...manifest, vehicles: { ...manifest.vehicles, logos: 'vehicles/logos.json' } });
    const plugin = new DataPlugin(dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status.tracks).toBe(true);
    expect(plugin.vehicles()).toHaveLength(1);
    expect(plugin.logos()).toEqual({ Ferrari: svgContent });
  });
  it('keeps tracks and vehicles ready when the logos file is malformed or missing', () => {
    const { dir, manifest } = fixture('both');
    fs.mkdirSync(path.join(dir, 'vehicles'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'vehicles/logos.json'), '{not json');
    const withLogos = { ...manifest, vehicles: { ...manifest.vehicles, logos: 'vehicles/logos.json' } };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(withLogos));
    const broken = new DataPlugin(dir);
    expect(broken.status.state).toBe('ready');
    expect(broken.status.logos).toBeUndefined();
    expect(broken.logos()).toEqual({});
    fs.rmSync(path.join(dir, 'vehicles/logos.json'));
    expect(new DataPlugin(dir).status.state).toBe('ready');
  });
  it('still rejects a logos path escaping the package', () => {
    const { dir, manifest } = fixture('both');
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...manifest, vehicles: { ...manifest.vehicles, logos: '../logos.json' } }));
    expect(new DataPlugin(dir).status.state).toBe('invalid');
  });
  it('serves vehicle wheels metadata and assets over HTTP', async () => {
    const { dir, write } = fixture('both');
    const makeWebp = (marker: number) => {
      const buf = Buffer.alloc(30);
      buf.write('RIFF', 0, 'ascii');
      buf.writeUInt32LE(buf.length - 8, 4);
      buf.write('WEBP', 8, 'ascii');
      buf.write('VP8 ', 12, 'ascii');
      buf.writeUInt32LE(10, 16);
      buf.writeUInt8(marker, 20);
      return buf;
    };
    const rimBytes = makeWebp(1);
    const tyreBytes = makeWebp(2);
    const rimSha = crypto.createHash('sha256').update(rimBytes).digest('hex');
    const tyreSha = crypto.createHash('sha256').update(tyreBytes).digest('hex');
    fs.mkdirSync(path.join(dir, 'vehicle-wheels'), { recursive: true });
    fs.writeFileSync(path.join(dir, `vehicle-wheels/${rimSha}.webp`), rimBytes);
    fs.writeFileSync(path.join(dir, `vehicle-wheels/${tyreSha}.webp`), tyreBytes);

    const wheelsCatalog = [
      {
        vehicleRecordId: 'synthetic',
        rim: { asset: `vehicle-wheels/${rimSha}.webp`, sha256: rimSha, byteLength: rimBytes.length, width: 1024, height: 1024 },
        tyre: { asset: `vehicle-wheels/${tyreSha}.webp`, sha256: tyreSha, byteLength: tyreBytes.length, width: 1024, height: 1024 },
      },
    ];
    write('vehicle-wheels/index.json', wheelsCatalog);

    const manifestV2 = {
      schemaVersion: 2,
      id: 'synthetic-v2',
      version: '2',
      tracks: { catalog: 'tracks/index.json' },
      vehicles: { catalog: 'vehicles/index.json' },
      vehicleWheels: { catalog: 'vehicle-wheels/index.json' },
    };
    write('manifest.json', manifestV2);

    const plugin = new DataPlugin(dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status.vehicleWheels).toBe(true);
    expect(plugin.status.counts?.vehicleWheels).toBe(1);

    const resolved = plugin.vehicleWheels('synthetic');
    expect(resolved?.vehicleRecordId).toBe('synthetic');
    expect(resolved?.rim.sha256).toBe(rimSha);
    expect(resolved?.tyre.sha256).toBe(tyreSha);

    const app = express();
    app.use('/api/data-plugin', createDataPluginRouter(plugin));

    const metaRes = await request(app).get('/api/data-plugin/vehicle-wheels/synthetic');
    expect(metaRes.status).toBe(200);
    const metaBody = metaRes.body as { vehicleRecordId: string; rim: { sha256: string } };
    expect(metaBody.vehicleRecordId).toBe('synthetic');
    expect(metaBody.rim.sha256).toBe(rimSha);

    const assetRes = await request(app).get(`/api/data-plugin/vehicle-wheels/${rimSha}/asset`);
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers['content-type']).toContain('image/webp');
    expect(assetRes.headers['x-content-type-options']).toBe('nosniff');
    expect(assetRes.body).toEqual(rimBytes);

    const missingRes = await request(app).get('/api/data-plugin/vehicle-wheels/unknown');
    expect(missingRes.status).toBe(404);
  });
});
