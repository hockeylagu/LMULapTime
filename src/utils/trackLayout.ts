/**
 * Deterministically resolves the layoutKey from circuit venue, course, or replay filename.
 * Shared between backend trajectory synchronization and frontend circuit loading.
 */
export function resolveTrackLayoutKey(
  venue?: string | null,
  course?: string | null,
  replayName?: string | null,
  explicitKey?: string | null
): string | null {
  if (explicitKey) return explicitKey;

  const combined = `${venue || ''} ${course || ''} ${replayName || ''}`.toLowerCase();
  if (!combined.trim()) return null;

  // Specific layout variants first to prevent false matching to full/GP layouts
  if (combined.includes('curva grande')) return 'monza_curvagrande';
  if (combined.includes('outer') && combined.includes('bahrain')) return 'bahrain_outer';
  if (combined.includes('paddock') && combined.includes('bahrain')) return 'bahrain_paddock';
  if (combined.includes('classic') && combined.includes('fuji')) return 'fuji_classic';
  if (combined.includes('school') && combined.includes('sebring')) return 'sebring_school';

  // Base tracks
  if (combined.includes('monza')) return 'monza_gp';
  if (combined.includes('spa')) return 'spa_gp';
  if (combined.includes('sarthe') || combined.includes('le mans')) return 'sarthe_full';
  if (combined.includes('americas') || combined.includes('cota')) return 'cota_gp';
  if (combined.includes('barcelona') || combined.includes('catalunya')) return 'barcelona_gp';
  if (combined.includes('interlagos') || combined.includes('carlos pace')) return 'interlagos_gp';
  if (combined.includes('silverstone')) return 'silverstone_wec';
  if (combined.includes('bahrain') || combined.includes('sakhir')) return 'bahrain_wec';
  if (combined.includes('imola') || combined.includes('enzo e dino')) return 'imola_gp';
  if (combined.includes('daytona')) return 'daytona_road_course';
  if (combined.includes('fuji')) return 'fuji_chicane';
  if (combined.includes('algarve') || combined.includes('portimao')) return 'portimao_wec';
  if (combined.includes('sebring')) return 'sebring_full';
  if (combined.includes('laguna')) return 'laguna_seca';
  if (combined.includes('lusail') || combined.includes('qatar')) return 'qatar_short';
  if (combined.includes('paul ricard') || combined.includes('ricard')) return 'paul_ricard_1a_v2_short';

  return null;
}
