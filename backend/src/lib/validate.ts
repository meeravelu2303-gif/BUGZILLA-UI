import type { z, ZodTypeAny } from 'zod';
import { AppError } from './errors';

/**
 * Parses client-supplied input (body/query/params). On failure, throws a 400
 * VALIDATION AppError with a readable message - distinct from ZodErrors
 * thrown while parsing *upstream* Bugzilla responses, which the central
 * error handler maps to 502 UPSTREAM_ERROR instead (see middleware/errorHandler.ts).
 */
export function parseInput<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
    throw new AppError(400, 'VALIDATION', message);
  }
  return result.data;
}
