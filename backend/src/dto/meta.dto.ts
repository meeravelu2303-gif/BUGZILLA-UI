import { z } from 'zod';

const canChangeToSchema = z.object({ name: z.string(), comment_required: z.boolean().optional() }).passthrough();

const fieldValueSchema = z
  .object({
    name: z.string().nullable(),
    is_open: z.boolean().optional(),
    can_change_to: z.array(canChangeToSchema).optional(),
  })
  .passthrough();

const fieldSchema = z
  .object({
    name: z.string(),
    display_name: z.string().optional(),
    is_mandatory: z.boolean().optional(),
    values: z.array(fieldValueSchema).optional(),
  })
  .passthrough();

export const fieldBugResponseSchema = z.object({ fields: z.array(fieldSchema) });

export interface WorkflowTransition {
  status: string;
  isOpen: boolean;
  canChangeTo: string[];
  commentRequiredTo: string[];
}

export interface BugMeta {
  statuses: string[];
  resolutions: string[];
  severities: string[];
  priorities: string[];
  opSystems: string[];
  platforms: string[];
  keywords: string[];
  workflow: WorkflowTransition[];
}

function valuesOf(fields: z.infer<typeof fieldSchema>[], name: string): string[] {
  const field = fields.find((candidate) => candidate.name === name);
  if (!field?.values) return [];
  const names = field.values.map((value) => value.name).filter((value): value is string => Boolean(value));
  return Array.from(new Set(names));
}

function extractWorkflow(fields: z.infer<typeof fieldSchema>[]): WorkflowTransition[] {
  const statusField = fields.find((field) => field.name === 'bug_status');
  if (!statusField?.values) return [];
  return statusField.values
    .filter((value) => value.name)
    .map((value) => ({
      status: value.name as string,
      isOpen: Boolean(value.is_open),
      canChangeTo: (value.can_change_to ?? []).map((item) => item.name),
      commentRequiredTo: (value.can_change_to ?? []).filter((item) => item.comment_required).map((item) => item.name),
    }));
}

export function extractBugMeta(raw: unknown): BugMeta {
  const parsed = fieldBugResponseSchema.parse(raw);
  return {
    statuses: valuesOf(parsed.fields, 'bug_status'),
    resolutions: valuesOf(parsed.fields, 'resolution').filter((value) => value !== '' && value !== 'DELETED'),
    severities: valuesOf(parsed.fields, 'bug_severity'),
    priorities: valuesOf(parsed.fields, 'priority'),
    opSystems: valuesOf(parsed.fields, 'op_sys'),
    platforms: valuesOf(parsed.fields, 'rep_platform'),
    keywords: valuesOf(parsed.fields, 'keywords'),
    workflow: extractWorkflow(parsed.fields),
  };
}
