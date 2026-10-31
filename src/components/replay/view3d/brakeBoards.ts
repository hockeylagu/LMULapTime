import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Texture, type Vector3 } from 'three';
import type { TrackBrakeMarker } from '../../../../shared/types/trackGeometry.js';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';
import { nativeToScene } from './sceneFrame.js';
import type { SurfaceHeight } from './surfaceProjection.js';
import type { LoadedBrakeBoardArtwork } from '../../../api/scenes/brakeBoardArtworkApi.js';

/** Distance boards follow the game's Portimão signs: tall white portrait panels, digits stacked, on steel posts. */
const DISTANCE_BOARD = {widthM: 0.9, heightM: 1.6, liftM: 0.45};
const OTHER_BOARD = {widthM: 1.6, heightM: 1, liftM: 0.35};
/** Approximate body-origin height above the road, for boards beyond the scanned surfaces. */
const BODY_ORIGIN_HEIGHT_M = 0.33;
/** Label face in front of the backing panel: far enough apart that depth precision never swaps them. */
const FACE_GAP_M = 0.04;

function labelTexture(label: string, distance: boolean): CanvasTexture | null {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = distance ? 456 : 160;
  const context = canvas.getContext('2d');
  if (!context) return null;
  
  if (distance) {
    // Official FIA distance board: high-contrast white panel, red top stripe, stacked black digits, dark outer border.
    context.fillStyle = '#f8f9fa'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#dc2626'; context.fillRect(0, 0, canvas.width, 18);
    context.strokeStyle = '#181a1d'; context.lineWidth = 8; context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    context.fillStyle = '#111315'; context.textAlign = 'center'; context.textBaseline = 'middle';
    const digits = label.split(''), row = (canvas.height - 24) / Math.max(3, digits.length);
    context.font = `bold ${Math.round(row * 0.92)}px "Arial Narrow", Arial, sans-serif`;
    digits.forEach((digit, i) => context.fillText(digit, 128, 24 + row * (i + 0.5) + (canvas.height - 24 - row * digits.length) / 2));
  } else {
    // Authentic sponsor ads board branding for trackside visual references.
    const upper = label.toUpperCase();
    if (upper.includes('DHL')) {
      context.fillStyle = '#ffcc00'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#d40511';
      context.fillRect(16, 20, 36, 12); context.fillRect(204, 128, 36, 12);
      context.font = 'italic bold 76px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('DHL', 128, 80);
    } else if (upper.includes('MOTUL')) {
      context.fillStyle = '#dc2626'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#ffffff'; context.lineWidth = 6; context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      context.fillStyle = '#ffffff'; context.font = 'bold 54px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('MOTUL', 128, 80);
    } else if (upper.includes('ROLX') || upper.includes('ROLEX')) {
      context.fillStyle = '#006039'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#c5a059'; context.lineWidth = 4; context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      context.fillStyle = '#c5a059'; context.font = 'bold 50px serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('ROLEX', 128, 82);
    } else if (upper.includes('MICH')) {
      context.fillStyle = '#00205b'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#ffde00'; context.fillRect(12, 134, canvas.width - 24, 10);
      context.fillStyle = '#ffde00'; context.font = 'italic bold 44px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('MICHELIN', 128, 72);
    } else if (upper.includes('TOT')) {
      context.fillStyle = '#003380'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#e52421'; context.fillRect(12, 134, canvas.width - 24, 10);
      context.fillStyle = '#ffffff'; context.font = 'bold 46px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('TOTAL', 128, 72);
    } else if (upper.includes('GY') || upper.includes('GOODYEAR')) {
      context.fillStyle = '#002b66'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#ffd100'; context.font = 'bold italic 42px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('GOODYEAR', 128, 80);
    } else {
      context.fillStyle = '#1e293b'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#38bdf8'; context.fillRect(0, 0, canvas.width, 8);
      context.fillStyle = '#f8fafc'; context.font = 'bold 56px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(label, 128, 84, 236);
    }
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

/** Heading (native X/Z) and body height of the recorded lap nearest the board, so the face meets approaching cars. */
function nearestTravel(points: ReplayTrajectoryPoint[], x: number, z: number): {direction: [number, number]; y: number} | null {
  let best = -1, bestDistance = Infinity;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = (points[i].x - x) ** 2 + (points[i].z - z) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  if (best < 0 || bestDistance > 80 ** 2) return null;
  const dx = points[best + 1].x - points[best - 1].x, dz = points[best + 1].z - points[best - 1].z, length = Math.hypot(dx, dz);
  return length > 0 ? {direction: [dx / length, dz / length], y: points[best].y} : null;
}

/**
 * Exported roadside brake boards as upright labelled signs in scene space (outside the reflected
 * world group, so text never mirrors). Boards with no recorded lap within 80 m stay out.
 */
export function makeBrakeBoards(markers: TrackBrakeMarker[], points: ReplayTrajectoryPoint[], origin: Vector3, surfaceHeight: SurfaceHeight, artwork: LoadedBrakeBoardArtwork[] = []): Group {
  const boards = new Group(); boards.name = 'brake-boards';
  const frame = new MeshStandardMaterial({color: '#2b3038', roughness: 0.8});
  const steel = new MeshStandardMaterial({color: '#a9aeb3', roughness: 0.5, metalness: 0.6});
  const concrete = new MeshStandardMaterial({color: '#64748b', roughness: 0.92, metalness: 0.05});
  const textures = new Map<string, Texture | null>();
  const byMarker = new Map(artwork.flatMap(row => row.metadata.markerIds.map(id => [id, row] as const)));
  for (const marker of markers) {
    const [x, z] = marker.center, label = marker.label ?? '';
    const travel = nearestTravel(points, x, z);
    if (!label || !travel) continue;
    const matched = byMarker.get(marker.id), source = matched?.metadata.label === label ? matched : undefined;
    const distance = /^\d+$/.test(label), fallbackSize = distance ? DISTANCE_BOARD : OTHER_BOARD;
    const roadY = travel.y - BODY_ORIGIN_HEIGHT_M;
    const ground = surfaceHeight({x, y: roadY + 3, z}, 8) ?? roadY;
    // A board the game hangs high (Daytona's bus stop boards sit on the catch fence) keeps its height on longer posts.
    const liftM = marker.baseY === undefined ? fallbackSize.liftM : Math.max(fallbackSize.liftM, marker.baseY - ground);
    const size = source ? {...fallbackSize, liftM, widthM: source.metadata.widthM, heightM: source.metadata.heightM} : {...fallbackSize, liftM};
    const textureKey = source?.metadata.revision ?? label;
    if (!textures.has(textureKey)) {
      const texture = source ? new Texture(source.image) : labelTexture(label, distance);
      if (texture) { texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8; texture.needsUpdate = true; }
      textures.set(textureKey, texture);
    }
    const texture = textures.get(textureKey) ?? null;
    const board = new Group(); board.name = `brake-board-${label}`;
    const centreY = size.liftM + size.heightM / 2;
    const face = new Mesh(new PlaneGeometry(size.widthM, size.heightM), new MeshStandardMaterial({map: texture, color: texture ? '#ffffff' : '#eceeee', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1}));
    face.position.set(0, centreY, FACE_GAP_M);
    const back = new Mesh(new BoxGeometry(size.widthM + 0.06, size.heightM + 0.06, 0.04), distance ? steel : frame);
    back.position.set(0, centreY, 0);
    board.add(back, face);

    // Two ground-penetrating posts under the panel, anchored into concrete footings.
    // Penetrates 1.2m into the terrain so posts never float on slopes or banked verges.
    const PENETRATION_M = 1.2;
    const totalPostH = size.liftM + 0.2 + PENETRATION_M;
    const postCenterY = (size.liftM + 0.2 - PENETRATION_M) / 2;

    for (const side of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.07, totalPostH, 0.07), steel);
      post.position.set(side * size.widthM * 0.3, postCenterY, -0.06);
      board.add(post);

      // Concrete foundation footing at ground level
      const pad = new Mesh(new BoxGeometry(0.22, 0.14, 0.22), concrete);
      pad.position.set(side * size.widthM * 0.3, 0.07, -0.06);
      board.add(pad);

      // Diagonal rear kickstand brace (A-frame wind brace anchoring to ground)
      if (size.liftM >= 0.35) {
        const braceReachZ = Math.min(0.85, size.liftM * 0.9);
        const braceLen = Math.hypot(size.liftM * 0.8, braceReachZ);
        const brace = new Mesh(new BoxGeometry(0.05, braceLen, 0.05), steel);
        brace.position.set(side * size.widthM * 0.3, size.liftM * 0.4, -0.06 - braceReachZ / 2);
        brace.rotation.x = -Math.atan2(braceReachZ, size.liftM * 0.8);
        board.add(brace);
      }
    }

    // Horizontal mounting rails behind the panel
    for (const h of [centreY - size.heightM * 0.28, centreY + size.heightM * 0.28]) {
      const rail = new Mesh(new BoxGeometry(size.widthM * 0.88, 0.04, 0.04), steel);
      rail.position.set(0, h, -0.04);
      board.add(rail);
    }

    board.traverse(object => { if (object instanceof Mesh) object.castShadow = true; });
    board.position.set(...nativeToScene({x, y: ground, z}, origin));
    // Scene Z is native -Z; the face points back along the scene travel direction.
    board.rotation.y = Math.atan2(-travel.direction[0], travel.direction[1]);
    boards.add(board);
  }
  return boards;
}
