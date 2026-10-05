import LegalPage, { L, co, legalMetadata, pending } from "@/components/LegalPage";
import { PaymentMethodsTable } from "@/components/LegalLive";
import { RULES } from "@/lib/company";

export const metadata = legalMetadata("payments");

export default function Payments() {
  return (
    <LegalPage
      slug="payments"
      intro={
        <p>
          This page explains how deposits and withdrawals work on A2Casino. It forms part of the <L to="terms" />. Payment
          methods are provided by third-party payment providers on our behalf.
        </p>
      }
      sections={[
        {
          title: "Currency",
          items: [
            <p>Accounts are held in US dollars ({RULES.currency}). Cryptocurrency deposits are converted to {RULES.currency} at the rate applied when the payment arrives. Card or bank payments in another currency are converted by your card issuer or bank, which may charge for it.</p>,
          ],
        },
        {
          title: "Payment methods and minimums",
          lead: <p>The methods available to you and their minimum deposits are shown in your wallet and loaded live in the table below.</p>,
          after: <PaymentMethodsTable />,
        },
        {
          title: "Deposits",
          items: [
            <p>Deposits are made from the wallet. Each method has a minimum deposit; smaller amounts are not accepted.</p>,
            <p><b>Crypto via NOWPayments:</b> you are sent to a payment page where you choose a coin and pay the amount shown. Your balance is credited once the payment is reported as finished. If you send less than the amount requested (a partial payment), the deposit is not credited automatically; our team reviews it and contacts you. This method is for deposits only.</p>,
            <p><b>Crypto to your deposit address:</b> some networks give you a personal deposit address. Send only the coin and network shown for that address; coins sent on the wrong network or to the wrong address may be lost. The deposit is credited after {RULES.cryptoConfirmations} network confirmations.</p>,
            <p><b>Card:</b> you pay on the card processor&apos;s secure page; your balance is credited when the processor confirms the payment.</p>,
            <p>A deposit that activates a pending bonus is subject to the <L to="bonus-terms" />. If you do not want the bonus, cancel it before depositing.</p>,
            <p>You may only deposit with payment methods and wallets that belong to you. Deposits from third parties are not accepted and may be returned or frozen.</p>,
            <p>A crypto deposit from a high-risk source is frozen rather than credited and reviewed under our <L to="kyc-aml" />.</p>,
          ],
        },
        {
          title: "Withdrawal conditions",
          lead: <p>You can request a withdrawal when all of the following apply:</p>,
          items: [
            <p>Your account is <b>verified</b> (see the <L to="kyc-aml" />).</p>,
            <p>You have <b>no active bonus</b>. Finish the wagering or cancel the bonus first; cancelling forfeits the bonus balance.</p>,
            <p>The amount is at least <b>{RULES.minWithdrawal}</b> and not more than your real balance. Bonus money cannot be withdrawn until it has been converted into real money.</p>,
            <p>Your account is active and withdrawals have not been blocked (for example during an AML review).</p>,
            <p>For crypto, you give a valid wallet address for the selected network that belongs to you. Withdrawals to sanctioned or blacklisted addresses are refused.</p>,
            <p>Withdrawal limits: {pending.maxWithdrawal}.</p>,
          ],
        },
        {
          title: "Processing withdrawals",
          items: [
            <p>When you request a withdrawal, the amount is moved from your real balance to &quot;Pending withdrawal&quot; and can no longer be played.</p>,
            <p>Every withdrawal is <b>reviewed and approved manually</b> by our finance team. We aim to complete the review within {pending.withdrawalReviewTime}. We may ask for more documents before approving.</p>,
            <p>Crypto payout addresses are screened when you request the withdrawal and again before payment. If the address is sanctioned or blacklisted at either point, the withdrawal is not paid.</p>,
            <p>If a withdrawal is approved, it is sent to your chosen method. If it is rejected, the amount is returned to your real balance and we tell you why where the law allows.</p>,
            <p>Once a crypto withdrawal has been sent to the blockchain it cannot be reversed. Check the address carefully.</p>,
            <p>Where possible, withdrawals are paid to the same method and wallet you deposited from.</p>,
          ],
        },
        {
          title: "Fees",
          items: [
            <p>We do not charge fees for deposits or withdrawals. Your bank, card issuer, crypto wallet or exchange, or the blockchain network may charge their own fees.</p>,
          ],
        },
        {
          title: "Chargebacks and errors",
          items: [
            <p>If you charge back or reverse a deposit, we may suspend the account and recover the amount from your balance, as set out in the <L to="terms" />.</p>,
            <p>If an amount is credited or paid to you by mistake, it must be returned (see section 10 of the <L to="terms" />).</p>,
          ],
        },
        {
          title: "Your payment history",
          items: [
            <p>Your wallet shows all deposits and withdrawals with their status (processing, confirming, credited, under review, rejected) and a full transaction history. If you have a question about a payment, contact {co.supportEmail} with the date, amount and, for crypto, the transaction hash.</p>,
          ],
        },
      ]}
    />
  );
}
