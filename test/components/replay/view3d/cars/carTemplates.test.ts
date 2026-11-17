import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import { createCarTemplates } from '../../../../../src/components/replay/view3d/cars/carTemplates.js';

/** A parsed file: a chassis node holding one part. */
function parsed(part: string): {scene: Group} {
  const scene = new Group(), chassis = new Group(), mesh = new Mesh(new BoxGeometry(2, 1, 4), new MeshStandardMaterial());
  chassis.name = 'chassis'; mesh.name = part; chassis.add(mesh); scene.add(chassis);
  return {scene};
}

const exterior = new ArrayBuffer(1), interior = new ArrayBuffer(2);
const body = (vehicleId: string, withInterior: boolean) => ({
  vehicleId,
  resource: {sha256: 'body', full: {sha256: 'full'}, interior: withInterior ? {sha256: 'cabin'} : null},
  files: vi.fn(async () => ({bytes: exterior, interiorBytes: withInterior ? interior : null})),
}) as unknown as LoadedBody & {files: ReturnType<typeof vi.fn>};

afterEach(() => { vi.restoreAllMocks(); });

describe('createCarTemplates', () => {
  it('parses a body once for every livery and loader, joining its interior under the chassis', async () => {
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async bytes => parsed(bytes === interior ? 'dash' : 'hull') as never);
    const templates = createCarTemplates(), first = body('A', true), second = body('B', true);
    const [a, b] = await Promise.all([templates.body(first), templates.body(second)]);
    expect(a).toBe(b);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(second.files).not.toHaveBeenCalled();
    const chassis = a.getObjectByName('chassis')!;
    expect(chassis.children.map(child => child.name)).toEqual(['hull', 'dash']);
    // Each part's box in the body's frame, for the contact shadow once its vertices are gone.
    expect(a.getObjectByName('hull')!.userData.footprint).toEqual([-1, -0.5, -2, 1, 0.5, 2]);
  });

  it('parses the file again once a parse settles, unless the body is held', async () => {
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => parsed('hull') as never);
    const templates = createCarTemplates(), car = body('A', false);
    const first = await templates.body(car);
    expect(await templates.body(car)).not.toBe(first);
    expect(parse).toHaveBeenCalledTimes(2);
    templates.hold(car);
    const kept = await templates.body(car);
    expect(await templates.body(car)).toBe(kept);
    expect(parse).toHaveBeenCalledTimes(3);
    templates.release(car);
    expect(await templates.body(car)).not.toBe(kept);
  });

  it('parses the full level for a car drawn at full detail alone, unless the whole body is held or parsing', async () => {
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => parsed('hull') as never);
    const templates = createCarTemplates(), car = body('A', false);
    const full = await templates.body(car, true);
    expect(car.files).toHaveBeenLastCalledWith(true);
    // Its own parse: the field's cars of the body read the whole exterior.
    expect(await templates.body(car)).not.toBe(full);
    expect(car.files).toHaveBeenLastCalledWith(false);
    templates.hold(car);
    const whole = await templates.body(car);
    car.files.mockClear();
    expect(await templates.body(car, true)).toBe(whole);
    expect(car.files).not.toHaveBeenCalled();
  });

  it('forgets a failed parse, so the next car tries again', async () => {
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockRejectedValueOnce(Error('bad file')).mockResolvedValue(parsed('hull') as never);
    const templates = createCarTemplates();
    await expect(templates.body(body('A', false))).rejects.toThrow('bad file');
    await expect(templates.body(body('A', false))).resolves.toBeInstanceOf(Group);
  });

  it('throws for an interior without a chassis node', async () => {
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async bytes => (bytes === interior ? {scene: new Group()} : parsed('hull')) as never);
    await expect(createCarTemplates().body(body('A', true))).rejects.toThrow(/no chassis node/);
  });
});
