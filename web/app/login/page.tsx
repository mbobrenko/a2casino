"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api<{ token: string }>("/api/auth/login", { email, password });
      setToken(d.token);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="panel" style={{ maxWidth: 440, margin: "40px auto" }}>
      <h1>Вход</h1>
      <form className="form" onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy}>Войти</button>
        <div className="muted">Нет аккаунта? <Link href="/register" style={{ color: "var(--accent-2)" }}>Регистрация</Link></div>
      </form>
    </div>
  );
}
