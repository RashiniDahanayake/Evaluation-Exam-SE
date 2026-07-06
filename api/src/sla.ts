export type SlaStatus = 'ok' | 'at_risk' | 'breached';

// A ticket is "at risk" once this fraction of its SLA window has elapsed
// without being resolved. Purely a UI hint; breach is the hard signal.
const AT_RISK_THRESHOLD = 0.75;

export interface SlaInput {
  createdAt: Date;
  slaHours: number;
  resolvedAt: Date | null;
  status?: string;
}

// Computes the SLA standing of a ticket. A ticket breaches its SLA if it is
// not resolved within `slaHours` of being created:
//   - resolved late (resolved_at past the deadline)  -> breached
//   - closed without ever being resolved              -> ok (terminal)
//   - still unresolved and already past the deadline  -> breached
//   - unresolved and >= AT_RISK_THRESHOLD elapsed      -> at_risk
//   - otherwise                                        -> ok
// `now` is injected so the logic is deterministic and unit-testable.
export function computeSlaStatus(input: SlaInput, now: Date): SlaStatus {
  const deadline = input.createdAt.getTime() + input.slaHours * 60 * 60 * 1000;

  if (input.resolvedAt) {
    return input.resolvedAt.getTime() > deadline ? 'breached' : 'ok';
  }

  // A ticket closed without ever being resolved is terminal: the clock has
  // stopped, so it must not keep accruing an ever-growing breach against `now`.
  // (Resolved-then-closed tickets carry a resolved_at and are handled above.)
  if (input.status === 'closed') return 'ok';

  if (now.getTime() > deadline) return 'breached';

  const elapsed = now.getTime() - input.createdAt.getTime();
  const window = deadline - input.createdAt.getTime();
  return elapsed >= window * AT_RISK_THRESHOLD ? 'at_risk' : 'ok';
}
