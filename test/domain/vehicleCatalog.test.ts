import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {setVehicleCatalog,mapVehicleIdToModel,mapVehicleIdToClass,resolveRosterVehicles,normalizeLmuCarClass} from '../../shared/domain/vehicleMapping.js';
describe('local vehicle identities',()=>{
  beforeEach(()=>setVehicleCatalog([{model:'Synthetic Prototype',carClass:'LMP3',vehicleIds:['TEST_SHARED_TEAM_A']},{model:'Synthetic GT',carClass:'LMGT3',vehicleIds:['TEST_SHARED_TEAM_B']}]));
  afterEach(()=>setVehicleCatalog([]));
  it('uses exact local aliases independently of shared team tokens',()=>{expect(mapVehicleIdToModel('test_shared_team_a.veh')).toBe('Synthetic Prototype');expect(mapVehicleIdToClass('TEST_SHARED_TEAM_A')).toBe('LMP3');expect(mapVehicleIdToClass('TEST_SHARED_TEAM_B')).toBe('LMGT3');});
  it('retains generic model tokens and leaves unknown IDs unresolved',()=>{expect(mapVehicleIdToModel('TEST_499P')).toBe('Ferrari 499P');expect(mapVehicleIdToModel('TEST_UNKNOWN')).toBe('TEST_UNKNOWN');expect(mapVehicleIdToClass('TEST_UNKNOWN')).toBe('');});
  it('keeps log-derived classification available without a local alias',()=>{expect(normalizeLmuCarClass('LMP2_ELMS')).toBe('LMP2elms');const roster={drivers:[{name:'Test Driver',vehicleId:'TEST_UNKNOWN'}]};resolveRosterVehicles(roster,[{name:'Test Driver',carType:'Test Model',carClass:'GTE'}]);expect(roster.drivers[0]).toMatchObject({carModel:'Test Model',carClass:'GTE'});});
});
