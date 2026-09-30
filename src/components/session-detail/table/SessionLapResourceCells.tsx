import React from 'react';
import { Fuel, Zap } from 'lucide-react';
import { LapData } from '../../../../shared/types/index.js';

const COMPOUND_STYLES: Record<string, string | undefined> = {
  S: 'border-lmu-muted text-lmu-text-soft',
  M: 'border-lmu-warn text-lmu-warn',
  H: 'border-lmu-loss-strong text-lmu-loss',
  W: 'border-lmu-info text-lmu-info',
};

export const CompoundCell: React.FC<{ lap: LapData }> = ({ lap: l }) => {
  const compound = l.fCompound || l.rCompound;
  const compoundLetter = compound ? compound.trim().charAt(0).toUpperCase() : '';
  const compoundStyle = COMPOUND_STYLES[compoundLetter];
  return (
    <td className="px-3 py-2.5 text-center font-sans text-xs">
      {compoundStyle ? (
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border text-[11px] font-medium font-mono leading-none ${compoundStyle}`}
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
        className="font-mono text-xs text-lmu-text-soft cursor-help"
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
        className="inline-flex items-center gap-2.5 font-mono text-xs cursor-help"
        title={`Remaining Fuel: ${l.fuel ?? 'N/A'}% ${l.fuelUsed ? `(Consumed: ${l.fuelUsed}%)` : ''}${
          l.virtualEnergy !== null && l.virtualEnergy !== undefined
            ? `\nRemaining Virtual Energy: ${l.virtualEnergy}% ${
                l.virtualEnergyUsed ? `(Consumed: ${l.virtualEnergyUsed}%)` : ''
              }`
            : ''
        }`}
      >
        {l.fuel !== null && l.fuel !== undefined && (
          <span className="inline-flex items-center gap-1 text-lmu-warn-soft font-semibold"><Fuel className="w-3 h-3" aria-label="Fuel" />{l.fuel}%</span>
        )}
        {l.virtualEnergy !== null && l.virtualEnergy !== undefined && (
          <span className="inline-flex items-center gap-1 text-lmu-aqua font-semibold"><Zap className="w-3 h-3" aria-label="Virtual energy" />{l.virtualEnergy}%</span>
        )}
      </div>
    ) : (
      <span className="text-lmu-muted text-xs">-</span>
    )}
  </td>
);
