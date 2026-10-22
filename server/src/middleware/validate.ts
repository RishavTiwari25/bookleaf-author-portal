import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

/**
 * Validates req.body against a zod schema and replaces it with the parsed value
 * (so defaults/trimming are applied). A ZodError is turned into a 400 by the error handler.
 */
export function validateBody(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}

/** Parses query params. Express 5 makes req.query read-only, so callers read the parsed value from res.locals.query. */
export function validateQuery(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.locals.query = schema.parse(req.query);
    next();
  };
}
