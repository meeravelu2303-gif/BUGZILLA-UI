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
