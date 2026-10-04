import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsSceneCarMarkers, replayBodyHeading } from '../../../../../src/components/replay/map/scene/GpsSceneCarMarkers.js';
import { GpsTrackMap } from '../../../../../src/components/replay/index.js';
import { ReplayTrajectoryPoint } from '../../../../../server/core/types.js';

const points: ReplayTrajectoryPoint[] = [
  { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
  { x: 101, y: 10, z: 201, rotY: 0, speedKmh: 160, throttle: 80, brake: 0, timeSec: 0.1 },
  { x: 102, y: 10, z: 202, rotY: 0, speedKmh: 170, throttle: 80, brake: 0, timeSec: 0.2 },
];
const bounds = { minX: 100, maxX: 200, minZ: 200, maxZ: 240, spanX: 100, spanZ: 40 };

describe('GpsSceneCarMarkers', () => {
  it('draws the car and the ghost in their own layer over the scene, not among the racing lines', () => {
    const { container } = render(<GpsTrackMap points={points} bounds={bounds} currentIndex={1} baselinePoints={points} />);
    const overlay = screen.getByTestId('gps-car-markers');
    const scene = container.querySelector('[data-track-line="primary"]')?.closest('svg');

    expect(overlay).toHaveClass('will-change-transform', 'pointer-events-none', 'absolute', 'inset-0');
    expect(overlay.getAttribute('viewBox')).toBe(scene?.getAttribute('viewBox'));
    expect(overlay.querySelector('[data-car-role="primary"]')).toBeInTheDocument();
    expect(overlay.querySelector('[data-car-role="baseline"]')).toBeInTheDocument();
    expect(overlay.querySelector('[data-track-line]')).toBeNull();
    expect(scene?.querySelector('[filter="url(#carGlow)"]')).toBeNull();
  });

  it('follows the scrub cursor', () => {
    const { rerender } = render(<GpsTrackMap points={points} bounds={bounds} currentIndex={0} />);
    const carTransform = () => screen.getByTestId('gps-car-markers').querySelector('g')?.getAttribute('transform');
    const before = carTransform();
    rerender(<GpsTrackMap points={points} bounds={bounds} currentIndex={2} />);
    expect(carTransform()).not.toBe(before);
  });
});

describe('class size preview', () => {
  it('preserves world dimensions across camera zoom and keeps dots at overview scale', () => {
    const props = { currentPos: {sx:100,sy:200}, unitsPerMeter:10, primaryHeadingDeg:0, primaryOpacity:1, baselineOpacity:1 };
    const {rerender} = render(<GpsSceneCarMarkers {...props} viewBox="0 0 800 800" markerScale={1} />);
    const footprint = () => screen.getByTestId('gps-car-footprint');
    const width = footprint().getAttribute('width'), height = footprint().getAttribute('height');
    expect(Number(width)/10).toBeCloseTo(2);
    expect(Number(height)/10).toBeCloseTo(4.8);
    rerender(<GpsSceneCarMarkers {...props} viewBox="60 160 80 80" markerScale={0.1} />);
    expect(footprint().getAttribute('width')).toBe(width);
    expect(footprint().getAttribute('height')).toBe(height);
    rerender(<GpsSceneCarMarkers {...props} unitsPerMeter={0.1} viewBox="0 0 800 800" markerScale={1} />);
    expect(screen.queryByTestId('gps-car-footprint')).toBeNull();
    expect(screen.getByTestId('gps-car-markers').querySelector('circle')).toBeInTheDocument();
  });

  it('uses body yaw even while stopped or travelling sideways, and wraps smoothly', () => {
    expect(replayBodyHeading([{rotY:Math.PI}],0)).toBeCloseTo(0);
    expect(replayBodyHeading([{rotY:0}],0)).toBeCloseTo(180);
    expect(replayBodyHeading([{rotY:Math.PI/2}],0)).toBeCloseTo(-90);
    expect(replayBodyHeading([{rotY:Math.PI-0.1},{rotY:-Math.PI+0.1}],0,0.5)).toBeCloseTo(0);
    expect(replayBodyHeading([{rotY:Math.PI},{rotY:0,isTeleport:true}],0,0.5)).toBeCloseTo(0);
    expect(replayBodyHeading([{}],0)).toBeUndefined();
    expect(replayBodyHeading([{rotY:NaN}],0)).toBeUndefined();
  });

  it('draws replay body orientation independently of the path and uses a dot without it', () => {
    const sliding = points.map(p => ({...p, rotY:Math.PI/2}));
    const {rerender} = render(<GpsTrackMap points={sliding} bounds={bounds} currentIndex={1} baselinePoints={points.map(p=>({...p,rotY:Math.PI}))} />);
    expect(Number(screen.getByTestId('gps-car-footprint').parentElement?.getAttribute('transform')?.slice(7,-1))).toBeCloseTo(-90);
    expect(Number(screen.getByTestId('gps-ghost-footprint').parentElement?.getAttribute('transform')?.match(/rotate\((.*)\)/)?.[1])).toBeCloseTo(0);
    rerender(<GpsTrackMap points={points.map(({rotY,...p})=>p)} bounds={bounds} currentIndex={1} />);
    expect(screen.queryByTestId('gps-car-footprint')).toBeNull();
  });
});


describe('class-sized GPS bodies', () => {
  it('sizes primary and ghost independently and labels estimates', () => {
    render(<GpsSceneCarMarkers viewBox="0 0 800 800" currentPos={{sx:100,sy:100}} baselineGhostPos={{sx:150,sy:100}}
      markerScale={1} unitsPerMeter={10} primaryHeadingDeg={0} baselineHeadingDeg={0}
      primaryOpacity={1} baselineOpacity={1} primaryCarClass="LMH" baselineCarClass="LMP2_ELMS" />);
    expect(Number(screen.getByTestId('gps-car-footprint').getAttribute('height'))).toBe(50);
    expect(Number(screen.getByTestId('gps-ghost-footprint').getAttribute('height'))).toBe(47);
    expect(screen.getByText(/Approximate LMH size/)).toBeInTheDocument();
  });
});


describe('local model footprints',()=>{
 const model={id:'test',model:'Synthetic car',carClass:'LMH',vehicleIds:['TEST'],dimensions:{lengthM:5,widthM:2},outlineXZ:[[-1,-2.5],[1,-2.5],[1,2.5],[-1,2.5]] as Array<[number,number]>,replayOriginOffsetXZ:[.25,.5] as [number,number]};
 it('preserves the model origin and resolves the ghost independently',()=>{
  render(<GpsSceneCarMarkers viewBox="0 0 800 800" currentPos={{sx:100,sy:100}} baselineGhostPos={{sx:150,sy:150}} markerScale={1} unitsPerMeter={10} primaryOpacity={1} baselineOpacity={1} primaryHeadingDeg={90} baselineHeadingDeg={0} primaryVehicleData={model} baselineCarClass="LMP2"/>);
  const car=screen.getByTestId('gps-car-footprint');expect(car.tagName.toLowerCase()).toBe('polygon');expect(car.getAttribute('points')).toBe('7.5,-20 -12.5,-20 -12.5,30 7.5,30');expect(car.parentElement?.getAttribute('transform')).toBe('rotate(90)');expect(screen.getByTestId('gps-ghost-footprint').tagName.toLowerCase()).toBe('rect');
 });
 it('keeps class estimates until replay-origin alignment is established',()=>{
  render(<GpsSceneCarMarkers viewBox="0 0 800 800" currentPos={{sx:100,sy:100}} markerScale={1} unitsPerMeter={10} primaryOpacity={1} baselineOpacity={1} primaryHeadingDeg={0} primaryCarClass="LMH" primaryVehicleData={{...model,replayOriginOffsetXZ:undefined}}/>);
  expect(screen.getByTestId('gps-car-footprint').tagName.toLowerCase()).toBe('rect');expect(screen.getByText(/Approximate LMH/)).toBeInTheDocument();
 });
});
