import { PrismaClient } from '@prisma/client';

// One shared client for the whole process (Prisma manages the connection pool).
export const prisma = new PrismaClient();
