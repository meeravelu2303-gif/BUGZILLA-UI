import { z } from 'zod';

const fieldValueSchema = z.object({ name: z.string().nullable() }).passthrough();

const fieldSchema = z
  .object({
    name: z.string(),
    display_name: z.string().optional(),
    is_mandatory: z.boolean().optional(),
    values: z.array(fieldValueSchema).optional(),
  })
  .passthrough();

export const fieldBugResponseSchema = z.object({ fields: z.array(fieldSchema) });

export interface BugMeta {
  statuses: string[];
  resolutions: string[];
  severities: string[];
  priorities: string[];
  opSystems: string[];
  platforms: string[];
}

function valuesOf(fields: z.infer<typeof fieldSchema>[], name: string): string[] {
  const field = fields.find((f) => f.name === name);
  if (!field?.values) return [];
  const names = field.values.map((v) => v.name).filter((n): n is string => Boolean(n));
  return Array.from(new Set(names));
}

export function extractBugMeta(raw: unknown): BugMeta {
  const parsed = fieldBugResponseSchema.parse(raw);
  return {
    statuses: valuesOf(parsed.fields, 'bug_status'),
    resolutions: valuesOf(parsed.fields, 'resolution').filter((r) => r !== ''),
    severities: valuesOf(parsed.fields, 'bug_severity'),
    priorities: valuesOf(parsed.fields, 'priority'),
    opSystems: valuesOf(parsed.fields, 'op_sys'),
    platforms: valuesOf(parsed.fields, 'rep_platform'),
  };
}
