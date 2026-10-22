import { Router } from 'express';
import { prisma } from '../db';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { serializeBook } from '../services/serializers';

/** Author-only: every query is filtered by the logged-in author's id. */
export const booksRouter = Router();
booksRouter.use(requireAuth, requireRole('AUTHOR'));

booksRouter.get('/', async (req, res) => {
  const books = await prisma.book.findMany({
    where: { authorId: currentUser(req).authorId! },
    orderBy: { bookCode: 'asc' },
  });
  res.json({ books: books.map(serializeBook) });
});

booksRouter.get('/summary', async (req, res) => {
  const where = { authorId: currentUser(req).authorId! };
  const [totalBooks, sums] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.aggregate({
      where,
      _sum: { totalCopiesSold: true, totalRoyaltyEarned: true, royaltyPaid: true, royaltyPending: true },
    }),
  ]);
  res.json({
    totalBooks,
    totalCopiesSold: sums._sum.totalCopiesSold ?? 0,
    totalRoyaltyEarned: sums._sum.totalRoyaltyEarned ?? 0,
    royaltyPaid: sums._sum.royaltyPaid ?? 0,
    royaltyPending: sums._sum.royaltyPending ?? 0,
  });
});
