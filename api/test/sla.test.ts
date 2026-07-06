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

  describe('closed tickets (never resolved)', () => {
    it('is ok when it was closed inside the SLA window', () => {
      // Created 10h ago on an 8h SLA (deadline 2h ago), but closed 6h ago —
      // i.e. well before the deadline. Terminal and on time.
      const status = computeSlaStatus(
        {
          createdAt: hoursBefore(10),
          slaHours: 8,
          resolvedAt: null,
          status: 'closed',
          closedAt: hoursBefore(6),
        },
        now
      );
      expect(status).toBe('ok');
    });

    it('is breached when it was still past the deadline when closed', () => {
      // Created 10h ago on an 8h SLA (deadline 2h ago), closed 1h ago — after
      // the deadline. It genuinely breached; the verdict must not be erased.
      const status = computeSlaStatus(
        {
          createdAt: hoursBefore(10),
          slaHours: 8,
          resolvedAt: null,
          status: 'closed',
          closedAt: hoursBefore(1),
        },
        now
      );
      expect(status).toBe('breached');
    });

    it('does not grow against the live clock once closed', () => {
      // Closed comfortably inside the window; it stays ok no matter how far the
      // current time advances past the deadline (the earlier phantom-breach bug).
      const input = {
        createdAt: hoursBefore(1000),
        slaHours: 8,
        resolvedAt: null,
        status: 'closed',
        closedAt: hoursBefore(996), // 4h after creation, within the 8h window
      };
      expect(computeSlaStatus(input, now)).toBe('ok');
      expect(computeSlaStatus(input, new Date(now.getTime() + 1e12))).toBe('ok');
    });

    it('still reports breached when closed after being resolved late', () => {
      // Resolved past the deadline, then closed: resolved_at drives the verdict.
      const status = computeSlaStatus(
        {
          createdAt: hoursBefore(20),
          slaHours: 8,
          resolvedAt: hoursBefore(2),
          status: 'closed',
          closedAt: hoursBefore(1),
        },
        now
      );
      expect(status).toBe('breached');
    });
  });
});
