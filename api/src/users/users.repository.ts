import { pool } from '../db';

export interface AgentDto {
  id: number;
  name: string;
}

export async function findNameById(id: number): Promise<string | null> {
  const { rows } = await pool.query('select name from users where id = $1', [id]);
  return rows[0]?.name ?? null;
}

export async function listUsers(): Promise<AgentDto[]> {
  const { rows } = await pool.query<AgentDto>(
    'select id, name from users order by name asc'
  );
  return rows;
}
