import LegalPage, { L, co, legalMetadata, pending } from "@/components/LegalPage";
import { RULES } from "@/lib/company";

export const metadata = legalMetadata("kyc-aml");

export default function KycAml() {
  return (
    <LegalPage
      slug="kyc-aml"
      intro={
        <p>
          {co.name} is committed to preventing money laundering, terrorist financing, fraud and sanctions evasion. This
          policy explains the checks we carry out under the anti-money laundering (AML) rules of {co.jurisdiction} and the
          conditions of our licence, and what we may ask of you. It forms part of the <L to="terms" />.
        </p>
      }
      sections={[
        {
          title: "Our approach",
          items: [
            <p>We follow a risk-based approach: the checks we carry out depend on the risk an account presents, taking into account the customer&apos;s country, the amounts deposited and withdrawn, the payment methods and crypto wallets used, the pattern of play and the results of screening.</p>,
            <p>Our AML programme is overseen by our {co.complianceOfficer}. Staff who deal with customers and payments are trained to recognise and escalate suspicious activity.</p>,
            <p>We do not accept customers from restricted countries (see section 4 of the <L to="terms" />), including countries identified by the Financial Action Task Force (FATF) as high-risk jurisdictions subject to a call for action.</p>,
          ],
        },
        {
          title: "When we verify you",
          items: [
            <p><b>At registration</b> we check your age from your date of birth and check that neither your declared country nor your network country is restricted. Accounts registered from an IP address already used by another account are flagged for review.</p>,
            <p><b>Before your first withdrawal</b> your account must be verified. Withdrawals are refused until verification is complete.</p>,
            <p><b>At any other time</b> when our risk assessment, a payment provider, the screening described in section 6 or a regulator requires it — for example if the details you gave do not match, if several accounts appear to be linked, or if activity is unusual for your profile.</p>,
            <p>While verification is pending we may restrict deposits, play or withdrawals. Accounts can have one of these statuses: new, not verified, documents under review, under manual review, duplicate, or verified.</p>,
          ],
        },
        {
          title: "Documents we ask for",
          items: [
            <p><b>Personal details:</b> your full name as shown on your identity document, date of birth (you must be {RULES.minAge} or older), country and residential address, entered in the Verification section of your profile.</p>,
            <p><b>Identity:</b> a clear colour copy of a valid passport, national identity card or driving licence showing your full name, date of birth, photo and expiry date — the front, and the back for an identity card or driving licence.</p>,
            <p><b>Proof of address:</b> a utility bill, bank statement or official letter issued in the last 3 months showing your name and address.</p>,
            <p><b>Selfie</b> holding your identity document next to your face, to confirm that it belongs to you.</p>,
            <p><b>Payment method</b>, when needed: a photo of your card (with the middle digits covered and the CVV hidden), a bank statement, or proof that you control the crypto wallet you use (for example, a screenshot of the wallet or a small test transaction). Our support team at {co.supportEmail} will tell you how to send these.</p>,
            <p>We may ask for documents again when they expire or if we have doubts about them. Altered or false documents lead to closure of the account and may be reported.</p>,
          ],
        },
        {
          title: "How to upload documents and how we review them",
          items: [
            <p>Upload your documents in <b>Profile → Verification</b>. Each file must be a {RULES.kycFormats} of up to {RULES.kycMaxFile}. We check the file contents, not just the file name, and refuse other formats. Make sure the whole document is visible, in focus and not cut off, and that all four corners are shown.</p>,
            <p>Uploaded files are sent over an encrypted connection and stored on our own systems with access restricted. They are visible only to you and to our verification and compliance staff, are never cached by your browser, and are kept as described in section 9 and the <L to="privacy" />.</p>,
            <p>Each document is reviewed by a member of our verification team and shown as <b>under review</b>, <b>approved</b> or <b>rejected</b>. If a document is rejected you will see the reason on the Verification page and can upload a new one; a document that has been approved cannot be replaced.</p>,
            <p>Once your details are complete and all required documents are uploaded, your account status changes to <b>documents under review</b>. Your identity is confirmed — and your account becomes <b>verified</b> — only after every required document has been approved. Withdrawals are available once the account is verified. After verification, contact {co.supportEmail} to change your personal details.</p>,
            <p>Every review decision is recorded with the name of the staff member who made it.</p>,
          ],
        },
        {
          title: "Source of funds and source of wealth",
          items: [
            <p>When your total deposits or withdrawals reach {pending.sofThreshold}, or earlier if our risk assessment requires it, we will ask you to explain and document where the money you gamble with comes from (source of funds) and, for higher amounts, how you built up your wealth (source of wealth).</p>,
            <p>Acceptable evidence includes payslips, tax returns, bank statements, company accounts, documents of a property or investment sale, or an inheritance. For crypto, we may ask for the history of the funds, such as exchange statements.</p>,
            <p>Until the checks are completed we may suspend deposits, play or withdrawals.</p>,
          ],
        },
        {
          title: "Sanctions and wallet-address screening",
          items: [
            <>
              <p>Every crypto withdrawal address is screened automatically <b>when you request the withdrawal and again before it is paid</b>, because lists change. The address is checked against:</p>
              <ul className="list">
                <li>the digital currency addresses on the sanctions list of the U.S. Treasury&apos;s Office of Foreign Assets Control (OFAC), which we update daily;</li>
                <li>other sanctions data from our blockchain analytics provider, where available;</li>
                <li>our internal blacklist of addresses linked to fraud or other abuse;</li>
                <li>internal signals, such as an address already used by another customer or flagged before.</li>
              </ul>
            </>,
            <p>If an address is sanctioned or blacklisted, the withdrawal is refused, the account is flagged for AML review and withdrawals from the account are blocked until the review is completed. Other risk signals mean the withdrawal is reviewed in more detail before a decision. If a screening service is unavailable, the withdrawal waits for a manual check.</p>,
            <p>Incoming crypto deposits may also be screened by our payment processor. A deposit from a high-risk source is frozen rather than credited, the account is flagged for review and withdrawals are blocked while we investigate.</p>,
            <p>We screen customers against sanctions lists. We do not do business with sanctioned persons or entities, and funds linked to sanctions are not paid out and may be blocked and reported as the law requires.</p>,
          ],
        },
        {
          title: "Politically exposed persons (PEPs)",
          items: [
            <p>A politically exposed person is someone who holds or has held a prominent public function, or a family member or close associate of such a person. We screen customers against PEP lists.</p>,
            <p>A PEP may hold an account only with the approval of senior management and after enhanced due diligence, including source of funds and source of wealth checks, followed by ongoing enhanced monitoring. Please tell us if you are a PEP.</p>,
          ],
        },
        {
          title: "Monitoring",
          items: [
            <p>We monitor accounts on an ongoing basis. Every withdrawal is reviewed manually by our finance team, who look at the account&apos;s history, including the first and total deposits, previous withdrawals, wagering compared with deposits, how quickly money is withdrawn after being deposited, and the screening results.</p>,
            <p>Examples of activity we look into: depositing and withdrawing with little or no play; using several payment methods, wallets or accounts; payments from third parties; amounts inconsistent with the customer&apos;s profile; and attempts to avoid checks by splitting payments.</p>,
            <p>We may block withdrawals, suspend an account or reject a payment while we investigate, and we are not always allowed to tell you why.</p>,
          ],
        },
        {
          title: "Record keeping",
          items: [
            <p>We keep a complete record of every transaction on an account (deposits, withdrawals, bets, wins, bonuses and adjustments), the results of every screening, the documents used to verify you, and a log of every action our staff take on an account. Records are kept for {pending.retentionPeriod} after the end of the business relationship, as required by law.</p>,
          ],
        },
        {
          title: "Reporting",
          items: [
            <p>We report suspicious activity to {co.fiu} and cooperate with our licensing authority and law enforcement. By law, we may be prohibited from telling you that a report has been made.</p>,
            <p>We may freeze funds and close accounts where required, and may refuse to pay out funds we have reason to believe are linked to crime or sanctions.</p>,
          ],
        },
        {
          title: "Your obligations",
          items: [
            <p>You must give true information, keep it up to date, use only payment methods and wallets in your own name or under your own control, and provide requested documents promptly. Information we hold is processed in line with our <L to="privacy" />.</p>,
          ],
        },
      ]}
    />
  );
}
