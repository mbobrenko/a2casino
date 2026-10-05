import Link from "next/link";
import type { Metadata } from "next";
import { COMPANY, PENDING, RESTRICTED, LEGAL_NOTICE, LEGAL_PAGES, LEGAL_UPDATED, LEGAL_UPDATED_TEXT, legalPage } from "@/lib/company";

/** One numbered section. `items` become numbered clauses (2.1, 2.2, …); `lead` and `after` are free content. */
export type LegalSection = {
  title: string;
  lead?: React.ReactNode;
  items?: React.ReactNode[];
  after?: React.ReactNode;
};

export function legalMetadata(slug: string): Metadata {
  const p = legalPage(slug);
  return { title: `${p.title} · A2Casino`, description: p.summary };
}

export default function LegalPage({ slug, intro, sections }: { slug: string; intro?: React.ReactNode; sections: LegalSection[] }) {
  const page = legalPage(slug);
  return (
    <article className="legal">
      <nav className="legal-crumbs muted" aria-label="Breadcrumb">
        <Link href="/legal">Legal</Link> <span aria-hidden>/</span> {page.title}
      </nav>
      <h1>{page.title}</h1>
      <p className="legal-notice" role="note">{LEGAL_NOTICE}</p>
      <p className="legal-updated muted">Last updated: <time dateTime={LEGAL_UPDATED}>{LEGAL_UPDATED_TEXT}</time></p>
      {intro && <div className="legal-intro">{intro}</div>}

      <nav className="panel legal-toc" aria-label="Contents">
        <h2>Contents</h2>
        <ol>
          {sections.map((s, i) => (
            <li key={i}><a href={`#section-${i + 1}`}>{i + 1}. {s.title}</a></li>
          ))}
        </ol>
      </nav>

      {sections.map((s, i) => (
        <section key={i} id={`section-${i + 1}`} className="legal-section">
          <h2>{i + 1}. {s.title}</h2>
          {s.lead}
          {s.items && (
            <ol className="clauses">
              {s.items.map((item, j) => (
                <li key={j}><span className="clause-n">{i + 1}.{j + 1}</span><div>{item}</div></li>
              ))}
            </ol>
          )}
          {s.after}
        </section>
      ))}

      <nav className="panel legal-more" aria-label="Other policies">
        <h2>Other policies</h2>
        <ul>
          {LEGAL_PAGES.filter((p) => p.slug !== slug).map((p) => (
            <li key={p.slug}><Link href={`/legal/${p.slug}`}>{p.title}</Link></li>
          ))}
        </ul>
      </nav>
    </article>
  );
}

/** Link to another legal page. */
export function L({ to, children, hash }: { to: string; children?: React.ReactNode; hash?: string }) {
  return <Link href={`/legal/${to}${hash ? "#" + hash : ""}`}>{children ?? legalPage(to).title}</Link>;
}

/** A value from lib/company.ts; still-undecided "[Placeholder]" values are highlighted so they are easy to spot. */
export function Ph({ children }: { children: string }) {
  return /^\[.*\]$/.test(children) ? <span className="ph">{children}</span> : <>{children}</>;
}

function rendered<T extends Record<string, string | number>>(o: T): Record<keyof T, React.ReactNode> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, <Ph key={k}>{String(v)}</Ph>])) as Record<keyof T, React.ReactNode>;
}

/** Company details and pending decisions, ready to drop into JSX. */
export const co = rendered(COMPANY);
export const pending = rendered(PENDING);
export const restricted = rendered({ list: RESTRICTED.list });
