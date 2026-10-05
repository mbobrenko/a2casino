import LegalPage, { L, co, legalMetadata, pending } from "@/components/LegalPage";

export const metadata = legalMetadata("privacy");

export default function Privacy() {
  return (
    <LegalPage
      slug="privacy"
      intro={
        <p>
          This Privacy Policy explains how {co.name} (&quot;we&quot;) collects and uses personal data when you use A2Casino, who
          we share it with and what rights you have. We are the controller of your personal data. We handle it in line with the
          data protection laws that apply to us and to you, including the laws of {co.jurisdiction} and, where applicable, of
          your country of residence (for example, Chile&apos;s personal data protection law and Mexico&apos;s federal law on the
          protection of personal data held by private parties).
        </p>
      }
      sections={[
        {
          title: "Who we are and how to contact us",
          items: [
            <p>{co.name}, registration number {co.regNumber}, {co.address}.</p>,
            <p>For any question about your data or to exercise your rights, write to {co.privacyEmail}.</p>,
          ],
        },
        {
          title: "Data we collect",
          items: [
            <p><b>Registration data:</b> email address, password (stored only as a one-way hash, never in readable form), country of residence, date of birth and, if you enter one, a promo or referral code.</p>,
            <p><b>Technical data:</b> the IP address you register from, and the country of your network connection as reported by our content delivery network. We use these to apply country restrictions and to detect duplicate accounts.</p>,
            <p><b>Account and payment data:</b> balances, deposits and withdrawals (method, amount, status, dates), crypto wallet addresses you send from or ask us to pay to, transaction hashes and crypto amounts, and references from payment providers. We do not receive or store full card numbers; card payments are handled on the payment provider&apos;s page.</p>,
            <p><b>Gameplay data:</b> games played, bets, wins, round results and, for Dice, your seeds and nonces; bonuses, free spins, VIP points, cashback and rakeback.</p>,
            <p><b>Verification and compliance data:</b> identity documents, proof of address, selfies, source-of-funds information and the results of sanctions, PEP and wallet-address screening (see the <L to="kyc-aml" />), and notes our staff make when reviewing your account.</p>,
            <p><b>Communications:</b> messages you send to support and our replies, and complaint records.</p>,
            <p>We do not knowingly collect data from anyone under 18.</p>,
          ],
        },
        {
          title: "Why we use your data and on what legal basis",
          after: (
            <div className="table-wrap">
              <table className="legal-table">
                <thead><tr><th>Purpose</th><th>Legal basis</th></tr></thead>
                <tbody>
                  <tr><td>Creating and running your account, processing bets, wins, deposits and withdrawals, bonuses and VIP rewards</td><td>Performance of our contract with you</td></tr>
                  <tr><td>Checking your age and country, verifying your identity, anti-money laundering and sanctions checks, keeping records, reporting to authorities</td><td>Legal obligation (licence and AML law)</td></tr>
                  <tr><td>Preventing fraud, bonus abuse and duplicate accounts; securing our systems</td><td>Legitimate interests and legal obligation</td></tr>
                  <tr><td>Showing you recently played and recommended games</td><td>Legitimate interests (a better lobby); you can object</td></tr>
                  <tr><td>Responsible gaming: spotting signs of harm, applying self-exclusion</td><td>Legal obligation and legitimate interests</td></tr>
                  <tr><td>Handling support requests and complaints</td><td>Contract and legal obligation</td></tr>
                  <tr><td>Marketing emails and messages (if we send them)</td><td>Your consent, which you can withdraw at any time</td></tr>
                </tbody>
              </table>
            </div>
          ),
        },
        {
          title: "Automated checks",
          items: [
            <p>Some decisions are made automatically. Registration is refused if your date of birth shows you are under 18 or if your declared or network country is restricted. A withdrawal to a crypto address that appears on a sanctions list or on our blacklist is refused automatically, and the account is flagged for review with withdrawals blocked.</p>,
            <p>You can ask for any such decision to be reviewed by a member of our team and give your point of view by writing to {co.supportEmail}.</p>,
          ],
        },
        {
          title: "Who we share data with",
          lead: <p>We share only the data each recipient needs, under contracts that require them to protect it:</p>,
          items: [
            <p><b>Payment providers</b>, including our crypto payment gateway NOWPayments and card processors: the payment amount, a payment reference and, for crypto, wallet addresses and transaction data.</p>,
            <p><b>Game providers</b>: a session identifier for your account, your currency, bets and wins, so the game can run and settle rounds.</p>,
            <p><b>Verification and screening providers</b>: {co.kycProvider} for identity verification, and blockchain analytics or sanctions screening services (for example Chainalysis) which receive crypto wallet addresses only.</p>,
            <p><b>Infrastructure providers</b>: hosting ({co.hostingProvider}), content delivery and security services, and email providers.</p>,
            <p><b>Authorities</b>: our licensing authority, financial intelligence units, law enforcement and courts, where the law requires or allows it.</p>,
            <p><b>Professional advisers and auditors</b>, and a buyer or successor of our business if it is sold or restructured.</p>,
            <p>We do not sell your personal data.</p>,
          ],
        },
        {
          title: "International transfers",
          items: [
            <p>Our servers and some of our providers are located outside your country, including in {co.jurisdiction} and in other countries where our providers operate. When data is transferred, we use contracts with appropriate safeguards and choose providers that apply adequate security measures.</p>,
          ],
        },
        {
          title: "How long we keep data",
          items: [
            <p>We keep account, transaction, gameplay and verification records for as long as your account is open and for {pending.retentionPeriod} after it is closed, as required by anti-money laundering and licensing rules, or longer if needed for a dispute, investigation or legal claim.</p>,
            <p>Self-exclusion records are kept for as long as needed to enforce the exclusion. Support messages are kept for {pending.retentionPeriod}. When data is no longer needed, it is deleted or anonymised.</p>,
          ],
        },
        {
          title: "Security",
          items: [
            <p>We protect your data with encryption in transit, hashed passwords, access controls for our staff with an audit trail of their actions, and signed connections with game and payment providers. No system is perfectly secure; if a breach affects your data, we will inform you and the authorities as required by law.</p>,
          ],
        },
        {
          title: "Your rights",
          items: [
            <>
              <p>Depending on the law that applies to you, you have the right to:</p>
              <ul className="list">
                <li>access your data and receive a copy (your bet, transaction and payment history is also visible in your account);</li>
                <li>have inaccurate data corrected;</li>
                <li>have your data deleted, except data we must keep by law (for example AML records);</li>
                <li>object to or restrict certain uses, such as game recommendations or marketing;</li>
                <li>receive your data in a portable format;</li>
                <li>withdraw consent at any time, without affecting earlier processing;</li>
                <li>complain to the data protection authority of your country.</li>
              </ul>
            </>,
            <p>Write to {co.privacyEmail}. We may ask you to confirm your identity and will reply within the period required by law, normally within 30 days.</p>,
          ],
        },
        {
          title: "Cookies and browser storage",
          items: [<p>See our <L to="cookies" />.</p>],
        },
        {
          title: "Changes",
          items: [<p>We may update this policy. The date at the top shows the latest version; we will tell you about important changes by email or on the website.</p>],
        },
      ]}
    />
  );
}
