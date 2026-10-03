"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getStaff, getToken } from "@/lib/api";

const NAV = [
  { href: "/", label: "Дашборд" },
  { href: "/players", label: "Игроки" },
  { href: "/withdrawals", label: "Выводы" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<{ email: string | null; role: string | null }>({ email: null, role: null });
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setStaff(getStaff());
    setReady(true);
  }, [isLogin, router, pathname]);

  if (isLogin) return <>{children}</>;
  if (!ready) return <div className="boot">Загрузка…</div>;

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          A2Casino <span>BO</span>
        </div>
        <nav>
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={active ? "active" : ""}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="staff-email" title={staff.email || ""}>{staff.email}</div>
          {staff.role && <div className="staff-role">{staff.role}</div>}
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
