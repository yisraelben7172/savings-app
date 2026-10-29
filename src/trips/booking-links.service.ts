import { Injectable } from '@nestjs/common';
import type { TripItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasDocumentedFormat, manualDetails, type BookingContext } from './trip-links';

export type BookingButton = {
  itemId: string;
  kind: 'HOTEL' | 'FLIGHT' | 'CAR';
  title: string;
  store: string;
  goUrl: string; // through /api/go so the click is tracked; the store page itself comes from our stored offer
  prefilled: boolean; // dates/guests are filled in through a documented format
  details: string; // what to enter on the partner site (always shown; with a copy button when not pre-filled)
  disclosure: string | null; // the program's required wording, shown next to its button
  attribution: string | null; // the data source's required wording
  selfReport: string | null;
};

/**
 * The booking buttons for an approved trip plan, flight first, then hotel, then car. This is the only trip code that
 * reads affiliate program settings (for the required disclosure and a documented booking-link format); the planner
 * and its ranking never see them.
 */
@Injectable()
export class BookingLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async buttons(planId: string, items: TripItem[], ctx: BookingContext): Promise<BookingButton[]> {
    const ids = items.map((i) => i.chosenOfferId!).filter(Boolean);
    const offers = await this.prisma.offer.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        source: { select: { attributionText: true } },
        merchant: { select: { name: true, programs: { select: { status: true, disclosureText: true, bookingLinkTemplate: true, bookingLinkDocUrl: true }, orderBy: { createdAt: 'asc' } } } },
      },
    });
    const byId = new Map(offers.map((o) => [o.id, o]));
    const order = { FLIGHT: 0, HOTEL: 1, CAR: 2 } as const;
    return [...items]
      .sort((a, b) => order[a.kind] - order[b.kind] || a.position - b.position)
      .flatMap((i) => {
        const o = byId.get(i.chosenOfferId!);
        if (!o) return [];
        const approved = o.merchant.programs.find((p) => p.status === 'APPROVED' && p.disclosureText);
        const prefilled = o.merchant.programs.some((p) => p.status !== 'REJECTED' && hasDocumentedFormat(p));
        const q = new URLSearchParams({ src: 'web-trip', rec: planId, trip: planId, item: i.id });
        return [{
          itemId: i.id,
          kind: i.kind,
          title: i.title,
          store: o.merchant.name,
          goUrl: `/api/go/${o.id}?${q.toString()}`,
          prefilled,
          details: manualDetails(i.kind, ctx),
          disclosure: approved?.disclosureText ?? null,
          attribution: o.source?.attributionText ?? null,
          selfReport: i.selfReport,
        }];
      });
  }
}
