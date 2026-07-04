import { pool } from '../db';
import type { CommentRow } from '../mappers';

export async function countForTicket(ticketId: number): Promise<number> {
  const { rows } = await pool.query(
    'select count(*) from comments where ticket_id = $1',
    [ticketId]
  );
  return Number(rows[0].count);
}

export async function listForTicket(ticketId: number): Promise<CommentRow[]> {
  const { rows } = await pool.query(
    `select c.id, c.ticket_id, c.author_id, u.name as author_name, c.body, c.created_at
       from comments c
       join users u on u.id = c.author_id
      where c.ticket_id = $1
      order by c.created_at asc`,
    [ticketId]
  );
  return rows;
}

export interface CreateCommentInput {
  ticketId: number;
  authorId: number;
  body: string;
}

export async function createComment(input: CreateCommentInput): Promise<CommentRow> {
  const inserted = await pool.query('insert into comments (ticket_id, author_id, body) values ($1, $2, $3) returning id', [
    input.ticketId,
    input.authorId,
    input.body,
  ]);
  // Re-select joined so the returned row carries the author's name, matching
  // the shape produced by listForTicket.
  const { rows } = await pool.query(
    `select c.id, c.ticket_id, c.author_id, u.name as author_name, c.body, c.created_at
       from comments c
       join users u on u.id = c.author_id
      where c.id = $1`,
    [inserted.rows[0].id]
  );
  return rows[0];
}
