import LegalPage, { L, co, legalMetadata } from "@/components/LegalPage";

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
          lead: <p>Self-service tools in your account are being developed. Until they are available, our support team sets them up for you: write to {co.supportEmail} from your registered email address.</p>,
          items: [
            <p><b>Limits.</b> You can ask us to set a limit on your deposits, losses or wagering for a day, week or month. A limit is lowered as soon as we process your request; a request to raise or remove a limit takes effect only after a cooling-off period of at least 24 hours.</p>,
            <p><b>Time-out.</b> You can take a break of 24 hours to 6 weeks. During the time-out your account is blocked: you cannot log in, play or deposit.</p>,
            <p><b>Self-exclusion.</b> You can exclude yourself for a minimum of 6 months, for longer, or permanently. Your account is blocked for the whole period and cannot be reopened before it ends, even at your request. We will pay out your remaining real balance after the usual checks; bonus balances and unclaimed rewards are forfeited. We will close any other account we find that belongs to you, and you must not try to open a new one.</p>,
            <p>At the end of a fixed self-exclusion period your account is not reopened automatically: you must contact us, and we may ask you to wait a further 24 hours.</p>,
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
            <p>Our staff are trained to recognise signs of problem gambling. If we have concerns, for example because of the pattern of your deposits or play, we may contact you, apply limits, or suspend your account.</p>,
            <p>We do not send promotional offers to accounts that are self-excluded or on a time-out.</p>,
          ],
        },
      ]}
    />
  );
}
