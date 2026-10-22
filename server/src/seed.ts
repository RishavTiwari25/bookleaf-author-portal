/**
 * Seeds the database with BookLeaf's sample dataset (10 authors, 18 books),
 * two support-team logins and a handful of realistic tickets.
 *
 * Safe to run on every deploy: users/authors/books are upserted, and sample
 * tickets are only inserted when the tickets table is empty.
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export const AUTHOR_PASSWORD = 'Author@123';
export const ADMIN_PASSWORD = 'Admin@123';

const DATA_FILE = path.resolve(__dirname, '../prisma/seed-data/bookleaf_sample_data.json');

interface RawBook {
  book_id: string;
  title: string;
  isbn: string;
  genre: string;
  publication_date: string | null;
  status: string;
  mrp: number | null;
  author_royalty_per_copy: number | null;
  total_copies_sold: number;
  total_royalty_earned: number;
  royalty_paid: number;
  royalty_pending: number;
  last_royalty_payout_date: string | null;
  print_partner: string | null;
  available_on: string[];
}

interface RawAuthor {
  author_id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  joined_date: string;
  books: RawBook[];
}

const toDate = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null);
const hoursAgo = (h: number) => new Date(Date.now() - h * 36e5);

const ADMINS = [
  { email: 'admin@bookleaf.test', name: 'Neha Verma' },
  { email: 'ops@bookleaf.test', name: 'Karan Mehta' },
];

async function seedUsersAndBooks() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as { authors: RawAuthor[] };
  const [authorHash, adminHash] = await Promise.all([
    bcrypt.hash(AUTHOR_PASSWORD, 10),
    bcrypt.hash(ADMIN_PASSWORD, 10),
  ]);

  for (const admin of ADMINS) {
    await prisma.user.upsert({
      where: { email: admin.email },
      update: { name: admin.name, role: 'ADMIN', passwordHash: adminHash },
      create: { ...admin, role: 'ADMIN', passwordHash: adminHash },
    });
  }

  for (const a of raw.authors) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { name: a.name, role: 'AUTHOR', passwordHash: authorHash },
      create: { email: a.email, name: a.name, role: 'AUTHOR', passwordHash: authorHash },
    });

    const profile = { phone: a.phone, city: a.city, joinedDate: toDate(a.joined_date)! };
    await prisma.author.upsert({
      where: { id: a.author_id },
      update: profile,
      create: { id: a.author_id, userId: user.id, ...profile },
    });

    for (const b of a.books) {
      const book = {
        authorId: a.author_id,
        title: b.title,
        isbn: b.isbn,
        genre: b.genre,
        publicationDate: toDate(b.publication_date),
        status: b.status,
        mrp: b.mrp,
        royaltyPerCopy: b.author_royalty_per_copy,
        totalCopiesSold: b.total_copies_sold,
        totalRoyaltyEarned: b.total_royalty_earned,
        royaltyPaid: b.royalty_paid,
        royaltyPending: b.royalty_pending,
        lastRoyaltyPayoutDate: toDate(b.last_royalty_payout_date),
        printPartner: b.print_partner,
        availableOn: b.available_on,
      };
      await prisma.book.upsert({
        where: { bookCode: b.book_id },
        update: book,
        create: { bookCode: b.book_id, ...book },
      });
    }
  }

  return raw.authors.length;
}

interface SampleTicket {
  authorId: string;
  bookCode: string | null;
  subject: string;
  description: string;
  category: Prisma.TicketCreateInput['category'];
  priority: Prisma.TicketCreateInput['priority'];
  status: Prisma.TicketCreateInput['status'];
  hoursAgo: number;
  assignTo?: string;
  response?: string;
  note?: string;
}

const SAMPLE_TICKETS: SampleTicket[] = [
  {
    authorId: 'AUTH002',
    bookCode: 'BK004',
    subject: 'ISBN on Amazon listing does not match my printed copies',
    description:
      'The ISBN shown on the Amazon India page for Startup Sutra is different from the one printed on the back cover of my author copies. Readers are asking me which one is correct and I am worried sales are being linked to the wrong book.',
    category: 'ISBN_METADATA',
    priority: 'CRITICAL',
    status: 'OPEN',
    hoursAgo: 5,
  },
  {
    authorId: 'AUTH001',
    bookCode: 'BK001',
    subject: 'Royalty not received for the last 4 months',
    description:
      'My dashboard shows ₹3,570 pending for Whispers of the Ganges but I have not received any payment since October. It has been about four months now. Could you please check what is happening?',
    category: 'ROYALTY_PAYMENTS',
    priority: 'HIGH',
    status: 'OPEN',
    hoursAgo: 74,
  },
  {
    authorId: 'AUTH005',
    bookCode: 'BK009',
    subject: 'Letters from Lakshadweep shows "Currently Unavailable" on Amazon US',
    description:
      'A friend in the US tried to order my book yesterday and Amazon US says "Currently unavailable". It is still showing fine on Amazon India. Is the US listing broken?',
    category: 'DISTRIBUTION_AVAILABILITY',
    priority: 'HIGH',
    status: 'OPEN',
    hoursAgo: 20,
  },
  {
    authorId: 'AUTH003',
    bookCode: 'BK005',
    subject: 'Binding coming apart in my author copies',
    description:
      'I received 20 author copies of Between Two Temples last week and in at least 6 of them the pages are coming loose from the spine. I have a book launch in two weeks and cannot hand these out.',
    category: 'PRINTING_QUALITY',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    hoursAgo: 46,
    assignTo: 'admin@bookleaf.test',
    response:
      "Hi Ananya, I'm really sorry about this, especially with your launch coming up. Could you reply with 2-3 clear photos of the affected copies (spine and loose pages)? Once our print team verifies them we'll reprint the copies free of cost. Reprints take 5-7 business days from confirmation, so you'll have them before your launch.",
    note: 'Batch was printed by Epitome Books. Asked their QC team to check the same print run.',
  },
  {
    authorId: 'AUTH009',
    bookCode: 'BK015',
    subject: 'Raising Roots has been stuck in typesetting for 3 weeks',
    description:
      'My book has shown "Typesetting" for three weeks now with no update. I approved the cover long ago. Can someone tell me what is going on and when I can expect proofs?',
    category: 'BOOK_STATUS_PRODUCTION',
    priority: 'MEDIUM',
    status: 'OPEN',
    hoursAgo: 60,
  },
  {
    authorId: 'AUTH006',
    bookCode: 'BK010',
    subject: 'When will I receive my first royalty payment?',
    description:
      'Turban Tales has sold 88 copies and the dashboard shows ₹2,464 pending, but I have never received a payout. When is the first payment and do I need to do anything to receive it?',
    category: 'ROYALTY_PAYMENTS',
    priority: 'MEDIUM',
    status: 'OPEN',
    hoursAgo: 30,
  },
  {
    authorId: 'AUTH007',
    bookCode: 'BK013',
    subject: 'Next cover draft for Midnight in Mysore',
    description:
      'I sent my feedback on the first cover concept for Midnight in Mysore last week. When can I expect the revised draft? I would like to move to typesetting soon.',
    category: 'BOOK_STATUS_PRODUCTION',
    priority: 'MEDIUM',
    status: 'IN_PROGRESS',
    hoursAgo: 26,
    assignTo: 'ops@bookleaf.test',
    response:
      "Hi Sneha, thanks for the detailed feedback. Our designer is working on the revised cover now and you'll receive it by email within 2 business days. Once you approve it, the book moves straight to typesetting.",
  },
  {
    authorId: 'AUTH008',
    bookCode: 'BK014',
    subject: 'Can I update the book description on Amazon?',
    description:
      'I would like to add a short review quote to the description of Ghazal of the Forgotten on Amazon. Is that possible now that the book is live?',
    category: 'ISBN_METADATA',
    priority: 'LOW',
    status: 'OPEN',
    hoursAgo: 8,
  },
  {
    authorId: 'AUTH004',
    bookCode: 'BK006',
    subject: 'Royalty seems low compared to copies sold',
    description:
      'Debugging Life has sold 534 copies but my total royalty is only ₹13,350. That is ₹25 per copy on a ₹299 book. Can you explain how this is calculated?',
    category: 'ROYALTY_PAYMENTS',
    priority: 'MEDIUM',
    status: 'RESOLVED',
    hoursAgo: 150,
    assignTo: 'admin@bookleaf.test',
    response:
      'Hi Vikram, great question. Your royalty is 80% of the net profit per copy, where net profit = MRP (₹299) minus printing cost, platform commission (Amazon/Flipkart) and shipping. That works out to ₹25 per copy for Debugging Life, so 534 copies = ₹13,350. ₹10,000 has been paid and ₹3,350 is pending for the next quarterly payout. Happy to send a line-by-line breakdown per platform if useful.',
  },
  {
    authorId: 'AUTH010',
    bookCode: null,
    subject: 'How do I change my bank account for payouts?',
    description:
      'I have moved to a new bank and want my future royalty payments to go to the new account. What is the process to update it?',
    category: 'GENERAL_INQUIRY',
    priority: 'LOW',
    status: 'CLOSED',
    hoursAgo: 240,
    assignTo: 'ops@bookleaf.test',
    response:
      'Hi Diya, you can update your bank account from Dashboard → Settings → Payout details. The change applies to the next quarterly payout. Let us know if you face any issue.',
  },
];

async function seedTickets() {
  if ((await prisma.ticket.count()) > 0) return 0;

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
  const adminByEmail = new Map(admins.map((a) => [a.email, a]));

  for (const t of SAMPLE_TICKETS) {
    const book = t.bookCode ? await prisma.book.findUniqueOrThrow({ where: { bookCode: t.bookCode } }) : null;
    const createdAt = hoursAgo(t.hoursAgo);
    const assignee = t.assignTo ? adminByEmail.get(t.assignTo) : undefined;
    const resolved = t.status === 'RESOLVED' || t.status === 'CLOSED';

    const messages: Prisma.TicketMessageUncheckedCreateWithoutTicketInput[] = [];
    if (t.response && assignee) {
      messages.push({ senderId: assignee.id, kind: 'RESPONSE', body: t.response, createdAt: hoursAgo(t.hoursAgo - 3) });
    }
    if (t.note && assignee) {
      messages.push({ senderId: assignee.id, kind: 'INTERNAL_NOTE', body: t.note, createdAt: hoursAgo(t.hoursAgo - 2) });
    }

    await prisma.ticket.create({
      data: {
        authorId: t.authorId,
        bookId: book?.id ?? null,
        subject: t.subject,
        description: t.description,
        status: t.status,
        // Sample tickets are pre-triaged fixtures, so we label them as manually classified.
        category: t.category,
        categorySource: 'MANUAL',
        priority: t.priority,
        prioritySource: 'MANUAL',
        assigneeId: assignee?.id,
        createdAt,
        updatedAt: messages.length ? hoursAgo(t.hoursAgo - 3) : createdAt,
        resolvedAt: resolved ? hoursAgo(t.hoursAgo - 24) : null,
        messages: { create: messages },
      },
    });
  }
  return SAMPLE_TICKETS.length;
}

async function main() {
  const authors = await seedUsersAndBooks();
  const tickets = await seedTickets();
  console.log(`Seed complete: ${authors} authors, ${ADMINS.length} admins, ${tickets} new sample tickets`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
