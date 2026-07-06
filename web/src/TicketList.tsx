import { useEffect, useMemo, useState } from 'react';
import { request } from './api';
import { TICKET_STATUSES } from './types';
import type { Agent, SlaStatus, Ticket } from './types';

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

const SLA_LABELS: Record<SlaStatus, string> = {
  ok: 'On track',
  at_risk: 'At risk',
  breached: 'Breached',
};

const PRIORITY_RANK: Record<Ticket['priority'], number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const SLA_RANK: Record<SlaStatus, number> = {
  breached: 3,
  at_risk: 2,
  ok: 1,
};

type SortKey = 'subject' | 'status' | 'sla' | 'priority' | 'comments' | 'created';
type SortDir = 'asc' | 'desc';

function buildTicketsUrl(status: string, assigneeId: string): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (assigneeId) params.set('assigneeId', assigneeId);
  const query = params.toString();
  return query ? `/tickets?${query}` : '/tickets';
}

function compare(a: Ticket, b: Ticket, key: SortKey): number {
  switch (key) {
    case 'subject':
      return a.subject.localeCompare(b.subject);
    case 'status':
      return a.status.localeCompare(b.status);
    case 'sla':
      return SLA_RANK[a.slaStatus] - SLA_RANK[b.slaStatus];
    case 'priority':
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    case 'comments':
      return a.commentCount - b.commentCount;
    case 'created':
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
}

export function TicketList() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Empty string means "no filter". Kept as strings so they map directly to
  // the <select> values and the query string.
  const [status, setStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    request<Agent[]>('/users')
      .then(setAgents)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    // Guard against out-of-order responses when filters change quickly: only
    // the latest effect run is allowed to commit its result.
    let ignore = false;
    setTickets(null);
    request<Ticket[]>(buildTicketsUrl(status, assigneeId))
      .then((result) => {
        if (!ignore) setTickets(result);
      })
      .catch((err: Error) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [status, assigneeId]);

  const visible = useMemo(() => {
    if (!tickets) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? tickets.filter(
          (t) =>
            t.subject.toLowerCase().includes(q) ||
            (t.assigneeName ?? '').toLowerCase().includes(q)
        )
      : tickets;
    const sorted = [...filtered].sort((a, b) => compare(a, b, sortKey));
    if (sortDir === 'desc') sorted.reverse();
    return sorted;
  }, [tickets, query, sortKey, sortDir]);

  // Stats summarise what's actually on screen, so they track the search box
  // as well as the server-side status/assignee filters.
  const stats = useMemo(
    () => ({
      total: visible.length,
      ok: visible.filter((t) => t.slaStatus === 'ok').length,
      at_risk: visible.filter((t) => t.slaStatus === 'at_risk').length,
      breached: visible.filter((t) => t.slaStatus === 'breached').length,
    }),
    [visible]
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Text sorts feel natural ascending; numeric/time descending.
      setSortDir(key === 'subject' ? 'asc' : 'desc');
    }
  }

  const hasFilters = status !== '' || assigneeId !== '' || query !== '';

  function resetFilters() {
    setStatus('');
    setAssigneeId('');
    setQuery('');
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return null;
    return <span className="sort-ind">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <div className="stats">
        <div className="stat-card total">
          <span className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </span>
          <div className="stat-body">
            <span className="stat-label">Total</span>
            <span className="stat-value">{tickets ? stats.total : '—'}</span>
          </div>
        </div>
        <div className="stat-card ok">
          <span className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <div className="stat-body">
            <span className="stat-label">On track</span>
            <span className="stat-value">{tickets ? stats.ok : '—'}</span>
          </div>
        </div>
        <div className="stat-card at_risk">
          <span className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </span>
          <div className="stat-body">
            <span className="stat-label">At risk</span>
            <span className="stat-value">{tickets ? stats.at_risk : '—'}</span>
          </div>
        </div>
        <div className="stat-card breached">
          <span className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </span>
          <div className="stat-body">
            <span className="stat-label">Breached</span>
            <span className="stat-value">{tickets ? stats.breached : '—'}</span>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search by subject or assignee…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tickets"
          />
        </div>
        <div className="field">
          <label htmlFor="status-filter">Status</label>
          <select id="status-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assignee-filter">Assignee</label>
          <select
            id="assignee-filter"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">All</option>
            {agents.map((agent) => (
              <option key={agent.id} value={String(agent.id)}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button type="button" className="btn-reset" onClick={resetFilters}>
            Clear filters
          </button>
        )}
      </div>

      {tickets && (
        <p className="result-count">
          Showing <strong>{visible.length}</strong> of {tickets.length} ticket
          {tickets.length === 1 ? '' : 's'}
        </p>
      )}

      <div className="table-wrap">
        <table className="ticket-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort('subject')}>
                Subject {sortIndicator('subject')}
              </th>
              <th className="sortable" onClick={() => toggleSort('status')}>
                Status {sortIndicator('status')}
              </th>
              <th className="sortable" onClick={() => toggleSort('sla')}>
                SLA {sortIndicator('sla')}
              </th>
              <th className="sortable" onClick={() => toggleSort('priority')}>
                Priority {sortIndicator('priority')}
              </th>
              <th>Assignee</th>
              <th className="sortable" onClick={() => toggleSort('comments')}>
                Comments {sortIndicator('comments')}
              </th>
              <th className="sortable" onClick={() => toggleSort('created')}>
                Created {sortIndicator('created')}
              </th>
            </tr>
          </thead>
          <tbody>
            {!tickets ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j}>
                      <span className="skeleton" style={{ width: `${40 + ((i + j) % 4) * 15}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="state">
                    <div className="state-icon">🔍</div>
                    <h3>No tickets found</h3>
                    <p>
                      {hasFilters
                        ? 'Try adjusting your search or filters.'
                        : 'There are no tickets yet.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((ticket) => (
                <tr key={ticket.id}>
                  <td className={`subject-cell prio-${ticket.priority}`} data-label="Subject">
                    <a href={`#/tickets/${ticket.id}`}>{ticket.subject}</a>
                  </td>
                  <td data-label="Status">
                    <span className={`badge status-${ticket.status}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td data-label="SLA">
                    <span className={`badge sla-${ticket.slaStatus}`}>
                      {SLA_LABELS[ticket.slaStatus]}
                    </span>
                  </td>
                  <td data-label="Priority">
                    <span className={`badge priority priority-${ticket.priority}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td data-label="Assignee">
                    {ticket.assigneeName ? (
                      <span className="assignee">
                        <span className="avatar">{initials(ticket.assigneeName)}</span>
                        {ticket.assigneeName}
                      </span>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                  </td>
                  <td data-label="Comments">
                    <span className="comment-count">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      {ticket.commentCount}
                    </span>
                  </td>
                  <td className="created-cell" data-label="Created">
                    {formatDate(ticket.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
