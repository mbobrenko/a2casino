import LegalPage, { L, co, legalMetadata } from "@/components/LegalPage";
import { RULES } from "@/lib/company";

export const metadata = legalMetadata("cookies");

export default function Cookies() {
  return (
    <LegalPage
      slug="cookies"
      intro={
        <p>
          This policy explains the cookies and similar technologies (such as your browser&apos;s local storage) used when you
          visit A2Casino. It complements our <L to="privacy" />.
        </p>
      }
      sections={[
        {
          title: "What cookies and local storage are",
          items: [
            <p>Cookies are small text files a website stores in your browser. Local storage is a similar browser feature that lets a website keep information on your device. Both can be &quot;strictly necessary&quot; (needed for the site to work) or optional (for example analytics or advertising).</p>,
          ],
        },
        {
          title: "What we use",
          lead: <p>Our website does not set its own cookies, and we do not use analytics or advertising cookies. We use one item of local storage:</p>,
          after: (
            <div className="table-wrap">
              <table className="legal-table">
                <thead><tr><th>Name</th><th>Type</th><th>Purpose</th><th>Duration</th></tr></thead>
                <tbody>
                  <tr>
                    <td><code>a2c_token</code></td>
                    <td>Local storage, strictly necessary</td>
                    <td>Keeps you logged in: it holds a signed login token sent with your requests to our servers.</td>
                    <td>Deleted when you log out; the token stops working after {RULES.sessionHours} hours.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ),
        },
        {
          title: "Third parties",
          items: [
            <p><b>Games.</b> Third-party games open in a frame served by the game provider, which may use its own cookies or storage to run the game.</p>,
            <p><b>Payments.</b> When you pay on a payment provider&apos;s page (for example the NOWPayments invoice page or a card checkout), that provider may set its own cookies, for security and fraud prevention. Their use is governed by the provider&apos;s own policy.</p>,
            <p><b>Security and delivery.</b> Our content delivery and security provider may set strictly necessary cookies to protect the website against attacks and bots.</p>,
          ],
        },
        {
          title: "Your choices",
          items: [
            <p>Because we only use strictly necessary storage, we do not ask for consent. You can delete cookies and local storage in your browser settings at any time; if you delete <code>a2c_token</code>, you will be logged out.</p>,
            <p>If we add optional cookies in the future (for example analytics), we will update this policy and ask for your consent before setting them.</p>,
          ],
        },
        {
          title: "Contact",
          items: [<p>Questions about this policy can be sent to {co.privacyEmail}.</p>],
        },
      ]}
    />
  );
}
