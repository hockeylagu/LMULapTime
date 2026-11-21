import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { costChangeTone, CostSparkline } from '../../../src/components/common/CostSparkline.js';

describe('costChangeTone', () => {
  it('greens a gain from 0.05 s and reds only a rise from 0.15 s, so a progression is not overly negative', () => {
    expect(costChangeTone(-0.05)).toBe('text-lmu-gain');
    expect(costChangeTone(-0.04)).toBe('text-lmu-text-soft');
    expect(costChangeTone(0.11)).toBe('text-lmu-text-soft');
    expect(costChangeTone(0.15)).toBe('text-lmu-loss');
  });
});

describe('CostSparkline', () => {
  it('plots a lower cost higher, the same way up as the corner trend graph', () => {
    const markup = renderToStaticMarkup(createElement(CostSparkline, { costs: [0.3, 0.1], tone: 'text-lmu-gain' }));
    const [first, last] = /points="([^"]+)"/.exec(markup)![1].split(' ').map((point) => Number(point.split(',')[1]));
    expect(last).toBeLessThan(first);
  });
});
