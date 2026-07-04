export type SlaStatus = 'ok' | 'at_risk' | 'breached';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

// Single source of truth for the selectable statuses, shared by the list
// filter and the detail-page status control so the two can't drift apart.
export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

export interface Agent {
  id: number;
  name: string;
}

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId: number | null;
  assigneeName: string | null;
  slaHours: number;
  slaStatus: SlaStatus;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface Comment {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface TicketWithComments extends Ticket {
  comments: Comment[];
}
