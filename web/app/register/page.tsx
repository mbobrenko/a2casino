"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";

// Phase-1 markets from the architecture doc, plus Brazil to show the geo block.
const countries = [
  ["CL", "Chile"], ["MX", "Mexico"], ["GT", "Guatemala"], ["HN", "Honduras"], ["SV", "El Salvador"],
  ["NI", "Nicaragua"], ["BO", "Bolivia"], ["CR", "Costa Rica"], ["PA", "Panama"], ["BR", "Brazil (blocked)"],
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
    if (!agree) {
      setError("Please confirm that you are 18 or older and accept the Terms & Conditions and Privacy Policy");
      return;
    }
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
      <h1>Sign up</h1>
      <form className="form" onSubmit={submit}>
        <label>Email<input type="email" value={form.email} onChange={set("email")} required /></label>
        <label>Password<input type="password" minLength={8} value={form.password} onChange={set("password")} required /></label>
        <label>Country<select value={form.country} onChange={set("country")}>
          {countries.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select></label>
        <label>Date of birth<input type="date" value={form.birth_date} onChange={set("birth_date")} required /></label>
        <label>Promo code or referral (optional)<input value={form.ref} onChange={set("ref")} /></label>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>
            I am 18 or older and accept the <Link href="/legal/terms" target="_blank">Terms &amp; Conditions</Link> and{" "}
            <Link href="/legal/privacy" target="_blank">Privacy Policy</Link>
          </span>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy || !agree}>Create account</button>
      </form>
    </div>
  );
}
