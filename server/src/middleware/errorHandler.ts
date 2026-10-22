import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

function send(res: Response, status: number, body: ErrorBody) {
  res.status(status).json(body);
}

/** Single place that turns any thrown error into the API's error shape. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return send(res, err.status, { error: { code: err.code, message: err.message, details: err.details } });
  }

  if (err instanceof ZodError) {
    return send(res, 400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      },
    });
  }

  // Malformed JSON body (thrown by express.json()).
  if (err instanceof SyntaxError && 'body' in err) {
    return send(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }
    if (err.code === 'P2002') {
      return send(res, 409, { error: { code: 'CONFLICT', message: 'A record with these details already exists' } });
    }
    if (err.code === 'P2003') {
      return send(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'A referenced record does not exist' } });
    }
  }

  console.error('Unhandled error:', err);
  return send(res, 500, {
    error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  send(res, 404, { error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}
