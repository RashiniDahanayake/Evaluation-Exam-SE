export type SlaStatus = 'ok' | 'at_risk' | 'breached';

// A ticket is "at risk" once this fraction of its SLA window has elapsed
// without being resolved. Purely a UI hint; breach is the hard signal.
const AT_RISK_THRESHOLD = 0.75;

export interface SlaInput {
  createdAt: Date;
  slaHours: number;
  resolvedAt: Date | null;
  status?: string;
  // When the ticket was last moved into a terminal state. Only consulted for a
  // `closed` ticket that has no `resolved_at` (see below); `updated_at` is the
  // close time in that case.
  closedAt?: Date | null;
}

// Computes the SLA standing of a ticket. A ticket breaches its SLA if it is
// not resolved within `slaHours` of being created. The deadline is
// `created_at + sla_hours`.
//   - resolved (resolved_at set): breached iff resolved after the deadline
//   - closed without a resolved_at: terminal, so the SLA is *frozen at the
//     close time* — breached iff it was still past the deadline when closed,
//     ok otherwise. The live clock is not consulted, so the verdict never grows.
//   - still active (open/in_progress): breached once past the deadline, at_risk
//     once >= AT_RISK_THRESHOLD of the window has elapsed, otherwise ok.
// `now` is injected so the logic is deterministic and unit-testable.
export function computeSlaStatus(input: SlaInput, now: Date): SlaStatus {
  const deadline = input.createdAt.getTime() + input.slaHours * 60 * 60 * 1000;

  if (input.resolvedAt) {
    return input.resolvedAt.getTime() > deadline ? 'breached' : 'ok';
  }

  // A closed-but-never-resolved ticket is terminal. Evaluate it as of the close
  // time rather than `now`: a ticket that blew its deadline before being closed
  // stays breached (but stops growing), and one closed in time stays ok.
  if (input.status === 'closed' && input.closedAt) {
    return input.closedAt.getTime() > deadline ? 'breached' : 'ok';
  }

  if (now.getTime() > deadline) return 'breached';

  const elapsed = now.getTime() - input.createdAt.getTime();
  const window = deadline - input.createdAt.getTime();
  return elapsed >= window * AT_RISK_THRESHOLD ? 'at_risk' : 'ok';
}
