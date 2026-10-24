import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="empty" style={{ marginTop: 40 }}>
        <h3>This deal has moved on</h3>
        <p>The page you&apos;re looking for doesn&apos;t exist or the deal has ended.</p>
        <Link className="btn primary" href="/deals">
          See today&apos;s deals
        </Link>
      </div>
    </div>
  );
}
