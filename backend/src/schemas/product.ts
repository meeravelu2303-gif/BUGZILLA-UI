import { z } from 'zod';
import type { Subcomponent } from '../lib/subcomponents';

const componentSchema = z
  .object({
    id: z.number().optional(),
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
  description: string;
  isActive: boolean;
  components: NormalizedComponent[];
  versions: string[];
  milestones: string[];
}

export interface NormalizedSubcomponent {
  id: number;
  /** Stored value, `<name> [<component id>]` - what filters and bugs carry. */
  value: string;
  name: string;
  isActive: boolean;
}

export interface NormalizedComponent {
  id: number;
  name: string;
  description: string;
  /** Inactive components keep their bugs but are closed for new ones. */
  isActive: boolean;
  defaultAssignee: string;
  /** Sub-components (lib/subcomponents.ts), inactive ones included and flagged. */
  subcomponents: NormalizedSubcomponent[];
}

/**
 * `subs` is the sub-component list grouped by component id (lib/subcomponents.ts
 * `byComponent`). Omitted, components simply carry none.
 */
export function normalizeProduct(raw: RawProduct, subs?: Map<number, Subcomponent[]>): NormalizedProduct {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    isActive: raw.is_active ?? true,
    components: raw.components.map((c) => ({
      id: c.id ?? 0,
      name: c.name,
      description: c.description ?? '',
      isActive: c.is_active ?? true,
      defaultAssignee: c.default_assigned_to ?? '',
      subcomponents: (c.id !== undefined ? subs?.get(c.id) ?? [] : []).map((s) => ({ id: s.id, value: s.value, name: s.name, isActive: s.isActive })),
    })),
    versions: raw.versions.map((v) => v.name),
    milestones: raw.milestones.map((m) => m.name),
  };
}
