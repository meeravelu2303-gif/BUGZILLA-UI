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

  // body-parser's own refusal of an oversized upload: a readable 413, not "something went wrong".
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({
      error: true,
      status: 413,
      code: 'VALIDATION',
      message: 'That file is too large to upload.',
    });
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
