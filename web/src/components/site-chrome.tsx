import { Heart } from "lucide-react";
import Link from "next/link";

export function Nav() {
  return (
    <div className="wrap">
      <nav className="nav" aria-label="Main">
        <Link className="logo" href="/">
          <i aria-hidden />
          Vault
        </Link>
        <div className="navlinks">
          <Link href="/deals">Shopping</Link>
          <Link href="/category/hotels">Travel</Link>
          <Link href="/category/concerts">Events</Link>
          <Link href="/saved">Price alerts</Link>
          <Link href="/gold" className="gold-link">
            Gold
          </Link>
        </div>
        <div className="nav-right">
          <Link className="icon-btn" href="/saved" aria-label="Saved deals">
            <Heart size={20} aria-hidden />
          </Link>
          <Link className="btn" href="/signin">
            Sign in
          </Link>
        </div>
      </nav>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="cols">
          <Link className="logo" href="/">
            <i aria-hidden />
            Vault
          </Link>
          <nav aria-label="Footer">
            <Link href="/deals">All deals</Link>
            <Link href="/assistant">Deal assistant</Link>
            <Link href="/gold">Gold</Link>
            <Link href="/saved">Saved</Link>
            <Link href="/signin">Sign in</Link>
          </nav>
        </div>
        <p className="fine">
          Vault collects publicly advertised deals from stores we&apos;ve checked. We may earn a commission when you buy through our links, at no extra
          cost to you. Prices can change at the store.
        </p>
      </div>
    </footer>
  );
}
