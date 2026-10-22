// BookLeaf knowledge base, split into sections so a prompt only carries what it needs.
// Sending one category's section instead of the whole KB keeps each draft call small and cheap.

import type { Category } from './types';

export const KB_COMPANY = `ABOUT BOOKLEAF
- Self-publishing company operating in India and the US.
- Packages: "Standard Free" (no upfront cost) and "Bestseller Breakthrough" (premium paid package with marketing and distribution add-ons).
- BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution and royalty management.
- In-house printing facility and warehouse in Delhi. Print partners: Repro India and Epitome Books.`;

export const KB_TONE = `TONE AND COMMUNICATION RULES
- Always empathetic and professional. Authors are partners, not customers to be managed.
- Acknowledge the author's concern before offering solutions.
- Be specific: use actual numbers, dates and statuses instead of vague reassurance.
- If it is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.
- If escalation is needed, give a clear timeline (for example "within 48 hours"), never open-ended promises.
- Always end with a clear next step for the author and/or BookLeaf.`;

export const KB_SECTIONS: Record<Category, string> = {
  ROYALTY_PAYMENTS: `ROYALTY & PAYMENTS
- Split: 80/20 of net profit per book; the author receives 80%.
- Net profit per copy = MRP - printing cost - platform commission (Amazon/Flipkart) - shipping.
- Royalties are calculated quarterly (quarters end Mar 31, Jun 30, Sep 30, Dec 31) and paid within 45 days of quarter end.
- Minimum payout is ₹1,000. Smaller balances roll over to the next quarter.
- Paid by bank transfer to the account linked in the author dashboard.
- The dashboard shows a royalty breakdown with sales per platform.
- Handling: explain the quarterly cycle and 45-day window, ask the author to confirm bank details are linked, give the specific next payout date. If a payment is genuinely overdue, own it and escalate to finance with a 48-hour update. For "why so little" questions, explain the net-profit calculation and offer a line-by-line breakdown; be transparent, not defensive.`,

  ISBN_METADATA: `ISBN & METADATA
- BookLeaf assigns a unique ISBN, registered under BookLeaf's imprint.
- Authors who want their own imprint must obtain their own ISBN independently.
- ISBN errors (duplicate ISBN, wrong book linked, listing ISBN differs from the printed copy) are high priority: a serious data issue that is escalated to the production team immediately, with an update within 48 hours.
- Metadata (description, keywords, author bio) can be updated after the book is live via the dashboard or by email; changes reflect on retail listings in 3-5 business days.`,

  PRINTING_QUALITY: `PRINTING & QUALITY
- Most orders are printed in-house in Delhi; overflow or specific formats go to Repro India or Epitome Books.
- Standard turnaround: 5-7 business days from order confirmation.
- Quality issues (misprints, blurry images, misaligned pages, binding defects, colour inconsistency) get a free reprint after verification.
- The author may need to share photos of the defective copy so the team can verify the issue.
- Handling: apologise sincerely, ask for photos, confirm a free reprint once verified, delivered within 5-7 business days.`,

  DISTRIBUTION_AVAILABILITY: `DISTRIBUTION & AVAILABILITY
- Channels: Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings go live within 7-10 business days after publication completes.
- "Currently Unavailable" or "Out of stock" usually means a stock sync issue between BookLeaf and the platform.
- Handling: the team can trigger a re-sync; the listing is normally restored within 24-48 hours.`,

  BOOK_STATUS_PRODUCTION: `BOOK STATUS & PRODUCTION
- Stages: Manuscript Received -> Editing (if opted) -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live.
- Authors are updated by email at each stage.
- Delays usually happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).
- Handling: state the book's actual current status, be honest about why it is taking longer, give a specific updated timeline, stay collaborative and never blame the author.`,

  GENERAL_INQUIRY: `GENERAL INQUIRIES
- Book descriptions and other listing metadata can be updated after the book is live, via the dashboard or by emailing support. Changes reflect on retail sites in 3-5 business days.
- Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (paid, with marketing and distribution add-ons).
- Distribution channels: Amazon India, Flipkart, Amazon US, Amazon UK, BookLeaf Store.
- Royalties: 80% of net profit to the author, paid quarterly within 45 days of quarter end.`,
};

/** Company + Tone are always included; then only the section for this category. */
export function kbForCategory(category: Category): string {
  return [KB_COMPANY, KB_TONE, KB_SECTIONS[category]].join('\n\n');
}
