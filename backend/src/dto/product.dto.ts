import { z } from 'zod';
import type { Subcomponent } from '../services/subcomponents.service';

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
  value: string;
  name: string;
  isActive: boolean;
}

export interface NormalizedComponent {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  defaultAssignee: string;
  subcomponents: NormalizedSubcomponent[];
}

/** subs is the sub-component list grouped by component id (services/subcomponents.service.ts byComponent). */
export function normalizeProduct(raw: RawProduct, subcomponents?: Map<number, Subcomponent[]>): NormalizedProduct {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    isActive: raw.is_active ?? true,
    components: raw.components.map((component) => ({
      id: component.id ?? 0,
      name: component.name,
      description: component.description ?? '',
      isActive: component.is_active ?? true,
      defaultAssignee: component.default_assigned_to ?? '',
      subcomponents: (component.id !== undefined ? (subcomponents?.get(component.id) ?? []) : []).map(
        (subcomponent) => ({
          id: subcomponent.id,
          value: subcomponent.value,
          name: subcomponent.name,
          isActive: subcomponent.isActive,
        }),
      ),
    })),
    versions: raw.versions.map((version) => version.name),
    milestones: raw.milestones.map((milestone) => milestone.name),
  };
}
