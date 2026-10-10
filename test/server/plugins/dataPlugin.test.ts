import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
const catalog={schemaVersion:1,coordinates:'local-xz-metres-forward-minus-z',vehicles:[{id:'synthetic',model:'Test Car',carClass:'LMH',vehicleIds:['TEST_CAR'],dimensions:{lengthM:5,widthM:2},outlineXZ:[[-1,-2.5],[1,-2.5],[1,2.5],[-1,2.5]],replayOriginOffsetXZ:[0,0]}]};
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
  });
  it.each(['vehicles','tracks','both'] as const)('loads %s capabilities independently',kind=>{const {dir}=fixture(kind);const p=new DataPlugin(dir);expect(p.status.state).toBe('ready');expect(p.status.vehicles).toBe(kind!=='tracks');expect(p.status.tracks).toBe(kind!=='vehicles');});
  it('uses exact aliases, unambiguous model fallback and defensive snapshots',()=>{const {dir,write}=fixture();const p=new DataPlugin(dir);expect(p.vehicle({vehicleId:'test_car.veh'})?.model).toBe('Test Car');expect(p.vehicle({carModel:'Test Car'})?.id).toBe('synthetic');expect(p.vehicle({carModel:'Unknown'})).toBeNull();p.vehicles()[0].model='Changed';expect(p.vehicles()[0].model).toBe('Test Car');write('vehicles/index.json',{});expect(p.vehicle({vehicleId:'TEST_CAR'})?.id).toBe('synthetic');expect(new DataPlugin(dir).status.state).toBe('invalid');});
  it('does not choose arbitrary model variants',()=>{const {dir,write}=fixture('vehicles');write('vehicles/index.json',{...catalog,vehicles:[...catalog.vehicles,{...catalog.vehicles[0],id:'variant',vehicleIds:['TEST_VARIANT']}]});const p=new DataPlugin(dir);expect(p.vehicle({carModel:'Test Car'})).toBeNull();expect(p.vehicle({vehicleId:'TEST_VARIANT'})?.id).toBe('variant');});
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
    expect((await request(app).get('/api/data-plugin/status')).body.state).toBe('ready');
    expect((await request(app).get('/api/data-plugin/tracks/monza_gp')).body.geometry.layoutKey).toBe('monza_gp');
    expect((await request(app).get('/api/data-plugin/status').set('Host','app.example')).status).toBe(200);
    expect((await request(app).get('/api/data-plugin/status').set('Origin','https://app.example')).status).toBe(200);
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
    expect(res.body.logos.Ferrari).toBe(svgContent);
    // The vehicle list does not carry the logos.
    const list = await request(app).get('/api/data-plugin/vehicles');
    expect(list.status).toBe(200);
    expect(list.body).not.toHaveProperty('logos');
    expect(list.body.vehicles).toBeDefined();

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
});
