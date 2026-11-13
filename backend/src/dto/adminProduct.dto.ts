import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(64, 'At most 64 characters'),
  description: z.string().trim().min(1, 'Description is required'),
  version: z.string().trim().min(1, 'An initial version is required'),
  component: z.object({
    name: z.string().trim().min(1, 'Component name is required').max(64, 'At most 64 characters'),
    description: z.string().trim().min(1, 'Component description is required'),
    defaultAssignee: z.string().trim().email('Choose the developer who owns this component'),
  }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name is required').max(64, 'At most 64 characters').optional(),
    description: z.string().trim().min(1, 'Description is required').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Deleting asks for the product's name, typed out - the one action here that cannot be undone. */
export const deleteProductSchema = z.object({
  confirmName: z.string().trim().min(1, 'Type the product name to confirm'),
});

export const createComponentSchema = z.object({
  name: z.string().min(1, 'Component name is required'),
  description: z.string().min(1, 'Description is required'),
  defaultAssignee: z.string().email('Enter a valid assignee email'),
});

export type CreateComponentInput = z.infer<typeof createComponentSchema>;

/** A sub-component under one of the product's components (services/subcomponents.service.ts). */
export const createSubcomponentSchema = z.object({
  componentId: z.number().int().positive(),
  name: z.string().min(1, 'Sub-component name is required').max(100),
});

export const updateSubcomponentSchema = z
  .object({
    name: z.string().min(1, 'Sub-component name is required').max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, { message: 'Nothing to change' });

/** Editing a component (through the SubComponents extension - Bugzilla's REST cannot). */
export const updateComponentSchema = z
  .object({
    name: z.string().trim().min(1, 'Component name is required').max(64, 'At most 64 characters').optional(),
    description: z.string().trim().min(1, 'Description is required').max(2000).optional(),
    defaultAssignee: z.string().trim().email('Enter a valid assignee email').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((x) => x !== undefined), { message: 'Nothing to change' });

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const subcomponentParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  subId: z.coerce.number().int().positive(),
});

export const componentParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  componentId: z.coerce.number().int().positive(),
});
