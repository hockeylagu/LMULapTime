import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchVehicleLogos, getCachedVehicleLogos, getVehicleLogoCacheGeneration, subscribeVehicleLogos } from '../../api/vehicles/vehicleLogosApi.js';
import { resolveCarManufacturer } from '../../../shared/domain/vehicleMapping.js';

export function useVehicleLogos(): {
  logos: Record<string, string> | null;
  getLogoSvg: (carTypeOrModel?: string | null) => { brand: string; svg: string } | null;
} {
  // The shared logo cache is an external store: every hook reads it and is told when it changes.
  const cached = useSyncExternalStore(subscribeVehicleLogos, getCachedVehicleLogos);
  const generation = useSyncExternalStore(subscribeVehicleLogos, getVehicleLogoCacheGeneration);
  const [fetched, setFetched] = useState<{ generation: number; logos: Record<string, string> } | null>(null);
  const logos = cached ?? (fetched?.generation === generation ? fetched.logos : null);

  // A missing or invalidated cache loads again.
  useEffect(() => {
    if (cached !== null) return;
    let active = true;
    void fetchVehicleLogos().then((loaded) => {
      if (active && loaded) setFetched({ generation, logos: loaded });
    });
    return () => {
      active = false;
    };
  }, [cached, generation]);

  const getLogoSvg = (carTypeOrModel?: string | null): { brand: string; svg: string } | null => {
    if (!carTypeOrModel) return null;
    const brand = resolveCarManufacturer(carTypeOrModel);
    if (!brand || !logos) return null;
    const svg = logos[brand];
    if (!svg) return null;
    return { brand, svg };
  };

  return { logos, getLogoSvg };
}
