import type { Request, RequestHandler, Response } from 'express';

/** Sends a JSON body, with an optional status (the current status is kept when omitted). */
export function sendSuccess(res: Response, data: unknown, status?: number): void {
  if (status !== undefined) res.status(status);
  res.json(data);
}

/** Ends a successful response that has no body (204). */
export function sendNoContent(res: Response): void {
  res.status(204).end();
}

/** Runs an async handler and passes anything it throws to the error middleware. */
export function asyncHandler(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}
