"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setToken, money } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { exclusionText } from "@/lib/rg";

const links = [
  ["/", "Lobby"], ["/promo", "Promotions"], ["/vip", "VIP"], ["/wallet", "Wallet"], ["/profile", "Profile"],
];

export default function Header() {
  const { me, ready } = useMe();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/game") : path.startsWith(href));
  return (
    <>
    <header className="header">
      <Link href="/" className="logo">A2<span>Casino</span></Link>
      <nav>
        {links.map(([href, title]) => (
          <Link key={href} href={href} className={active(href) ? "active" : ""}>{title}</Link>
        ))}
      </nav>
      <div className="header-right">
        {ready && me && (
          <>
            <Link href="/wallet" className="balance-pill" title="Real balance + bonus balance">
              {money(me.balance.real)}
              {me.balance.bonus > 0 && <small> + {money(me.balance.bonus)} bonus</small>}
            </Link>
            <Link href="/responsible-gaming" className={"btn ghost rg-link" + (active("/responsible-gaming") ? " active" : "")} title="Responsible gaming: limits, reality check and breaks">
              🛡️<span> Limits</span>
            </Link>
            <button className="btn ghost" onClick={() => setToken(null)}>Log out</button>
          </>
        )}
        {ready && !me && (
          <>
            <Link href="/login" className="btn ghost">Log in</Link>
            <Link href="/register" className="btn">Sign up</Link>
          </>
        )}
      </div>
    </header>
    {ready && me?.exclusion && (
      <div className="rg-strip" role="status">
        {exclusionText(me.exclusion)} You can still see your balance and withdraw. <Link href="/responsible-gaming">Details</Link>
      </div>
    )}
    </>
  );
}
