import { useEffect, useState } from 'react';
import { request } from './api';
import { TICKET_STATUSES } from './types';
import type { Agent, Comment, SlaStatus, TicketWithComments } from './types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Human-readable duration from a millisecond span, coarsened to the two most
// significant units (e.g. "2d 3h", "45m").
function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const SLA_LABELS: Record<SlaStatus, string> = {
  ok: 'On track',
  at_risk: 'At risk',
  breached: 'Breached',
};

interface SlaView {
  progress: number; // 0..1 of the SLA window elapsed
  caption: string;
}

function slaView(ticket: TicketWithComments, now: number): SlaView {
  const created = new Date(ticket.createdAt).getTime();
  const deadline = created + ticket.slaHours * 3600 * 1000;

  if (ticket.resolvedAt) {
    const resolved = new Date(ticket.resolvedAt).getTime();
    const late = resolved > deadline;
    return {
      progress: 1,
      caption: late
        ? `Resolved ${formatDuration(resolved - deadline)} past deadline`
        : `Resolved with ${formatDuration(deadline - resolved)} to spare`,
    };
  }

  // A ticket closed without a resolution is terminal: freeze the SLA at the
  // close time (updated_at) instead of counting up against the live clock.
  if (ticket.status === 'closed') {
    const closed = new Date(ticket.updatedAt).getTime();
    const late = closed > deadline;
    return {
      progress: 1,
      caption: late
        ? `Closed ${formatDuration(closed - deadline)} past deadline`
        : `Closed with ${formatDuration(deadline - closed)} to spare`,
    };
  }

  const remaining = deadline - now;
  const progress = Math.min(1, Math.max(0, (now - created) / (deadline - created)));
  return {
    progress,
    caption:
      remaining >= 0
        ? `${formatDuration(remaining)} until deadline`
        : `Overdue by ${formatDuration(-remaining)}`,
  };
}

export function TicketDetail({ id }: { id: number }) {
  const [ticket, setTicket] = useState<TicketWithComments | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Status-change control state.
  const [savingStatus, setSavingStatus] = useState(false);

  // Comment composer state.
  const [authorId, setAuthorId] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setTicket(null);
    setError(null);
    request<TicketWithComments>(`/tickets/${id}`)
      .then(setTicket)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(() => {
    request<Agent[]>('/users')
      .then(setAgents)
      .catch(() => {
        /* author picker just stays empty; not fatal for viewing */
      });
  }, []);

  async function changeStatus(next: string) {
    if (!ticket || next === ticket.status) return;
    setSavingStatus(true);
    setError(null);
    try {
      const updated = await request<TicketWithComments>(`/tickets/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      // The status endpoint returns the ticket without comments; keep the ones
      // we already loaded.
      setTicket({ ...updated, comments: ticket.comments });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket) return;
    setFormError(null);
    if (!authorId) {
      setFormError('Choose who is commenting.');
      return;
    }
    if (!body.trim()) {
      setFormError('Write a comment first.');
      return;
    }
    setPosting(true);
    try {
      const comment = await request<Comment>(`/tickets/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ authorId: Number(authorId), body: body.trim() }),
      });
      setTicket({
        ...ticket,
        comments: [...ticket.comments, comment],
        commentCount: ticket.commentCount + 1,
      });
      setBody('');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  if (error && !ticket) return <p className="error">{error}</p>;
  if (!ticket) return <p className="muted">Loading ticket…</p>;

  const sla = slaView(ticket, Date.now());

  return (
    <div>
      <a className="back-link" href="#/">
        ← Back to tickets
      </a>

      <div className="detail-header">
        <h2>{ticket.subject}</h2>
        <span className={`badge sla-${ticket.slaStatus}`}>{SLA_LABELS[ticket.slaStatus]}</span>
        <div className="status-control">
          <label htmlFor="status-select">Status</label>
          <select
            id="status-select"
            value={ticket.status}
            disabled={savingStatus}
            onChange={(e) => changeStatus(e.target.value)}
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          {savingStatus && <span className="muted saving">Saving…</span>}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="detail-card">
        <dl className="ticket-meta">
          <div>
            <dt>Priority</dt>
            <dd>
              <span className={`badge priority priority-${ticket.priority}`}>
                {ticket.priority}
              </span>
            </dd>
          </div>
          <div>
            <dt>Assignee</dt>
            <dd>
              {ticket.assigneeName ? (
                <span className="assignee">
                  <span className="avatar">{initials(ticket.assigneeName)}</span>
                  {ticket.assigneeName}
                </span>
              ) : (
                <span className="muted">Unassigned</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDate(ticket.createdAt)}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{formatDate(ticket.updatedAt)}</dd>
          </div>
          {ticket.resolvedAt && (
            <div>
              <dt>Resolved</dt>
              <dd>{formatDate(ticket.resolvedAt)}</dd>
            </div>
          )}
        </dl>

        <div className="sla-block">
          <div className="sla-block-head">
            <span className="sla-block-title">SLA · {ticket.slaHours}h target</span>
            <span className={`sla-caption sla-text-${ticket.slaStatus}`}>{sla.caption}</span>
          </div>
          <div className="sla-bar">
            <div
              className={`sla-bar-fill sla-fill-${ticket.slaStatus}`}
              style={{ width: `${Math.round(sla.progress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <h3 className="section-title">Description</h3>
      <p className="description">{ticket.description}</p>

      <h3 className="section-title">Comments ({ticket.comments.length})</h3>
      {ticket.comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="comments">
          {ticket.comments.map((comment) => (
            <li key={comment.id}>
              <div className="comment-header">
                <span className="avatar">{initials(comment.authorName)}</span>
                <strong>{comment.authorName}</strong>
                <span className="muted"> · {formatDate(comment.createdAt)}</span>
              </div>
              <p>{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form className="comment-form" onSubmit={submitComment}>
        <div className="comment-form-row">
          <select
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
            aria-label="Comment author"
            disabled={posting}
          >
            <option value="">Commenting as…</option>
            {agents.map((agent) => (
              <option key={agent.id} value={String(agent.id)}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          disabled={posting}
        />
        {formError && <p className="error">{formError}</p>}
        <div className="comment-form-actions">
          <button type="submit" className="btn-primary" disabled={posting}>
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </form>
    </div>
  );
}
