import { Heart } from "lucide-react";
import Link from "next/link";

export function Nav() {
  return (
    <header className="topbar">
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
            <Link href="/assistant">Assistant</Link>
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
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <Link className="logo" href="/">
              <i aria-hidden />
              Vault
            </Link>
            <p className="about">Prices from stores we&apos;ve checked, tracked over time, so you buy at the right moment.</p>
          </div>
          <div>
            <h3>Shop</h3>
            <ul>
              <li><Link href="/deals">All deals</Link></li>
              <li><Link href="/category/electronics">Electronics</Link></li>
              <li><Link href="/category/beauty">Beauty</Link></li>
              <li><Link href="/category/hotels">Travel</Link></li>
            </ul>
          </div>
          <div>
            <h3>Vault</h3>
            <ul>
              <li><Link href="/assistant">Deal assistant</Link></li>
              <li><Link href="/plan">Shopping plan</Link></li>
              <li><Link href="/gold">Gold</Link></li>
              <li><Link href="/saved">Saved deals</Link></li>
            </ul>
          </div>
          <div>
            <h3>Company</h3>
            <ul>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/affiliate-disclosure">Affiliate disclosure</Link></li>
              <li><Link href="/privacy">Privacy policy</Link></li>
            </ul>
          </div>
          <div>
            <h3>Account</h3>
            <ul>
              <li><Link href="/signin">Sign in</Link></li>
              <li><Link href="/signin">Create account</Link></li>
            </ul>
          </div>
        </div>
        <p className="fine">
          We may earn a commission when you buy through our links, at no extra cost to you. Prices can change at the store.
        </p>
      </div>
    </footer>
  );
}
