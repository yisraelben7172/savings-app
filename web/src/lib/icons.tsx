import { BedDouble, Car, Droplet, Laptop, Plane, Shirt, Sofa, Tag, Ticket, type LucideIcon } from "lucide-react";

const byCategory: Record<string, LucideIcon> = {
  electronics: Laptop,
  clothing: Shirt,
  beauty: Droplet,
  hotels: BedDouble,
  "car-rentals": Car,
  concerts: Ticket,
  home: Sofa,
  flights: Plane,
};

export function CategoryIcon({ slug, size = 24, strokeWidth = 1.6 }: { slug: string; size?: number; strokeWidth?: number }) {
  const Icon = byCategory[slug] ?? Tag;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden />;
}
