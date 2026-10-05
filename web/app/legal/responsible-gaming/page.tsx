import Link from "next/link";
import LegalPage, { L, co, legalMetadata } from "@/components/LegalPage";
import { RULES } from "@/lib/company";

export const metadata = legalMetadata("responsible-gaming");

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

export default function ResponsibleGaming() {
  return (
    <LegalPage
      slug="responsible-gaming"
      intro={
        <p>
          Gambling should be fun. It is a form of entertainment that costs money, not a way to earn it. Most people gamble
          without problems, but for some it becomes harmful. This page explains how to stay in control, how to recognise the
          warning signs and how we and others can help.
          <span className="callout" style={{ display: "block", marginTop: 12 }}>
            Set deposit, loss, wagering and time limits, turn on reality checks, or take a break on the{" "}
            <Link href="/responsible-gaming">Responsible gaming</Link> page in your account.
          </span>
        </p>
      }
      sections={[
        {
          title: "Staying in control",
          items: [
            <p>Set a budget before you play and only gamble with money you can afford to lose — never with money meant for rent, bills, food or debts.</p>,
            <p>Decide in advance how long you will play and take regular breaks.</p>,
            <p>Do not chase losses. Losing is part of gambling; trying to win money back usually leads to bigger losses.</p>,
            <p>Do not gamble when you are upset, stressed, depressed, or under the influence of alcohol or drugs.</p>,
            <p>Remember that every game has a built-in house edge (see <L to="game-rules" />). Over time, the casino wins.</p>,
            <p>Keep track of what you spend: your wallet shows your deposits, withdrawals and every transaction, and your profile shows your bet history and totals.</p>,
          ],
        },
        {
          title: "Signs of problem gambling",
          lead: <p>Gambling may be becoming a problem if you:</p>,
          after: (
            <ul className="list">
              <li>spend more money or time gambling than you intended, or need to bet more to get the same excitement;</li>
              <li>chase losses, or borrow money, sell things or use money meant for essentials to gamble;</li>
              <li>hide your gambling from family or friends, or lie about it;</li>
              <li>neglect work, study or family because of gambling;</li>
              <li>feel restless, irritable, anxious or guilty about gambling, or when trying to cut down;</li>
              <li>think about gambling most of the time, or gamble to escape problems;</li>
              <li>have tried to stop or cut down and could not.</li>
            </ul>
          ),
        },
        {
          title: "Self-assessment",
          lead: <p>Answer these questions honestly, thinking about the last 12 months:</p>,
          after: (
            <>
              <ol className="list">
                <li>Have you bet more than you could really afford to lose?</li>
                <li>Have you needed to gamble with larger amounts to get the same feeling of excitement?</li>
                <li>Have you gone back on another day to try to win back money you lost?</li>
                <li>Have you borrowed money or sold anything to get money to gamble?</li>
                <li>Have you felt that you might have a problem with gambling?</li>
                <li>Has gambling caused you health problems, including stress or anxiety?</li>
                <li>Have people criticised your betting or told you that you have a gambling problem?</li>
                <li>Has your gambling caused financial problems for you or your household?</li>
                <li>Have you felt guilty about the way you gamble or what happens when you gamble?</li>
              </ol>
              <p className="callout">If you answered &quot;yes&quot; to any of these questions, your gambling may be putting you at risk. If you answered &quot;yes&quot; to several, please consider taking a break or self-excluding, and talk to one of the organisations in section 7.</p>
            </>
          ),
        },
        {
          title: "Limits, time-outs and self-exclusion",
          lead: (
            <p>
              You set all of these tools yourself, at any time, on the <Link href="/responsible-gaming">Responsible gaming</Link> page
              of your account (also linked from your profile and the site header). If you prefer, our support team can set them up
              for you: write to {co.supportEmail} from your registered email address.
            </p>
          ),
          items: [
            <>
              <p><b>Limits.</b> You can limit, separately for a day, a week and a month:</p>
              <ul className="list">
                <li><b>deposits</b> — the total you can deposit;</li>
                <li><b>losses</b> — your net loss, meaning real-money bets minus real-money winnings;</li>
                <li><b>wagering</b> — the total of your bets, with real and bonus money.</li>
              </ul>
              <p>Periods are rolling: a daily limit covers the last 24 hours, a weekly limit the last 7 days and a monthly limit the last 30 days. A deposit or bet that would take you over a limit is refused, with a message showing how much of the limit is left. For a loss limit we count the full real-money stake of a bet as a possible loss.</p>
            </>,
            <p><b>Cooling-off.</b> Setting a new limit or lowering one takes effect immediately. Raising or removing a limit takes effect only after a cooling-off period of {RULES.coolingOffHours} hours; until then the previous limit keeps applying, and the page shows when the change will take effect. You can cancel a pending increase by setting the limit again at its current or a lower level.</p>,
            <p><b>Reality check.</b> You can ask for a reminder every 15 minutes to 2 hours. It shows how long you have been playing in the current session and your net result (winnings minus bets) for the session, and lets you continue, review your limits or log out. A session ends after 30 minutes without activity.</p>,
            <p><b>Daily play-time limit.</b> You can limit the time you spend on the site in any 24 hours, from 30 minutes to 8 hours. When the limit is reached, games and bets are blocked until your time in the last 24 hours drops below it. Raising or removing it follows the same cooling-off rule.</p>,
            <p><b>Time-out.</b> You can take a break of {RULES.timeouts}. It starts immediately, cannot be cancelled, and ends by itself.</p>,
            <p><b>Self-exclusion.</b> You can exclude yourself for {RULES.selfExclusions}. It starts immediately and cannot be cancelled or shortened, by you or by our staff. A time-out or self-exclusion can be replaced only by a longer one. We will close any other account we find that belongs to you, and you must not try to open a new one.</p>,
            <p><b>During a time-out or self-exclusion</b> you can still log in to see your balance and withdraw your real balance (after the usual checks), but you cannot deposit, place bets, launch games, claim bonuses or use promo codes. Bonuses waiting for a deposit are cancelled, and we do not send you promotional offers.</p>,
            <p><b>When a self-exclusion ends</b> your account is not reopened automatically: you must ask for it on the Responsible gaming page, and it reopens {RULES.reopenDelayHours} hours after your request. A permanent self-exclusion never ends.</p>,
            <p>We also recommend that you self-exclude from other gambling websites and use blocking software (see section 6).</p>,
          ],
        },
        {
          title: "Protecting minors",
          items: [
            <p>You must be 18 or older to play. We ask for your date of birth at registration and refuse anyone under 18, and we verify age with identity documents before the first withdrawal or earlier if we have doubts. Accounts of minors are closed and winnings voided.</p>,
            <p>If you share a device with children, keep your login details private, log out after playing, and use parental control software, for example the controls built into your device or browser.</p>,
          ],
        },
        {
          title: "Blocking software",
          items: [
            <p>Blocking software stops access to gambling sites on your devices. Options include <a href="https://www.betblocker.org" {...ext}>BetBlocker</a> (free) and <a href="https://gamban.com" {...ext}>Gamban</a>.</p>,
          ],
        },
        {
          title: "Where to get help",
          lead: <p>Free, confidential help is available from independent organisations:</p>,
          after: (
            <ul className="list">
              <li><a href="https://www.gamblersanonymous.org" {...ext}>Gamblers Anonymous</a> — self-help groups for people who want to stop gambling, with meetings in many countries, including in Spanish.</li>
              <li><a href="https://www.gamblingtherapy.org" {...ext}>Gambling Therapy</a> — free online support for anyone affected by gambling, in several languages including Spanish.</li>
              <li><a href="https://www.gamcare.org.uk" {...ext}>GamCare</a> — information, advice and support for people affected by gambling problems.</li>
              <li>Your doctor or local mental health services can also help or refer you.</li>
            </ul>
          ),
        },
        {
          title: "What we do",
          items: [
            <p>Our staff are trained to recognise signs of problem gambling. If we have concerns, for example because of the pattern of your deposits or play, we may contact you, apply a stricter limit, a time-out or a self-exclusion, or suspend your account. Our staff can make your limits stricter but cannot loosen them, and cannot shorten a time-out or self-exclusion. Every change, by you or by us, is recorded in your account history.</p>,
            <p>We do not send promotional offers to accounts that are self-excluded or on a time-out, and no bonus can be given to them, including by our staff.</p>,
          ],
        },
      ]}
    />
  );
}
