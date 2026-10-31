import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { defaultVehicleSize } from '../../../../shared/domain/vehicleDimensions.js';

/** Procedural sky/ground reflection probe giving glossy paint and glass realistic exterior reflections. */
function createCarReflectionTexture(): Texture {
  const width = 64, height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    let r = 0, g = 0, b = 0;
    if (v < 0.48) {
      const t = Math.min(1, Math.max(0, v / 0.48));
      // Sky zenith (#7da6cb) to soft horizon (#e1e5e8)
      r = Math.round(125 + (225 - 125) * Math.pow(t, 0.8));
      g = Math.round(166 + (229 - 166) * Math.pow(t, 0.8));
      b = Math.round(203 + (232 - 203) * Math.pow(t, 0.8));
    } else if (v < 0.54) {
      // Horizon band (#e1e5e8)
      r = 225; g = 229; b = 232;
    } else {
      const t = Math.min(1, Math.max(0, (v - 0.54) / 0.46));
      // Ground / road asphalt (#384048 -> #1a2028)
      r = Math.round(56 + (26 - 56) * t);
      g = Math.round(64 + (32 - 64) * t);
      b = Math.round(72 + (40 - 72) * t);
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

let sharedReflectionTexture: Texture | null = null;
export function getCarReflectionTexture(): Texture {
  if (!sharedReflectionTexture) sharedReflectionTexture = createCarReflectionTexture();
  return sharedReflectionTexture;
}

export function makeCar(trajectory: ReplayTrajectoryData, color: string, ghost: boolean, model: Group | null = null, liveryTexture: Texture | null = null): Group {
  const car = new Group(), dimensions = trajectory.vehicleData?.dimensions ?? defaultVehicleSize(trajectory.vehicleIdentity?.carClass);
  const material = new MeshStandardMaterial({ color, transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost, roughness: ghost ? 0.7 : 0.32 });
  const envelope = model ? model.clone(true) : new Group();
  if (model) {
    envelope.traverse(object => {
      if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return;
      const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
      // Each lap owns its buffers, so replacing a lap cannot dispose a cached vehicle template or the other car.
      mesh.geometry = mesh.geometry.clone();
      const hasUv = !!mesh.geometry.attributes.uv;
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const copies = originals.map(source => {
        const copy = source.clone();
        if (copy instanceof MeshStandardMaterial) {
          if (copy.name === 'livery') {
            if (liveryTexture && hasUv) {
              copy.map = liveryTexture;
              copy.color.set(0xffffff);
            } else {
              copy.color.set(color);
            }
            if (!ghost) {
              copy.envMap = getCarReflectionTexture();
              copy.envMapIntensity = 0.45;
              copy.roughness = 0.32;
              copy.metalness = 0.05;
            } else {
              copy.envMap = null;
              copy.roughness = 0.7;
            }
          } else if (copy.name === 'body') {
            copy.color.set(color);
            if (!ghost) {
              copy.envMap = getCarReflectionTexture();
              copy.envMapIntensity = 0.45;
              copy.roughness = 0.32;
              copy.metalness = 0.05;
            } else {
              copy.envMap = null;
              copy.roughness = 0.7;
            }
          } else if (copy.name === 'glass') {
            if (!ghost) {
              copy.envMap = getCarReflectionTexture();
              copy.envMapIntensity = 0.9;
              copy.roughness = 0.1;
              copy.metalness = 0.1;
            } else {
              copy.envMap = null;
              copy.roughness = 0.7;
            }
          }
        }
        copy.transparent = ghost; copy.opacity = ghost ? 0.45 : 1; copy.depthWrite = !ghost;
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? copies : copies[0];
    });
  } else {
    const width = dimensions.widthM, length = dimensions.lengthM;
    const bodyMaterial = new MeshStandardMaterial({
      color,
      transparent: ghost,
      opacity: ghost ? 0.5 : 1,
      depthWrite: !ghost,
      roughness: ghost ? 0.7 : 0.32,
      metalness: ghost ? 0 : 0.05,
      ...(ghost ? {} : {envMap: getCarReflectionTexture(), envMapIntensity: 0.45}),
    });
    bodyMaterial.name = 'body';
    const bodyGeometry = new BoxGeometry(width * 0.78, 0.5, length);
    const body = new Mesh(bodyGeometry, bodyMaterial);
    body.name = 'body';
    body.position.y = 0.2;
    const cabinMaterial = new MeshStandardMaterial({
      color: '#1a2332',
      transparent: ghost,
      opacity: ghost ? 0.5 : 1,
      depthWrite: !ghost,
      roughness: ghost ? 0.7 : 0.1,
      metalness: ghost ? 0 : 0.1,
      ...(ghost ? {} : {envMap: getCarReflectionTexture(), envMapIntensity: 0.9}),
    });
    cabinMaterial.name = 'cabin';
    const cabin = new Mesh(new BoxGeometry(width * 0.55, 0.4, length * 0.37), cabinMaterial);
    cabin.name = 'cabin';
    cabin.position.set(0, 0.62, 0.1);
    const nose = new Mesh(new BoxGeometry(width * 0.6, 0.03, 0.45), new MeshStandardMaterial({color: '#f8f9fa', transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost}));
    nose.position.set(0, 0.46, -length * 0.35); envelope.add(body, cabin, nose);
    envelope.add(...estimatedWheels(trajectory.handlingCalibration?.wheelbaseM ?? length * 0.6, width, ghost));
  }
  const offset = trajectory.vehicleData?.replayOriginOffsetXZ ?? [0, 0];
  envelope.position.set(offset[0], 0, offset[1]);
  const marker = new Mesh(new SphereGeometry(0.65, 12, 8), material); marker.name = 'pose-marker'; marker.visible = false;
  envelope.name = 'body-envelope'; car.add(envelope, marker);
  if (ghost) {
    let order = 1;
    car.traverse(object => {
      if (!(object instanceof Mesh)) return;
      // Camera-distance sorting can swap intersecting transparent body/tyre parts each frame.
      object.renderOrder = order++;
      const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const ghostMaterial of materials) {
        ghostMaterial.polygonOffset = true; ghostMaterial.polygonOffsetFactor = -1; ghostMaterial.polygonOffsetUnits = -1;
        // gl_FragDepth replaces polygonOffset in the perspective logarithmic-depth pass.
        // Give coincident laps 2 cm of depth clearance without shifting either recorded pose;
        // retain depth testing so terrain and walls still occlude the ghost.
        ghostMaterial.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <logdepthbuf_fragment>', `
            #include <logdepthbuf_fragment>
            #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
              if (vIsPerspective != 0.0) {
                gl_FragDepth = log2(max(1.0, vFragDepth - 0.02)) * logDepthBufFC * 0.5;
              }
            #endif
          `);
        };
        ghostMaterial.customProgramCacheKey = () => 'replay-ghost-depth-v1';
      }
    });
  }
  return car;
}

const ESTIMATED_TYRE_RADIUS_M = 0.34, ESTIMATED_TYRE_WIDTH_M = 0.3;

/** Class-sized tyres/rims baked at the four corners, in the same layout as exported game meshes,
 * so the shared wheel rig spins, steers and grounds them. The hexagonal rim makes rotation visible. */
function estimatedWheels(wheelbaseM: number, widthM: number, ghost: boolean): Mesh[] {
  const parts = [
    {name: 'tyres', radius: ESTIMATED_TYRE_RADIUS_M, width: ESTIMATED_TYRE_WIDTH_M, segments: 20, color: '#1b1d22'},
    {name: 'rims', radius: ESTIMATED_TYRE_RADIUS_M * 0.62, width: ESTIMATED_TYRE_WIDTH_M + 0.01, segments: 6, color: '#9aa3ad'},
  ];
  return parts.map(part => {
    const corners: BufferGeometry[] = [];
    for (const z of [-wheelbaseM / 2, wheelbaseM / 2]) for (const x of [1, -1]) {
      const wheel = new CylinderGeometry(part.radius, part.radius, part.width, part.segments).toNonIndexed();
      wheel.rotateZ(Math.PI / 2); wheel.translate(x * (widthM / 2 - ESTIMATED_TYRE_WIDTH_M / 2), 0, z);
      corners.push(wheel);
    }
    const geometry = mergeGeometries(corners); corners.forEach(corner => corner.dispose());
    const mesh = new Mesh(geometry, new MeshStandardMaterial({color: part.color, roughness: 0.8, transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost}));
    mesh.name = part.name;
    return mesh;
  });
}
