import { useState, useEffect } from 'react';
import { fetchVehicleLogos, getCachedVehicleLogos } from '../../api/vehicleLogosApi.js';
import { resolveCarManufacturer } from '../../../shared/domain/vehicleMapping.js';

export function useVehicleLogos(): {
  logos: Record<string, string> | null;
  getLogoSvg: (carTypeOrModel?: string | null) => { brand: string; svg: string } | null;
} {
  const [logos, setLogos] = useState<Record<string, string> | null>(() => getCachedVehicleLogos());

  useEffect(() => {
    let active = true;
    if (logos === null) {
      void fetchVehicleLogos().then((loaded) => {
        if (active && loaded) {
          setLogos(loaded);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [logos]);

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
