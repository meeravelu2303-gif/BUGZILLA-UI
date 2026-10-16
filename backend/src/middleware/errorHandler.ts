import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: true,
    status: 404,
    code: 'NOT_FOUND',
    message: `No route: ${req.method} ${req.path}`,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json(err.toBody());
    return;
  }

  /*
   * express.json() failures. These are the CLIENT's fault - a body that is not JSON, or one over
   * the size limit (the evidence-upload route allows 25 MB) - but they arrive as plain errors and
   * used to fall through to the generic 500, telling the caller our server had failed.
   */
  const parserType = (err as { type?: unknown } | null)?.type;
  if (parserType === 'entity.parse.failed') {
    res.status(400).json({ error: true, status: 400, code: 'VALIDATION', message: 'The request body is not valid JSON.' });
    return;
  }
  if (parserType === 'entity.too.large') {
    res.status(413).json({ error: true, status: 413, code: 'VALIDATION', message: 'The request is too large.' });
    return;
  }

  if (err instanceof ZodError) {
    res.status(502).json({
      error: true,
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'Bugzilla returned data in an unexpected shape.',
    });
    return;
  }

  // Never leak stack traces or raw error messages for anything unexpected.
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: true,
    status: 500,
    code: 'INTERNAL',
    message: 'Something went wrong on our end.',
  });
}
