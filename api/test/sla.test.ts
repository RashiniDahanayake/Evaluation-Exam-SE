import { describe, expect, it } from 'vitest';
import { computeSlaStatus } from '../src/sla';

// Fixed reference point so every case is deterministic.
const now = new Date('2026-07-04T12:00:00.000Z');

function hoursBefore(h: number): Date {
  return new Date(now.getTime() - h * 60 * 60 * 1000);
}

describe('computeSlaStatus', () => {
  describe('unresolved tickets', () => {
    it('is ok well within the SLA window', () => {
      // 1h into an 8h window (~12% elapsed)
      const status = computeSlaStatus(
        { createdAt: hoursBefore(1), slaHours: 8, resolvedAt: null },
        now
      );
      expect(status).toBe('ok');
    });

    it('is at_risk once 75% of the window has elapsed', () => {
      // 6h into an 8h window (75% elapsed)
      const status = computeSlaStatus(
        { createdAt: hoursBefore(6), slaHours: 8, resolvedAt: null },
        now
      );
      expect(status).toBe('at_risk');
    });

    it('is breached once past the deadline', () => {
      // 10h into an 8h window
      const status = computeSlaStatus(
        { createdAt: hoursBefore(10), slaHours: 8, resolvedAt: null },
        now
      );
      expect(status).toBe('breached');
    });

    it('is not yet breached exactly at the deadline', () => {
      const status = computeSlaStatus(
        { createdAt: hoursBefore(8), slaHours: 8, resolvedAt: null },
        now
      );
      expect(status).toBe('at_risk');
    });
  });

  describe('resolved tickets', () => {
    it('is ok when resolved inside the window', () => {
      const status = computeSlaStatus(
        { createdAt: hoursBefore(10), slaHours: 8, resolvedAt: hoursBefore(6) },
        now
      );
      expect(status).toBe('ok');
    });

    it('is ok when resolved exactly at the deadline', () => {
      const created = hoursBefore(10);
      const deadline = new Date(created.getTime() + 8 * 60 * 60 * 1000);
      const status = computeSlaStatus(
        { createdAt: created, slaHours: 8, resolvedAt: deadline },
        now
      );
      expect(status).toBe('ok');
    });

    it('is breached when resolved after the deadline', () => {
      // created 20h ago, resolved 2h ago -> 18h to resolve on an 8h SLA
      const status = computeSlaStatus(
        { createdAt: hoursBefore(20), slaHours: 8, resolvedAt: hoursBefore(2) },
        now
      );
      expect(status).toBe('breached');
    });

    it('ignores current time once resolved in time', () => {
      // Long-closed ticket that was resolved promptly stays ok forever.
      const status = computeSlaStatus(
        { createdAt: hoursBefore(1000), slaHours: 8, resolvedAt: hoursBefore(996) },
        now
      );
      expect(status).toBe('ok');
    });
  });
});
