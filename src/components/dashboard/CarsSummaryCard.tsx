import React, { useState, useMemo } from 'react';
import { Car } from 'lucide-react';
import { SummaryCard, UnitToggle, RankedList, shareOf } from './DashboardSummaryParts.js';

export interface CarsSummaryCardProps {
  rankedCars: { car: string; laps: number; km: number }[];
  visibleCars?: { car: string; laps: number; km: number }[];
  showMoreCars: boolean;
  setShowMoreCars: (val: boolean | ((prev: boolean) => boolean)) => void;
  onSelectCar: (car: string) => void;
}

export const CarsSummaryCard: React.FC<CarsSummaryCardProps> = ({
  rankedCars,
  visibleCars,
  showMoreCars,
  setShowMoreCars,
  onSelectCar,
}) => {
  const [unit, setUnit] = useState<'laps' | 'km'>('laps');

  const sourceCars = rankedCars && rankedCars.length > 0 ? rankedCars : (visibleCars || []);

  const sortedCars = useMemo(() => {
    return [...sourceCars].sort((a, b) => (unit === 'km' ? b.km - a.km : b.laps - a.laps));
  }, [sourceCars, unit]);

  const total = sourceCars.reduce((sum, item) => sum + (unit === 'km' ? item.km : item.laps), 0);
  const displayCars = showMoreCars ? sortedCars : sortedCars.slice(0, 3);

  return (
    <SummaryCard
      icon={Car}
      title="Cars"
      action={<UnitToggle unit={unit} onChange={setUnit} />}
      footer={sourceCars.length > 3 ? { expanded: showMoreCars, showAllLabel: `Show All ${sourceCars.length} Cars`, onToggle: () => setShowMoreCars(!showMoreCars) } : null}
    >
      <RankedList
        expanded={showMoreCars}
        empty="No car data"
        items={displayCars.map((item, i) => ({
          key: item.car,
          name: item.car,
          value: unit === 'km' ? Math.round(item.km).toLocaleString() : item.laps.toLocaleString(),
          unit: unit === 'km' ? 'km' : 'laps',
          detail: i === 0 ? shareOf(unit === 'km' ? item.km : item.laps, total, unit === 'km' ? 'distance' : 'laps') : undefined,
          title: `Filter by ${item.car}`,
          onSelect: () => onSelectCar(item.car.split(' ')[0] || item.car),
        }))}
      />
    </SummaryCard>
  );
};
