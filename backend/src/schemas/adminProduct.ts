import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().min(1, 'Description is required'),
  version: z.string().min(1, 'An initial version is required'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    /** Bugzilla limits product names to 64 characters (MAX_PRODUCT_SIZE). */
    name: z.string().trim().min(1, 'Product name is required').max(64, 'At most 64 characters').optional(),
    description: z.string().trim().min(1, 'Description is required').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Deleting asks for the product's name, typed out - the one action here that cannot be undone. */
export const deleteProductSchema = z.object({ confirmName: z.string().trim().min(1, 'Type the product name to confirm') });

export const createComponentSchema = z.object({
  name: z.string().min(1, 'Component name is required'),
  description: z.string().min(1, 'Description is required'),
  defaultAssignee: z.string().email('Enter a valid assignee email'),
});

export type CreateComponentInput = z.infer<typeof createComponentSchema>;
