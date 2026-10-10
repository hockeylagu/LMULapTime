import { useState, useEffect } from 'react';
import { fetchVehicleLogos, getCachedVehicleLogos, getVehicleLogoCacheGeneration, subscribeVehicleLogos } from '../../api/vehicleLogosApi.js';
import { resolveCarManufacturer } from '../../../shared/domain/vehicleMapping.js';

export function useVehicleLogos(): {
  logos: Record<string, string> | null;
  getLogoSvg: (carTypeOrModel?: string | null) => { brand: string; svg: string } | null;
} {
  const [logos, setLogos] = useState<Record<string, string> | null>(() => getCachedVehicleLogos());
  const [generation, setGeneration] = useState(() => getVehicleLogoCacheGeneration());

  useEffect(() => {
    const unsubscribe = subscribeVehicleLogos(nextGeneration => {
      setGeneration(nextGeneration);
      setLogos(getCachedVehicleLogos());
    });
    setGeneration(getVehicleLogoCacheGeneration());
    setLogos(getCachedVehicleLogos());
    return unsubscribe;
  }, []);

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
  }, [logos, generation]);

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
