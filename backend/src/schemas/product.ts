import { z } from 'zod';

const componentSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    default_assigned_to: z.string().optional(),
    is_active: z.boolean().optional(),
  })
  .passthrough();

const versionSchema = z.object({ name: z.string(), is_active: z.boolean().optional() }).passthrough();
const milestoneSchema = z.object({ name: z.string(), is_active: z.boolean().optional() }).passthrough();

export const rawProductSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().optional(),
    is_active: z.boolean().optional(),
    components: z.array(componentSchema).default([]),
    versions: z.array(versionSchema).default([]),
    milestones: z.array(milestoneSchema).default([]),
  })
  .passthrough();

export type RawProduct = z.infer<typeof rawProductSchema>;

export interface NormalizedProduct {
  id: number;
  name: string;
  isActive: boolean;
  components: { name: string; defaultAssignee: string }[];
  versions: string[];
  milestones: string[];
}

export function normalizeProduct(raw: RawProduct): NormalizedProduct {
  return {
    id: raw.id,
    name: raw.name,
    isActive: raw.is_active ?? true,
    components: raw.components.map((c) => ({ name: c.name, defaultAssignee: c.default_assigned_to ?? '' })),
    versions: raw.versions.map((v) => v.name),
    milestones: raw.milestones.map((m) => m.name),
  };
}
