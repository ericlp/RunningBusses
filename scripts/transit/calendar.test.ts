import { describe, expect, it } from 'vitest';
import { referenceWednesday, serviceDays, tripWeight } from './calendar';

const week = {
  service_id: 'weekday', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0',
  start_date: '20261005', end_date: '20261011',
};
describe('full-feed service calendar', () => {
  it('combines weekly service with additions and cancellations', () => {
    const days = serviceDays([week], [
      { service_id: 'weekday', date: '20261007', exception_type: '2' },
      { service_id: 'weekday', date: '20261010', exception_type: '1' },
      { service_id: 'seasonal', date: '20261212', exception_type: '1' },
    ]);
    expect([...days.get('weekday')!].sort()).toEqual(['20261005', '20261006', '20261008', '20261009', '20261010']);
    expect([...days.get('seasonal')!]).toEqual(['20261212']);
  });

  it('includes weekend-only services absent from the reference Wednesday', () => {
    const days = serviceDays([{ ...week, service_id: 'weekend', monday: '0', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '1', sunday: '1' }], []);
    expect(tripWeight(days.get('weekend')!, '20261007', false)).toBe(2);
    expect(tripWeight(days.get('weekend')!, '20261007', true)).toBe(0);
  });

  it('keeps legacy Wednesday weighting and weights fallback patterns by operating days', () => {
    const days = serviceDays([week], []).get('weekday')!;
    expect(tripWeight(days, '20261007', true)).toBe(1);
    expect(tripWeight(days, '20261007', false)).toBe(5);
    expect(tripWeight(new Set(), '20261007', false)).toBe(0);
  });

  it('chooses the first future Wednesday with service and reports missing service', () => {
    const days = serviceDays([week], []);
    expect(referenceWednesday(days, new Date('2026-10-06T12:00:00Z'))).toBe('20261007');
    expect(() => referenceWednesday(days, new Date('2026-10-08T12:00:00Z'))).toThrow(/No Wednesday/);
  });

  it('rejects malformed dates, ranges and exception types', () => {
    expect(() => serviceDays([{ ...week, start_date: '20260230' }], [])).toThrow(/Invalid service date/);
    expect(() => serviceDays([{ ...week, end_date: '20261001' }], [])).toThrow(/Reversed/);
    expect(() => serviceDays([], [{ service_id: 'x', date: '20261010', exception_type: '3' }])).toThrow(/Invalid calendar exception/);
  });
});
