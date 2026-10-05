import LegalPage, { L, co, legalMetadata } from "@/components/LegalPage";
import { VipLevelsTable } from "@/components/LegalLive";
import { RULES } from "@/lib/company";

export const metadata = legalMetadata("vip");

export default function VipTerms() {
  return (
    <LegalPage
      slug="vip"
      intro={
        <p>
          The A2 VIP Club rewards real-money play with levels, cashback and rakeback. These terms apply in addition to the{" "}
          <L to="terms" />.
        </p>
      }
      sections={[
        {
          title: "Membership",
          items: [
            <p>Every player with an account is a member of the VIP Club from registration and starts at level 1. Membership is free.</p>,
          ],
        },
        {
          title: "VIP points",
          items: [
            <p>You earn <b>1 VIP point for every $1 bet with real money</b>, on any game. Points are counted in whole dollars from your lifetime real-money bets.</p>,
            <p>Bets paid with bonus money, free spins, and cashback or rakeback claims do not earn points.</p>,
            <p>Points have no cash value and cannot be exchanged or transferred.</p>,
          ],
        },
        {
          title: "Levels",
          lead: <p>Your level rises automatically as soon as your points reach the threshold of the next level. The current levels and their rates are loaded live below:</p>,
          after: (
            <>
              <VipLevelsTable />
              <p>Levels are based on lifetime points and do not go down. We may change the thresholds, rates or levels in the future; changes apply from the date they are published and do not reduce rewards you have already earned.</p>
            </>
          ),
        },
        {
          title: "Cashback",
          items: [
            <p>Cashback returns a percentage of your <b>net real-money losses</b>. Net loss is the total of your real-money bets minus your real-money wins on game rounds, from the start of the cashback period. Voided rounds are excluded.</p>,
            <p>The cashback period starts when you open your account and starts again every time you claim cashback. You can see your current net loss, the period start date and the amount available on the VIP page.</p>,
            <p>The amount is calculated at the cashback rate of your level at the moment you claim. If you are in profit for the period, no cashback is available.</p>,
          ],
        },
        {
          title: "Rakeback",
          items: [
            <p>Rakeback returns a percentage of <b>every real-money bet</b>, win or lose, at the rakeback rate of your level when the bet is placed. It builds up with each bet and is shown on the VIP page.</p>,
          ],
        },
        {
          title: "Claiming rewards",
          items: [
            <p>Cashback and rakeback are not paid automatically: you claim them on the VIP page. The minimum claim is <b>{RULES.minRewardClaim}</b>; smaller amounts stay available and keep building up.</p>,
            <p>Claimed cashback and rakeback are credited to your <b>real balance with no wagering requirement</b> and can be played or withdrawn under the normal <L to="payments" />.</p>,
            <p>Unclaimed rewards are forfeited if your account is closed, self-excluded or becomes dormant.</p>,
          ],
        },
        {
          title: "Other benefits",
          items: [
            <p>Higher levels may come with extra benefits, which are described on the VIP page and may include faster withdrawal reviews, a personal account manager and exclusive bonuses. These benefits are discretionary: they are offered when available and may change. Exclusive bonuses are subject to the <L to="bonus-terms" />.</p>,
          ],
        },
        {
          title: "Fair use",
          items: [
            <p>The VIP Club is for genuine play. If we find that points or rewards were obtained through bonus abuse, multiple accounts, collusion, errors or other breaches of the <L to="terms" />, we may remove the points, cancel or recover the rewards and adjust your level.</p>,
            <p>We may change or end the VIP Club with reasonable notice. Rewards you have already claimed are not affected. Questions can be sent to {co.supportEmail}.</p>,
          ],
        },
      ]}
    />
  );
}
