import { z } from 'zod';

export const ticketIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Query filters for GET /tickets. Both are optional and combinable; absent
// filters mean "no restriction". Query strings arrive as text, so assigneeId
// is coerced to a number.
export const listTicketsQuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  assigneeId: z.coerce.number().int().positive().optional(),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigneeId: z.number().int().positive().nullable().default(null),
  slaHours: z.number().int().positive().default(8),
});

export const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

export const createCommentSchema = z.object({
  authorId: z.number().int().positive(),
  body: z.string().min(1).max(5000),
});
