import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL_NOTICE, LEGAL_PAGES, LEGAL_UPDATED, LEGAL_UPDATED_TEXT } from "@/lib/company";
import { co } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Legal · A2Casino",
  description: "Terms & Conditions, Bonus Terms, Privacy Policy and the other policies that apply to A2Casino.",
};

export default function LegalIndex() {
  return (
    <div className="legal" style={{ maxWidth: 1000 }}>
      <h1>Legal & policies</h1>
      <p className="legal-notice" role="note">{LEGAL_NOTICE}</p>
      <p className="legal-updated muted">Last updated: <time dateTime={LEGAL_UPDATED}>{LEGAL_UPDATED_TEXT}</time></p>
      <p>
        A2Casino is operated by {co.name}, registration number {co.regNumber}, registered address {co.address}, licensed
        by the {co.regulator} of {co.jurisdiction} under licence number {co.licenceNumber}. These documents form the
        agreement between you and us. Please read them before you play; questions are welcome at {co.supportEmail}.
      </p>
      <div className="legal-index">
        {LEGAL_PAGES.map((p) => (
          <Link key={p.slug} href={`/legal/${p.slug}`}>
            <div className="panel">
              <h2>{p.title}</h2>
              <p className="muted">{p.summary}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
