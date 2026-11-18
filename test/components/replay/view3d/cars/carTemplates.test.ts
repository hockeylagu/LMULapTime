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
  resource: {sha256: 'body', interior: withInterior ? {sha256: 'cabin'} : null},
  file: vi.fn(async () => exterior),
  interiorFile: vi.fn(async () => (withInterior ? interior : null)),
}) as unknown as LoadedBody & {file: ReturnType<typeof vi.fn>; interiorFile: ReturnType<typeof vi.fn>};

const parts = (model: Group) => model.getObjectByName('chassis')!.children.map(child => child.name);

afterEach(() => { vi.restoreAllMocks(); });

describe('createCarTemplates', () => {
  it('parses a body once for every livery and loader, without its interior file', async () => {
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async bytes => parsed(bytes === interior ? 'dash' : 'hull') as never);
    const templates = createCarTemplates(), first = body('A', true), second = body('B', true);
    const [a, b] = await Promise.all([templates.body(first), templates.body(second)]);
    expect(a).toBe(b);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(second.file).not.toHaveBeenCalled();
    expect(first.interiorFile).not.toHaveBeenCalled();
    expect(parts(a)).toEqual(['hull']);
    // Each part's box in the body's frame, for the contact shadow once its vertices are gone.
    expect(a.getObjectByName('hull')!.userData.footprint).toEqual([-1, -0.5, -2, 1, 0.5, 2]);
  });

  it("builds a cabin from the exterior's parts marked interior and the interior file's, leaving the parses as they were", async () => {
    const outside = parsed('hull'), chassis = outside.scene.getObjectByName('chassis')!;
    // A seat marked interior with a level of it drawn from 20 m, and a mirror marked interior on the body's root.
    const seat = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()), farSeat = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    seat.name = 'seat'; seat.userData.interior = true; farSeat.name = 'far seat'; farSeat.userData.lod = {inM: 20, outM: null}; seat.add(farSeat); chassis.add(seat);
    const mirror = new Group(); mirror.name = 'mirror'; mirror.userData.interior = true; outside.scene.add(mirror);
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async bytes => (bytes === interior ? parsed('dash') : outside) as never);
    const templates = createCarTemplates(), car = body('A', true);
    templates.hold(car);
    const whole = await templates.body(car), cabin = await templates.cabin(car);
    expect(car.file).toHaveBeenCalledTimes(1);
    expect(car.interiorFile).toHaveBeenCalledTimes(1);
    expect(cabin.children.map(part => [part.name, part.userData.cabinParent as unknown, part.userData.interior as unknown])).toEqual([
      ['seat', 'chassis', true], ['mirror', null, true], ['dash', 'chassis', true],
    ]);
    expect(cabin.getObjectByName('far seat')).toBeUndefined();
    expect(cabin.getObjectByName('dash')!.userData.footprint).toEqual([-1, -0.5, -2, 1, 0.5, 2]);
    expect(parts(whole)).toEqual(['hull', 'seat']);
    expect(whole.getObjectByName('far seat')).toBeDefined();
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

  it("keeps the parses of the car the cameras ride on until another car's cabin, so the next view builds it without a parse", async () => {
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async bytes => parsed(bytes === interior ? 'dash' : 'hull') as never);
    const templates = createCarTemplates(), car = body('A', true);
    await templates.cabin(car);
    expect(parse).toHaveBeenCalledTimes(2);
    // The next view's car of that body: its exterior and its cabin from the kept parses.
    const kept = await templates.body(car);
    await templates.cabin(car);
    expect(await templates.body(car)).toBe(kept);
    expect(parse).toHaveBeenCalledTimes(2);
    // Another car takes the cameras: the first one's parses go.
    const other = {...body('B', false), resource: {sha256: 'other', interior: null}} as unknown as LoadedBody;
    await templates.cabin(other);
    expect(await templates.body(car)).not.toBe(kept);
    expect(parse).toHaveBeenCalledTimes(4);
  });

  it('forgets a failed parse, so the next car tries again', async () => {
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockRejectedValueOnce(Error('bad file')).mockResolvedValue(parsed('hull') as never);
    const templates = createCarTemplates();
    await expect(templates.body(body('A', false))).rejects.toThrow('bad file');
    await expect(templates.body(body('A', false))).resolves.toBeInstanceOf(Group);
  });

  it('throws for an interior without a chassis node', async () => {
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async bytes => (bytes === interior ? {scene: new Group()} : parsed('hull')) as never);
    await expect(createCarTemplates().cabin(body('A', true))).rejects.toThrow(/no chassis node/);
  });
});
