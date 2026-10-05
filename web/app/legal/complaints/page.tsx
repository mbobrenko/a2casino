import LegalPage, { L, co, legalMetadata, pending } from "@/components/LegalPage";

export const metadata = legalMetadata("complaints");

export default function Complaints() {
  return (
    <LegalPage
      slug="complaints"
      intro={
        <p>
          We want to resolve any problem quickly and fairly. This procedure explains how to raise a complaint, how we handle
          it and what you can do if you are not satisfied with our answer.
        </p>
      }
      sections={[
        {
          title: "What a complaint is",
          items: [
            <p>A complaint is any expression of dissatisfaction with our services, for example about a game result, a bet, a deposit or withdrawal, a bonus, the verification process or the closure of your account. Many issues can be solved straight away by our support team, so please contact them first.</p>,
          ],
        },
        {
          title: "How to complain",
          items: [
            <p>Send your complaint to {co.complaintsEmail} (or {co.supportEmail}) from the email address registered on your account.</p>,
            <>
              <p>Please include:</p>
              <ul className="list">
                <li>your account email address;</li>
                <li>a clear description of the problem and what you would like us to do;</li>
                <li>the date and time, and the game, bet, payment or bonus concerned (for crypto, the transaction hash);</li>
                <li>screenshots or other evidence you have; for Dice, the seeds and nonce of the bets concerned.</li>
              </ul>
            </>,
            <p>Complaints must be made within 6 months of the event they relate to. Please keep your language respectful; we may stop corresponding with anyone who is abusive towards our staff.</p>,
          ],
        },
        {
          title: "How we handle it",
          items: [
            <p><b>Acknowledgement:</b> we confirm receipt within {pending.complaintAck} and give you a reference number.</p>,
            <p><b>Investigation:</b> a member of staff who was not involved in the original decision reviews the complaint, using our server records of bets, transactions, payments and staff actions, and the game provider&apos;s records where relevant. We may ask you for more information.</p>,
            <p><b>Final response:</b> we send you a written decision with our reasons within {pending.complaintAnswer} of receiving the complaint. If the case is complex or depends on a game or payment provider, we will tell you before that date, explain why, and answer within {pending.complaintExtended} at the latest.</p>,
            <p>If we find that we made a mistake, we will put it right, for example by correcting your balance or reprocessing a payment.</p>,
            <p>While a complaint about a withdrawal or an account restriction is being investigated, the funds concerned may remain on hold.</p>,
          ],
        },
        {
          title: "If you are not satisfied: internal escalation",
          items: [
            <p>If you disagree with the response, reply within 14 days asking for the complaint to be escalated. It will be reviewed by a manager (or by our {co.complianceOfficer} for verification and AML matters), who will send a final decision within {pending.complaintAnswer}.</p>,
          ],
        },
        {
          title: "External escalation",
          items: [
            <p>If our final decision does not resolve your complaint, or we have not answered within the times above, you may refer it to our licensing authority, the {co.regulator} of {co.jurisdiction} (licence number {co.licenceNumber}), following the procedure published by the authority.</p>,
            <p>You may also refer the dispute to an independent alternative dispute resolution (ADR) service: {co.adrBody}. ADR is free of charge for players. We will cooperate with the ADR service and comply with its decision where our licence requires it.</p>,
            <p>These options do not affect your right to go to court as set out in section 17 of the <L to="terms" />.</p>,
          ],
        },
        {
          title: "Records",
          items: [
            <p>We keep a record of every complaint, our investigation and our response, and report complaints to our licensing authority where required. Personal data in complaints is handled under our <L to="privacy" />.</p>,
          ],
        },
      ]}
    />
  );
}
