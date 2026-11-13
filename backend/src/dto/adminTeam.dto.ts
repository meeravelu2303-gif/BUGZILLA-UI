import { z } from 'zod';

const person = z.string().trim().email('Choose a person from the list.');

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Please give the team a name.').max(64, 'A team name can be at most 64 characters.'),
  leader: person,
  members: z.array(person).max(500).default([]),
});

export const idSchema = z.object({ id: z.coerce.number().int().positive() });

export interface TeamPerson {
  id: number;
  email: string;
  name: string;
}

export interface Team {
  id: number;
  name: string;
  leader: TeamPerson | null;
  members: TeamPerson[];
  created: string;
}

export const updateTeamSchema = createTeamSchema.partial();
