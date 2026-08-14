import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().min(1, 'Description is required'),
  version: z.string().min(1, 'An initial version is required'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    description: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const createComponentSchema = z.object({
  name: z.string().min(1, 'Component name is required'),
  description: z.string().min(1, 'Description is required'),
  defaultAssignee: z.string().email('Enter a valid assignee email'),
});

export type CreateComponentInput = z.infer<typeof createComponentSchema>;
