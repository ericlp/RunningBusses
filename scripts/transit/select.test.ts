import { describe, expect, it } from 'vitest';
import { planRoutes, type Pattern } from './select';

const pat = (o: Partial<Pattern>): Pattern => ({
  direction: '0',
  shapeId: 's',
  from: 'A',
  to: 'B',
  start: [11.97, 57.7],
  end: [11.98, 57.71],
  trips: 10,
  lengthM: 5000,
  callOrdered: false,
  via: [],
  ...o,
});

describe('planRoutes', () => {
  it('keeps one route for a symmetrical line and uses the busier direction', () => {
    const r = planRoutes(
      [
        pat({ direction: '0', trips: 10 }),
        pat({ direction: '1', trips: 12, lengthM: 5100, start: [11.98, 57.71], end: [11.97, 57.7] }),
      ],
      0.12,
    );
    expect(r).toHaveLength(1);
    expect(r[0].pattern.direction).toBe('1');
  });

  it('treats slightly different terminus names at the same place as mirrored', () => {
    const r = planRoutes(
      [
        pat({ direction: '0', to: 'Nils Ericsonsplatsen' }),
        pat({ direction: '1', from: 'Nils Ericson Terminalen', start: [11.9801, 57.7101], end: [11.97, 57.7] }),
      ],
      0.12,
    );
    expect(r).toHaveLength(1);
  });

  it('splits directions that differ by more than the threshold', () => {
    const r = planRoutes(
      [
        pat({ direction: '0', lengthM: 6950 }),
        pat({ direction: '1', lengthM: 3370, start: [11.98, 57.71], end: [11.97, 57.7] }),
      ],
      0.12,
    );
    expect(r.map((x) => x.suffix)).toEqual(['', 'r']);
    expect(r[1].tags).toContain('retur');
  });

  it('splits directions with different termini', () => {
    const r = planRoutes(
      [pat({ direction: '0' }), pat({ direction: '1', start: [12.2, 57.8], end: [11.97, 57.7] })],
      0.12,
    );
    expect(r).toHaveLength(2);
  });

  it('tags loops (without one-way) and call-ordered lines', () => {
    const r = planRoutes([pat({ direction: '1', from: 'X', to: 'X', callOrdered: true })], 0.12);
    expect(r[0].tags).toEqual(expect.arrayContaining(['loop', 'call-ordered']));
    expect(r[0].tags).not.toContain('one-way');
  });

  it('prefers ordinary service over call-ordered for the path', () => {
    const r = planRoutes(
      [pat({ shapeId: 'taxi', callOrdered: true, trips: 50 }), pat({ shapeId: 'bus', trips: 3 })],
      0.12,
    );
    expect(r[0].pattern.shapeId).toBe('bus');
    expect(r[0].tags).toContain('call-ordered');
  });
});
