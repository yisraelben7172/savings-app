/**
 * Who runs the site, for the legal pages. Set these in Vercel (and web/.env.local) so nothing is invented:
 *   NEXT_PUBLIC_BUSINESS_NAME     the name to show (defaults to "Vault")
 *   NEXT_PUBLIC_CONTACT_EMAIL     a real inbox you read; shown on the Contact and Privacy pages
 *   NEXT_PUBLIC_BUSINESS_ADDRESS  your mailing address (a PO box or virtual mailbox is fine)
 */
const EMAIL = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;

const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export const site = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME?.trim() || "Vault",
  email: email && EMAIL.test(email) ? email : null,
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim() || null,
};

/** Update this date whenever the privacy policy or disclosure text changes. */
export const LEGAL_UPDATED = "October 29, 2026";
