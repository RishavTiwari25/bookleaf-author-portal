import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config';
import { AppError } from '../lib/errors';

/** What we put inside the JWT and attach to req.user. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Set for authors only: the Author row this login owns. */
  authorId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload & AuthUser;
    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      authorId: payload.authorId,
    };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Your session is invalid or has expired. Please log in again.');
  }
}

/** Requires a valid `Authorization: Bearer <jwt>` header. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Missing bearer token');
  }
  req.user = verifyToken(header.slice('Bearer '.length));
  next();
}

/** Role-based access control. Use after requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 'You do not have permission to access this resource');
    }
    next();
  };
}

/** Small helper so route handlers don't need non-null assertions everywhere. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Not authenticated');
  return req.user;
}
