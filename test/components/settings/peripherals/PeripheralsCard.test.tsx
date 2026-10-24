import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PeripheralsCard } from '../../../../src/components/settings/peripherals/PeripheralsCard.js';
import { PeripheralStatusChip } from '../../../../src/components/live/PeripheralStatusChip.js';
import { LiveSessionBar } from '../../../../src/components/live/LiveSessionBar.js';
import { PresetMappingTable } from '../../../../src/components/settings/peripherals/PresetMappingTable.js';
import { fetchPeripherals, fetchPresetCatalog, fetchPresetMappings, refreshPeripheralHealth } from '../../../../src/api/peripheralsApi.js';
import type { PeripheralStatus } from '../../../../shared/types/peripherals/peripherals.js';
import { liveSnapshot } from '../../../helpers/liveSnapshot.js';

vi.mock('../../../../src/api/peripheralsApi.js', () => ({ fetchPeripherals: vi.fn(), refreshPeripheralHealth: vi.fn(), fetchLoadedPresets: vi.fn(async () => ({ devices: [], observedAt: 0 })), fetchPresetCatalog: vi.fn(async () => null), fetchPresetMappings: vi.fn(async () => ({ cars: [], mappings: [] })) }));
const status: PeripheralStatus = { id: 'simagic', label: 'Simagic', install: 'not-installed', error: null, settings: { enabled: false, automatic: true, wheel: null }, health: null, observedAt: null, devices: [], lastRun: null, car: null, target: null, currentLoad: { key: '', generation: 0, phase: 'idle', skipReason: null }, busy: false, applyBlockedReason: null };
afterEach(cleanup);
describe('peripheral interface', () => {
  it('explains optional installation and disables unavailable enablement', async () => {
    vi.mocked(fetchPeripherals).mockResolvedValue([status]);
    render(<PeripheralsCard />);
    expect(await screen.findByText('Simagic plugin is not installed')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Enable plugin' })).toBeDisabled();
  });
  it('shows passive dashboard health on idle screens only and hides it once in a session', async () => {
    vi.mocked(fetchPeripherals).mockResolvedValue([{ ...status, install: 'ready', settings: { ...status.settings, enabled: true }, health: { api: 'unavailable', process: 'absent' } }]);
    const { rerender } = render(<LiveSessionBar snapshot={liveSnapshot({ lifecycle: 'menu', session: null })} connection="live" peripherals={<PeripheralStatusChip />} />);
    const chip = await screen.findByText('SimPro is not running');
    expect(chip).toHaveClass('text-[36px]', 'font-semibold');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<LiveSessionBar snapshot={liveSnapshot({ lifecycle: 'loading', session: null })} connection="live" peripherals={<PeripheralStatusChip />} />);
    expect(screen.getByText('SimPro is not running')).toBeInTheDocument();
    for (const lifecycle of ['garage', 'starting', 'driving', 'finished'] as const) {
      rerender(<LiveSessionBar snapshot={liveSnapshot({ lifecycle })} connection="live" peripherals={<PeripheralStatusChip />} />);
      expect(screen.queryByText('SimPro is not running')).not.toBeInTheDocument();
    }
  });
  it('requires saving a Suggest preview before persisting assignments', async () => {
    const save = vi.fn();
    const car = { model: 'Ferrari 296 LMGT3', carClass: 'GT3', aliases: [] };
    render(<PresetMappingTable data={{ cars: [car], mappings: [] }} catalog={null} busy={false} suggestions={[{ car, scopeKind: 'model', scopeKey: car.model, presetUuid: '123', presetName: 'GT3 296', reason: 'Matched GT3 296' }, { car: { ...car, model: 'Ferrari 499P', carClass: 'Hyper' }, scopeKind: 'model', scopeKey: 'Ferrari 499P', presetUuid: null, presetName: null, reason: 'No match' }]} onSave={save} onSuggest={vi.fn()} onDismiss={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getByText('1 of 2 cars matched an LMU preset. Review, then save.')).toBeInTheDocument();
    expect(screen.getByText(/No confident match \(1\): Ferrari 499P/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save suggested mappings' }));
    await waitFor(() => { expect(save).toHaveBeenCalledWith([{ scopeKind: 'model', scopeKey: car.model, presetUuid: '123' }]); });
  });
  it('shows and saves a class default suggestion under its class label', async () => {
    const save = vi.fn();
    const car = { model: 'Oreca 07', carClass: 'LMP2_ELMS', aliases: [] };
    render(<PresetMappingTable data={{ cars: [car], mappings: [] }} catalog={null} busy={false} suggestions={[{ car, scopeKind: 'class', scopeKey: 'LMP2_ELMS', presetUuid: '11', presetName: 'LMP2 ELMS', reason: 'Matched LMP2 ELMS' }]} onSave={save} onSuggest={vi.fn()} onDismiss={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['LMP2 (ELMS) default →: LMP2 ELMS']);
    fireEvent.click(screen.getByRole('button', { name: 'Save suggested mappings' }));
    await waitFor(() => { expect(save).toHaveBeenCalledWith([{ scopeKind: 'class', scopeKey: 'LMP2_ELMS', presetUuid: '11' }]); });
  });
  it('lists the presets that no saved assignment or suggestion gives a car, after the matches', () => {
    const preset = (presetUuid: string, name: string) => ({ presetUuid, name, tags: ['lmu'], official: false, active: false, available: true });
    const catalog = { device: { productUuid: '1', deviceUuid: '2', name: 'GT NEO' }, presets: [preset('1', 'GT3 296'), preset('2', 'HYP Peugeot'), preset('3', 'LMP2 WEC')], refreshedAt: null, lastError: null };
    const mappings = [{ scopeKind: 'class' as const, scopeKey: 'LMP2', productUuid: '1', deviceUuid: '2', presetUuid: '3', broken: false }];
    const car = { model: 'Ferrari 296 LMGT3', carClass: 'GT3', aliases: [] };
    render(<PresetMappingTable data={{ cars: [car], mappings }} catalog={catalog} busy={false} suggestions={[{ car, scopeKind: 'model', scopeKey: car.model, presetUuid: '1', presetName: 'GT3 296', reason: 'Matched GT3 296' }]} onSave={vi.fn()} onSuggest={vi.fn()} onDismiss={vi.fn()} onApply={vi.fn()} />);
    const rows = screen.getAllByRole('listitem').map(item => item.textContent);
    expect(rows).toEqual(['Ferrari 296 LMGT3 →: GT3 296', 'No car →: HYP Peugeot']);
  });
  it('lists unassigned presets inside the collapsed assignments', async () => {
    const preset = (presetUuid: string, name: string) => ({ presetUuid, name, tags: ['lmu'], official: false, active: false, available: true });
    const device = { productUuid: '1', deviceUuid: '2', name: 'GT NEO' };
    const catalog = { device, presets: [preset('1', 'GT3 296'), preset('2', 'HYP Peugeot'), preset('3', 'LMP2 WEC')], refreshedAt: null, lastError: null };
    const mappings = [{ scopeKind: 'model' as const, scopeKey: 'Ferrari 296 LMGT3', productUuid: '1', deviceUuid: '2', presetUuid: '1', broken: false }, { scopeKind: 'class' as const, scopeKey: 'LMP2', productUuid: '1', deviceUuid: '2', presetUuid: '3', broken: false }];
    const enabled = { ...status, install: 'ready' as const, settings: { ...status.settings, enabled: true, wheel: device } };
    vi.mocked(fetchPeripherals).mockResolvedValue([enabled]);
    vi.mocked(refreshPeripheralHealth).mockResolvedValue(enabled);
    vi.mocked(fetchPresetCatalog).mockResolvedValue(catalog);
    vi.mocked(fetchPresetMappings).mockResolvedValue({ cars: [], mappings });
    render(<PeripheralsCard />);
    const notice = await screen.findByText('1 preset is not assigned to a car or class default');
    const details = screen.getByText('Car profile assignments').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toContainElement(notice);
    expect(within(notice.closest('[role="status"]') as HTMLElement).getByText('HYP Peugeot')).toBeInTheDocument();
    expect(screen.getByText('Loaded presets')).toBeVisible();
    expect(screen.queryByText('Current session')).not.toBeInTheDocument();
    expect(screen.queryByText('Session switching')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review assignments' })).not.toBeInTheDocument();
  });
});
