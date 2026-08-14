import { z } from 'zod';

const canChangeToSchema = z.object({ name: z.string() }).passthrough();

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
}

export interface BugMeta {
  statuses: string[];
  resolutions: string[];
  severities: string[];
  priorities: string[];
  opSystems: string[];
  platforms: string[];
  workflow: WorkflowTransition[];
}

function valuesOf(fields: z.infer<typeof fieldSchema>[], name: string): string[] {
  const field = fields.find((f) => f.name === name);
  if (!field?.values) return [];
  const names = field.values.map((v) => v.name).filter((n): n is string => Boolean(n));
  return Array.from(new Set(names));
}

/**
 * Builds the status transition graph from the bug_status field. Bugzilla's
 * /field/bug returns, for each status value, an `is_open` flag and the set of
 * statuses it may transition to (`can_change_to`) — exactly the data behind
 * editworkflow.cgi, so we can render the workflow natively instead of embedding
 * the Perl page.
 */
function extractWorkflow(fields: z.infer<typeof fieldSchema>[]): WorkflowTransition[] {
  const statusField = fields.find((f) => f.name === 'bug_status');
  if (!statusField?.values) return [];
  return statusField.values
    .filter((v) => v.name)
    .map((v) => ({
      status: v.name as string,
      isOpen: Boolean(v.is_open),
      canChangeTo: (v.can_change_to ?? []).map((c) => c.name),
    }));
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
    workflow: extractWorkflow(parsed.fields),
  };
}
