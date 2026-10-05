import LegalPage, { L, co, legalMetadata } from "@/components/LegalPage";
import { BonusOffersTable } from "@/components/LegalLive";

export const metadata = legalMetadata("bonus-terms");

export default function BonusTerms() {
  return (
    <LegalPage
      slug="bonus-terms"
      intro={
        <p>
          These Bonus Terms apply to every bonus, free spins offer and promo code on A2Casino, in addition to the{" "}
          <L to="terms" />. The specific terms of each offer (amount, minimum deposit, wagering and validity) are shown on the
          offer itself on the Promotions page and in &quot;My bonuses&quot;. If the specific terms of an offer differ from these
          general terms, the specific terms apply.
        </p>
      }
      sections={[
        {
          title: "Key terms",
          items: [
            <><b>Real balance</b>: money you deposited and money you won with it. It can be withdrawn.</>,
            <><b>Bonus balance</b>: bonus money credited by an offer. It can be used to play but cannot be withdrawn until the bonus is completed.</>,
            <><b>Wagering requirement</b>: the total amount you must bet before a bonus is completed, shown as a multiplier (for example x35) of the bonus amount.</>,
            <><b>Active bonus</b>: a bonus that has been credited and is being wagered. <b>Pending bonus</b>: a deposit bonus you have claimed that is waiting for a qualifying deposit.</>,
            <><b>Validity</b>: the number of days within which a bonus must be activated (pending) or completed (active).</>,
          ],
        },
        {
          title: "Types of bonus",
          items: [
            <><p><b>Deposit bonus</b> (for example the Welcome Bonus or a Reload Bonus): a percentage of a qualifying deposit, up to a maximum amount, credited to the bonus balance. A deposit qualifies when it is at least the offer&apos;s minimum deposit.</p></>,
            <><p><b>No-deposit bonus</b>: a fixed amount of bonus money credited straight away, usually through a promo code.</p></>,
            <><p><b>Free spins</b>: a number of spins of a set value on a named game. Winnings from free spins are credited to the bonus balance and become subject to wagering (see section 6).</p></>,
            <><p>Cashback and rakeback from the VIP programme are not bonuses: they are paid as real money without wagering, under the <L to="vip" />.</p></>,
          ],
        },
        {
          title: "Current offers",
          lead: <p>The public offers available right now and their terms are listed below. Offers given through promo codes or by our team show their terms when you receive them, in &quot;My bonuses&quot;.</p>,
          after: <BonusOffersTable />,
        },
        {
          title: "Getting a bonus",
          items: [
            <p>The Welcome Bonus is offered automatically when you register and appears in &quot;My bonuses&quot; as pending. Other deposit offers are claimed on the Promotions page and then also wait as pending.</p>,
            <p>A pending deposit bonus is activated by your next deposit that is at least the offer&apos;s minimum deposit, made within its validity period and while you have no other active bonus. The bonus is the offer&apos;s percentage of that deposit, up to its maximum. If you have several pending bonuses, the one you claimed first is activated first.</p>,
            <p><b>If you do not want a pending bonus, cancel it in &quot;My bonuses&quot; before you deposit.</b> Once it is activated, the rules on withdrawals in section 7 apply. Cancelling a pending bonus costs nothing.</p>,
            <p>No-deposit bonuses and free spins start immediately, and only if you have no other active bonus.</p>,
            <p>Each promo code can be used only once per player. Codes may have a limited number of uses or an expiry date and stop working when either is reached. A deposit offer can be claimed again after the previous claim has been activated or has ended.</p>,
            <p>Offers are limited to one per person, household, IP address, device, payment method and crypto wallet unless the offer says otherwise.</p>,
          ],
        },
        {
          title: "One bonus at a time",
          items: [
            <p>You can have only one active bonus at a time. Pending deposit bonuses can wait alongside an active bonus and are activated by a qualifying deposit made after the active bonus has ended.</p>,
          ],
        },
        {
          title: "Wagering",
          items: [
            <p>The wagering requirement of a deposit or no-deposit bonus is the bonus amount multiplied by the offer&apos;s wagering multiplier. Example: a $100 Welcome Bonus with x35 wagering must be wagered $3,500.</p>,
            <p>The wagering requirement of free spins is set after the last spin: total free spins winnings multiplied by the offer&apos;s multiplier. Example: $8 won from free spins with x30 wagering must be wagered $240. If the free spins win nothing, the offer ends with nothing to wager.</p>,
            <p>Every bet you place while the bonus is active counts in full towards wagering, whether it is paid from your real balance or your bonus balance, in every game including Dice.</p>,
            <p>Bets are taken from your real balance first and from your bonus balance only when the real balance is not enough. Wins are credited to the real and bonus balances in the same proportion as the bet was funded.</p>,
            <p>You can follow your progress in &quot;My bonuses&quot;.</p>,
          ],
        },
        {
          title: "Withdrawals while a bonus is active",
          items: [
            <p>You cannot withdraw while you have an active bonus, including your real balance. To withdraw, either complete the wagering or cancel the bonus. A pending bonus does not block withdrawals.</p>,
          ],
        },
        {
          title: "Completion",
          items: [
            <p>When the wagering requirement is met (and, for free spins, all spins have been played), the bonus is completed and your <b>whole bonus balance is converted into real money</b>. It can then be withdrawn under the normal <L to="payments" />.</p>,
          ],
        },
        {
          title: "Cancellation and expiry",
          items: [
            <p>You can cancel a pending or active bonus at any time in &quot;My bonuses&quot;.</p>,
            <p>If you cancel an active bonus, or it reaches the end of its validity before the wagering is complete, the bonus ends and <b>the remaining bonus balance is forfeited</b>. Your real balance is not affected.</p>,
            <p>A pending bonus that is not activated within its validity expires. The validity of an activated bonus starts again from the moment it is activated.</p>,
          ],
        },
        {
          title: "Free spins",
          items: [
            <p>Free spins are played from &quot;My bonuses&quot; on the Promotions page and are recorded in your bet history under the game named in the offer. Each spin has the value stated in the offer.</p>,
            <p>Free spins must be used within the offer&apos;s validity. Unused spins and any free spins winnings expire with the offer.</p>,
          ],
        },
        {
          title: "Bonus abuse",
          items: [
            <p>Bonuses are for genuine play. Abuse, as defined in section 8 of the <L to="terms" />, includes using several accounts, acting together with other players, using someone else&apos;s payment method or wallet, and using automated tools.</p>,
            <p>If we reasonably believe that a bonus has been abused, we may cancel it, remove the bonus money and the winnings obtained with it, and take the other measures described in the Terms. We will explain our decision on request; you can challenge it through the <L to="complaints" />.</p>,
          ],
        },
        {
          title: "Changes to offers",
          items: [
            <p>We may change, suspend or end any offer, or these Bonus Terms, at any time. A bonus you already have keeps the terms that applied when it was given to you, unless we need to change them because of an error, suspected abuse or a legal requirement.</p>,
            <p>Questions about a bonus can be sent to {co.supportEmail}.</p>,
          ],
        },
      ]}
    />
  );
}
