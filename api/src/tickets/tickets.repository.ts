import { pool } from '../db';
import { toTicketDto, type TicketDto, type TicketRow } from '../mappers';
import * as usersRepository from '../users/users.repository';

export interface ListTicketsFilters {
  status?: string;
  assigneeId?: number;
}

export async function listTickets(
  filters: ListTicketsFilters = {}
): Promise<TicketDto[]> {
  // Build the WHERE clause from whichever filters were supplied. Each value is
  // pushed as a bound parameter so nothing is interpolated into the SQL.
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status !== undefined) {
    params.push(filters.status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (filters.assigneeId !== undefined) {
    params.push(filters.assigneeId);
    conditions.push(`t.assignee_id = $${params.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  // Single query with a join for the assignee and a subquery for the comment
  // count, mirroring getTicketById (previously this looped one query per row).
  const { rows } = await pool.query(
    `select t.*, u.name as assignee_name,
            (select count(*) from comments c where c.ticket_id = t.id) as comment_count
       from tickets t
       left join users u on u.id = t.assignee_id
       ${where}
      order by t.created_at desc`,
    params
  );

  return rows.map((row) =>
    toTicketDto(row, row.assignee_name ?? null, Number(row.comment_count))
  );
}

export async function getTicketById(id: number): Promise<TicketDto | null> {
  const { rows } = await pool.query(
    `select t.*, u.name as assignee_name,
            (select count(*) from comments c where c.ticket_id = t.id) as comment_count
       from tickets t
       left join users u on u.id = t.assignee_id
      where t.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return toTicketDto(row, row.assignee_name ?? null, Number(row.comment_count));
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  priority: string;
  assigneeId: number | null;
  slaHours: number;
}

export async function createTicket(input: CreateTicketInput): Promise<TicketDto> {
  const { rows } = await pool.query<TicketRow>(
    `insert into tickets (subject, description, status, priority, assignee_id, sla_hours)
     values ($1, $2, 'open', $3, $4, $5)
     returning *`,
    [input.subject, input.description, input.priority, input.assigneeId, input.slaHours]
  );
  const row = rows[0];
  const assigneeName = row.assignee_id
    ? await usersRepository.findNameById(row.assignee_id)
    : null;
  return toTicketDto(row, assigneeName, 0);
}

export async function updateStatus(id: number, status: string): Promise<void> {
  if (status === 'resolved') {
    // Mark resolved and stamp both the resolution and update times.
    await pool.query(
      'update tickets set status = $1, resolved_at = now(), updated_at = now() where id = $2',
      [status, id]
    );
  } else if (status === 'open' || status === 'in_progress') {
    // Reopening: the ticket is active again, so clear the resolution time.
    await pool.query(
      'update tickets set status = $1, resolved_at = null, updated_at = now() where id = $2',
      [status, id]
    );
  } else {
    // 'closed' keeps whatever resolution time it already had.
    await pool.query('update tickets set status = $1, updated_at = now() where id = $2', [
      status,
      id,
    ]);
  }
}
