import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';
import { pool } from '../src/db';
import { ensureTestDatabase, resetDatabase } from './helpers';

const app = buildServer({ logger: false });

beforeAll(async () => {
  await ensureTestDatabase();
  await app.ready();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /tickets', () => {
  it('returns all tickets with assignee name and comment count', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets' });

    expect(res.statusCode).toBe(200);
    const tickets = res.json();
    expect(tickets).toHaveLength(3);

    const printer = tickets.find((t: any) => t.subject === 'Printer on fire');
    expect(printer).toMatchObject({
      status: 'open',
      priority: 'urgent',
      assigneeName: 'Ada Fixture',
      commentCount: 2,
      slaHours: 4,
      // 2h into a 4h SLA, unresolved
      slaStatus: 'ok',
    });
    expect(printer.createdAt).toBeTypeOf('string');

    const unassigned = tickets.find((t: any) => t.subject === 'Unassigned question');
    expect(unassigned.assigneeId).toBeNull();
    expect(unassigned.assigneeName).toBeNull();
    expect(unassigned.commentCount).toBe(0);
  });

  it('flags an overdue ticket as breached', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets' });
    const tickets = res.json();

    // "Slow reports page" is ~2 days old with a 24h SLA and unresolved.
    const overdue = tickets.find((t: any) => t.subject === 'Slow reports page');
    expect(overdue.slaStatus).toBe('breached');
  });

  describe('filtering', () => {
    it('filters by status', async () => {
      const res = await app.inject({ method: 'GET', url: '/tickets?status=open' });

      expect(res.statusCode).toBe(200);
      const tickets = res.json();
      expect(tickets).toHaveLength(2);
      expect(tickets.every((t: any) => t.status === 'open')).toBe(true);
    });

    it('filters by assignee', async () => {
      const res = await app.inject({ method: 'GET', url: '/tickets?assigneeId=2' });

      expect(res.statusCode).toBe(200);
      const tickets = res.json();
      expect(tickets).toHaveLength(1);
      expect(tickets[0].subject).toBe('Slow reports page');
    });

    it('combines status and assignee filters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tickets?status=open&assigneeId=1',
      });

      expect(res.statusCode).toBe(200);
      const tickets = res.json();
      expect(tickets).toHaveLength(1);
      expect(tickets[0].subject).toBe('Printer on fire');
    });

    it('returns an empty list when nothing matches', async () => {
      const res = await app.inject({ method: 'GET', url: '/tickets?status=closed' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it('rejects an invalid status filter', async () => {
      const res = await app.inject({ method: 'GET', url: '/tickets?status=archived' });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
    });
  });
});

describe('GET /users', () => {
  it('returns the agents for the assignee filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/users' });

    expect(res.statusCode).toBe(200);
    const users = res.json();
    expect(users).toHaveLength(2);
    expect(users.map((u: any) => u.name)).toEqual(['Ada Fixture', 'Grace Fixture']);
  });
});

describe('GET /tickets/:id', () => {
  it('returns the ticket with its comments', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets/1' });

    expect(res.statusCode).toBe(200);
    const ticket = res.json();
    expect(ticket.subject).toBe('Printer on fire');
    expect(ticket.comments).toHaveLength(2);
    expect(ticket.comments[0]).toMatchObject({
      ticketId: 1,
      authorName: 'Grace Fixture',
      body: 'Extinguisher deployed, assessing damage.',
    });
  });

  it('returns 404 for an unknown ticket', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets/999' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Ticket 999 not found' });
  });
});

describe('POST /tickets', () => {
  it('creates a ticket with defaults applied', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tickets',
      payload: {
        subject: 'Keyboard missing keys',
        description: 'The E and R keys have vanished.',
      },
    });

    expect(res.statusCode).toBe(201);
    const ticket = res.json();
    expect(ticket).toMatchObject({
      subject: 'Keyboard missing keys',
      status: 'open',
      priority: 'medium',
      assigneeId: null,
      assigneeName: null,
      slaHours: 8,
      commentCount: 0,
      resolvedAt: null,
    });
  });

  it('rejects an invalid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tickets',
      payload: { subject: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Validation failed');
  });
});

describe('PATCH /tickets/:id/status', () => {
  it('updates the status and returns the ticket', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/tickets/1/status',
      payload: { status: 'in_progress' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('in_progress');
  });

  it('rejects an unknown status value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/tickets/1/status',
      payload: { status: 'archived' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('stamps resolved_at when moving to resolved and clears it on reopen', async () => {
    const resolved = await app.inject({
      method: 'PATCH',
      url: '/tickets/1/status',
      payload: { status: 'resolved' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().resolvedAt).toBeTypeOf('string');

    const reopened = await app.inject({
      method: 'PATCH',
      url: '/tickets/1/status',
      payload: { status: 'open' },
    });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json().resolvedAt).toBeNull();
  });
});

describe('POST /tickets/:id/comments', () => {
  it('creates a comment and returns it with the author name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tickets/1/comments',
      payload: { authorId: 1, body: 'Following up on this.' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      ticketId: 1,
      authorId: 1,
      authorName: 'Ada Fixture',
      body: 'Following up on this.',
    });

    const detail = await app.inject({ method: 'GET', url: '/tickets/1' });
    expect(detail.json().comments).toHaveLength(3);
  });

  it('returns 404 for a missing ticket', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tickets/9999/comments',
      payload: { authorId: 1, body: 'Hello?' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects an empty body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tickets/1/comments',
      payload: { authorId: 1, body: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown author', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tickets/1/comments',
      payload: { authorId: 9999, body: 'Ghost comment.' },
    });

    expect(res.statusCode).toBe(400);
  });
});
