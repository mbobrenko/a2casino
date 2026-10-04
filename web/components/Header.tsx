"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setToken, money } from "@/lib/api";
import { useMe } from "@/lib/useMe";

const links = [
  ["/", "Лобби"], ["/promo", "Промо"], ["/vip", "VIP"], ["/wallet", "Кошелёк"], ["/profile", "Профиль"],
];

export default function Header() {
  const { me, ready } = useMe();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/game") : path.startsWith(href));
  return (
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
            <Link href="/wallet" className="balance-pill" title="Реальный баланс + бонусный">
              {money(me.balance.real)}
              {me.balance.bonus > 0 && <small> + {money(me.balance.bonus)} бонус</small>}
            </Link>
            <button className="btn ghost" onClick={() => setToken(null)}>Выйти</button>
          </>
        )}
        {ready && !me && (
          <>
            <Link href="/login" className="btn ghost">Войти</Link>
            <Link href="/register" className="btn">Регистрация</Link>
          </>
        )}
      </div>
    </header>
  );
}
