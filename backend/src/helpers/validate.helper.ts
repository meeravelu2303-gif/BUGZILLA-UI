import type { z, ZodTypeAny } from 'zod';
import { badRequest } from './errors.helper';

/** Parses client-supplied input (body/query/params). */
export function parseInput<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
    throw badRequest(message);
  }
  return result.data;
}
