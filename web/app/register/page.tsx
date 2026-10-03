"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";

// Phase-1 markets from the architecture doc, plus Brazil to show the geo block.
const countries = [
  ["CL", "Чили"], ["MX", "Мексика"], ["GT", "Гватемала"], ["HN", "Гондурас"], ["SV", "Сальвадор"],
  ["NI", "Никарагуа"], ["BO", "Боливия"], ["CR", "Коста-Рика"], ["PA", "Панама"], ["BR", "Бразилия (заблокирована)"],
];

export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", country: "CL", birth_date: "", ref: "" });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api<{ token: string }>("/api/auth/register", form);
      setToken(d.token);
      router.push("/wallet");
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="panel" style={{ maxWidth: 440, margin: "40px auto" }}>
      <h1>Регистрация</h1>
      <form className="form" onSubmit={submit}>
        <label>Email<input type="email" value={form.email} onChange={set("email")} required /></label>
        <label>Пароль<input type="password" minLength={8} value={form.password} onChange={set("password")} required /></label>
        <label>Страна<select value={form.country} onChange={set("country")}>
          {countries.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select></label>
        <label>Дата рождения<input type="date" value={form.birth_date} onChange={set("birth_date")} required /></label>
        <label>Промокод или ref (необязательно)<input value={form.ref} onChange={set("ref")} /></label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          Мне есть 18 лет, я принимаю правила
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy || !agree}>Создать аккаунт</button>
      </form>
    </div>
  );
}
