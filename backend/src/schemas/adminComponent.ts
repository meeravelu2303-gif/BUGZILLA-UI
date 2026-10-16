import { z } from 'zod';

/** A component as the UeducateAdmin extension returns it (`/rest/ueducate/component/:id`). */
export const rawAdminComponentSchema = z.object({
  id: z.number(),
  name: z.string(),
  product_id: z.number(),
  product: z.string(),
  description: z.string().default(''),
  default_assignee: z.string().default(''),
  default_qa_contact: z.string().default(''),
  default_cc: z.array(z.string()).default([]),
  is_active: z.boolean(),
  bug_count: z.number(),
  is_last: z.boolean(),
  qa_contact_enabled: z.boolean().default(false),
});

export interface AdminComponent {
  id: number;
  name: string;
  productId: number;
  product: string;
  description: string;
  defaultAssignee: string;
  defaultQaContact: string;
  defaultCc: string[];
  isActive: boolean;
  /** Every bug in the component, visible to the caller or not - what blocks a delete. */
  bugCount: number;
  /** The product's only component; Bugzilla never deletes the last one. */
  isLast: boolean;
  /** Bugzilla's useqacontact parameter. Off: any QA contact sent is ignored, so the field is disabled. */
  qaContactEnabled: boolean;
}

export function normalizeAdminComponent(raw: z.infer<typeof rawAdminComponentSchema>): AdminComponent {
  return {
    id: raw.id,
    name: raw.name,
    productId: raw.product_id,
    product: raw.product,
    description: raw.description,
    defaultAssignee: raw.default_assignee,
    defaultQaContact: raw.default_qa_contact,
    defaultCc: raw.default_cc,
    isActive: raw.is_active,
    bugCount: raw.bug_count,
    isLast: raw.is_last,
    qaContactEnabled: raw.qa_contact_enabled,
  };
}

const email = z.string().trim().email('Enter a valid email address');

export const updateComponentSchema = z
  .object({
    name: z.string().trim().min(1, 'Component name is required').max(64).optional(),
    description: z.string().trim().min(1, 'Description is required').optional(),
    defaultAssignee: email.optional(),
    /** Empty string clears it - the QA contact is optional in Bugzilla. */
    defaultQaContact: z.union([email, z.literal('')]).optional(),
    defaultCc: z.array(email).max(50).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;
