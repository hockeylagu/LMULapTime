import React from 'react';
import { LapData } from '../../../../shared/types/index.js';

const COMPOUND_STYLES: Record<string, string | undefined> = {
  S: 'border-white text-white',
  M: 'border-yellow-400 text-yellow-400',
  H: 'border-red-500 text-red-500',
  W: 'border-sky-400 text-sky-400',
};

export const CompoundCell: React.FC<{ lap: LapData }> = ({ lap: l }) => {
  const compound = l.fCompound || l.rCompound;
  const compoundLetter = compound ? compound.trim().charAt(0).toUpperCase() : '';
  const compoundStyle = COMPOUND_STYLES[compoundLetter];
  return (
    <td className="px-3 py-2.5 text-center font-sans text-xs">
      {compoundStyle ? (
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded-full border-2 text-xs font-bold font-mono leading-none ${compoundStyle}`}
          title={compound}
        >
          {compoundLetter}
        </span>
      ) : (
        '-'
      )}
    </td>
  );
};

export const TireWearCell: React.FC<{ lap: LapData }> = ({ lap: l }) => (
  <td className="px-3 py-2.5 text-center font-sans text-xs whitespace-nowrap">
    {l.tireWear ? (
      <span
        className="px-2 py-0.5 rounded bg-lmu-bg border border-lmu-border/60 text-[11px] font-mono text-lmu-gold font-bold cursor-help inline-block"
        title={`4-Tire Average: ${l.tireWear.avg}%\nFL: ${l.tireWear.fl}% | FR: ${l.tireWear.fr}%\nRL: ${l.tireWear.rl}% | RR: ${l.tireWear.rr}%`}
      >
        {l.tireWear.avg}%
      </span>
    ) : (
      <span className="text-lmu-muted text-xs">-</span>
    )}
  </td>
);

export const FuelCell: React.FC<{ lap: LapData }> = ({ lap: l }) => (
  <td className="px-3 py-2.5 text-center font-sans text-xs whitespace-nowrap">
    {(l.fuel !== null && l.fuel !== undefined) || (l.virtualEnergy !== null && l.virtualEnergy !== undefined) ? (
      <div
        className="inline-flex items-center gap-2 font-mono text-[11px] cursor-help"
        title={`Remaining Fuel: ${l.fuel ?? 'N/A'}% ${l.fuelUsed ? `(Consumed: ${l.fuelUsed}%)` : ''}${
          l.virtualEnergy !== null && l.virtualEnergy !== undefined
            ? `\nRemaining Virtual Energy: ${l.virtualEnergy}% ${
                l.virtualEnergyUsed ? `(Consumed: ${l.virtualEnergyUsed}%)` : ''
              }`
            : ''
        }`}
      >
        {l.fuel !== null && l.fuel !== undefined && (
          <span className="text-amber-300 font-bold">⛽ {l.fuel}%</span>
        )}
        {l.virtualEnergy !== null && l.virtualEnergy !== undefined && (
          <span className="text-indigo-300 font-bold">⚡ {l.virtualEnergy}%</span>
        )}
      </div>
    ) : (
      <span className="text-lmu-muted text-xs">-</span>
    )}
  </td>
);
