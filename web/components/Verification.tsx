"use client";
// Profile → Verification: personal details and KYC document uploads.
import { useEffect, useState } from "react";
import { api, fileURL, upload } from "@/lib/api";
import { balanceChanged } from "@/lib/useMe";

type Doc = {
  id: number; kind: string; id_type: string; file_name: string; content_type: string; size: number;
  status: "pending" | "approved" | "rejected"; reject_reason: string; reviewed_at: string | null; created_at: string;
};
type KYC = {
  verification: string;
  profile: { full_name: string; birth_date: string; country: string; address: string; city: string; postal_code: string };
  required: string[]; missing: string[]; documents: Doc[];
};

const MAX = 5 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";
const idTypes: [string, string][] = [["passport", "Passport"], ["id_card", "National ID card"], ["driving_licence", "Driving licence"]];
const slots: { kind: string; title: string; hint: string }[] = [
  { kind: "id_front", title: "Identity document — front", hint: "The page or side with your photo, name, date of birth and expiry date." },
  { kind: "id_back", title: "Identity document — back", hint: "The reverse side of your ID card or driving licence." },
  { kind: "address", title: "Proof of address", hint: "A utility bill, bank statement or official letter from the last 3 months showing your name and address." },
  { kind: "selfie", title: "Selfie with your ID", hint: "A clear photo of your face holding the same identity document next to it." },
];
const docStatus: Record<string, string> = { pending: "Under review", approved: "Approved", rejected: "Rejected" };
const statusClass: Record<string, string> = { pending: "pending", approved: "completed", rejected: "rejected" };

export const verificationText: Record<string, string> = {
  new: "Not verified", not_verified: "Not verified", pending: "Documents under review", manual_review: "Under review",
  duplicate: "Duplicate account", verified: "Verified",
};

export default function Verification() {
  const [k, setK] = useState<KYC | null>(null);
  const [form, setForm] = useState({ full_name: "", birth_date: "", address: "", city: "", postal_code: "" });
  const [idType, setIdType] = useState("passport");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const apply = (x: KYC) => {
    setK(x);
    setForm({
      full_name: x.profile.full_name, birth_date: x.profile.birth_date.slice(0, 10), address: x.profile.address,
      city: x.profile.city, postal_code: x.profile.postal_code,
    });
    const front = x.documents.find((d) => d.kind === "id_front");
    if (front?.id_type) setIdType(front.id_type);
  };
  useEffect(() => { api<KYC>("/api/kyc").then(apply).catch((e) => setError(e.message)); }, []);
  if (!k) return error ? <p className="error">{error}</p> : null;

  const locked = k.verification === "verified";
  const doc = (kind: string) => k.documents.find((d) => d.kind === kind);
  const needBack = idType !== "passport";

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setError("");
    try {
      apply(await api<KYC>("/api/kyc/profile", form));
      setMsg("Details saved");
      balanceChanged();
    } catch (e: any) { setError(e.message); }
  };

  const send = async (kind: string, file: File | undefined) => {
    setMsg(""); setError("");
    if (!file) return;
    if (file.size > MAX) { setError("Files can be up to 5 MB"); return; }
    const fd = new FormData();
    fd.append("kind", kind);
    if (kind.startsWith("id_")) fd.append("id_type", idType);
    fd.append("file", file);
    setBusy(kind);
    try {
      const r = await upload<{ overview: KYC }>("/api/kyc/documents", fd);
      setK(r.overview);
      setMsg("Document uploaded. We will review it shortly.");
      balanceChanged();
    } catch (e: any) { setError(e.message); }
    setBusy("");
  };

  const view = async (d: Doc) => {
    // Open the tab during the click (popup blockers), then point it at the downloaded file.
    const w = window.open("", "_blank");
    try {
      const url = await fileURL(`/api/kyc/documents/${d.id}/file`);
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e: any) { w?.close(); setError(e.message); }
  };

  return (
    <div className="panel kyc" id="verification">
      <div className="kyc-head">
        <h2>Verification</h2>
        <span className={"status " + (locked ? "completed" : k.verification === "pending" ? "pending" : "")}>{verificationText[k.verification] ?? k.verification}</span>
      </div>
      <p className="muted small">
        We need to verify your identity before your first withdrawal. Upload clear colour photos or scans: JPG, PNG or PDF,
        up to 5 MB each. Documents are stored securely and seen only by our verification team.
        {k.verification === "pending" && " All documents are in — we will review them and confirm by email."}
      </p>
      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <form className="kyc-form" onSubmit={saveProfile}>
        <label>Full name (as on your ID)<input value={form.full_name} disabled={locked} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
        <label>Date of birth<input type="date" value={form.birth_date} disabled={locked} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} required /></label>
        <label>Country<input value={k.profile.country} disabled /></label>
        <label className="wide">Street address<input value={form.address} disabled={locked} onChange={(e) => setForm({ ...form, address: e.target.value })} required /></label>
        <label>City<input value={form.city} disabled={locked} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></label>
        <label>Postal code<input value={form.postal_code} disabled={locked} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></label>
        {!locked && <div className="wide"><button className="btn">Save details</button></div>}
      </form>

      <div className="kyc-docs">
        <label className="kyc-idtype">Identity document type
          <select value={idType} disabled={locked || doc("id_front")?.status === "approved"} onChange={(e) => setIdType(e.target.value)}>
            {idTypes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        {slots.filter((s) => s.kind !== "id_back" || needBack).map((s) => {
          const d = doc(s.kind);
          return (
            <div key={s.kind} className={"kyc-slot " + (d?.status ?? "empty")}>
              <div className="kyc-slot-info">
                <b>{s.title}</b>
                <span className="muted small">{s.hint}</span>
                {d && (
                  <span className="small">
                    <span className={"status " + statusClass[d.status]}>{docStatus[d.status]}</span>{" "}
                    <button type="button" className="link-btn inline" onClick={() => view(d)}>{d.file_name}</button>
                  </span>
                )}
                {d?.status === "rejected" && <span className="error small">Reason: {d.reject_reason}. Please upload a new file.</span>}
              </div>
              {!locked && d?.status !== "approved" && (
                <label className={"btn " + (d ? "ghost" : "") + " kyc-upload" + (busy === s.kind ? " busy" : "")}>
                  {busy === s.kind ? "Uploading…" : d ? "Replace" : "Upload"}
                  <input type="file" accept={ACCEPT} disabled={!!busy} onChange={(e) => { send(s.kind, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
