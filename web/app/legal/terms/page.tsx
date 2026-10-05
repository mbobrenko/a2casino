import LegalPage, { L, co, legalMetadata, pending, restricted } from "@/components/LegalPage";
import { RESTRICTED, RULES } from "@/lib/company";

export const metadata = legalMetadata("terms");

export default function Terms() {
  return (
    <LegalPage
      slug="terms"
      intro={
        <p>
          These Terms &amp; Conditions (the &quot;Terms&quot;) are a binding agreement between you and {co.name} (&quot;we&quot;,
          &quot;us&quot;, &quot;our&quot;) for the use of the A2Casino website and services. By creating an account or using the
          services you confirm that you have read, understood and accepted these Terms together with the documents they
          refer to. If you do not agree, do not register or use the services.
        </p>
      }
      sections={[
        {
          title: "Who we are",
          items: [
            <p key="a">A2Casino is operated by {co.name}, a company registered under number {co.regNumber}, with its registered address at {co.address}.</p>,
            <p key="b">We are licensed and regulated by the {co.regulator} of {co.jurisdiction} under licence number {co.licenceNumber}. Gambling services are offered only under and within the scope of that licence.</p>,
            <p key="c">You can contact us at {co.supportEmail}. Formal complaints follow the <L to="complaints" />.</p>,
          ],
        },
        {
          title: "Documents that form the agreement",
          items: [
            <>
              <p>The agreement between you and us consists of these Terms and the following documents, which are incorporated by reference:</p>
              <ul className="list">
                <li><L to="bonus-terms" /> — when you take part in a bonus or promotion;</li>
                <li><L to="game-rules" /> — when you play any game;</li>
                <li><L to="payments" />, <L to="kyc-aml" />, <L to="vip" />, <L to="responsible-gaming" /> and <L to="complaints" />;</li>
                <li>our <L to="privacy" /> and <L to="cookies" />, which explain how we handle personal data.</li>
              </ul>
            </>,
            <p key="b">If these Terms conflict with a more specific document, the specific document applies to its subject (for example, the Bonus Terms for a bonus). If a translation of any document conflicts with the English version, the English version prevails.</p>,
          ],
        },
        {
          title: "Eligibility",
          items: [
            <p key="a">You must be at least {RULES.minAge} years old, or the legal age for gambling in your country if that is higher, to register and play. We ask for your date of birth at registration and refuse registration if you are under {RULES.minAge}. We may ask for proof of age at any time; any account found to belong to a minor will be closed and any winnings voided, and deposits returned where the law permits.</p>,
            <p key="b">You must have full legal capacity, act on your own behalf and not on behalf of anyone else, and use only funds that belong to you and are not the proceeds of crime.</p>,
            <p key="c">It is your responsibility to make sure online gambling is legal where you live and where you are when you play. Our services must not be used from any restricted country (see section 4).</p>,
            <p key="d">You may not register or play if you are an employee, officer or director of {co.name} or its group companies, a game provider or payment provider involved in the services, or a relative or household member of such a person.</p>,
            <p key="e">You may not register if you are self-excluded from gambling, whether with us, with another operator, or through a national scheme, or if you have been diagnosed as or consider yourself a problem gambler.</p>,
          ],
        },
        {
          title: "Restricted countries",
          items: [
            <>
              <p>The services are not available to residents of, or persons located in, the following countries and territories: {restricted.list}.</p>
              <p className="callout muted small">{RESTRICTED.note} At the time of writing, registration is blocked for: {RESTRICTED.currentlyBlocked}.</p>
            </>,
            <p key="b">At registration we check both the country you declare and the country of your network connection, and refuse registration if either is restricted. Individual games or studios may also be unavailable in some countries because of the provider&apos;s own licensing; such games are hidden for you.</p>,
            <p key="c">Using a VPN, proxy or other means to hide your location, or giving a false country of residence, is a breach of these Terms. If we find that you live in or play from a restricted country, we will close the account. Winnings obtained in breach of this section are void; we will return your remaining verified deposits where the law allows.</p>,
          ],
        },
        {
          title: "Your account",
          items: [
            <p key="a">To play you need an account. You register with your email address, a password of at least 8 characters, your country of residence and your date of birth. The information you give must be true, complete and kept up to date.</p>,
            <p key="b">Only one account is allowed per person, household, IP address and device. Shared environments (for example, a shared computer or public network) need our prior approval. We record the IP address used at registration and review accounts registered from the same address. If we find more than one account, we may close the duplicate accounts, keep one account open and void bonuses, winnings and rewards obtained through the duplicates.</p>,
            <p key="c">Your account balance is held in {RULES.currency}. It is shown as a real balance (withdrawable money), a bonus balance (bonus money subject to the <L to="bonus-terms" />) and a pending withdrawal amount (money set aside for a withdrawal under review).</p>,
            <p key="d">You are responsible for keeping your password secret and for all activity on your account. Login sessions expire after {RULES.sessionHours} hours. Log out after playing on a shared device and tell us at once at {co.supportEmail} if you suspect someone else has access to your account.</p>,
            <p key="e">Accounts are personal and may not be sold, transferred or used by anyone else. You must not transfer money between accounts or allow others to use yours.</p>,
          ],
        },
        {
          title: "Verification (KYC)",
          items: [
            <p key="a">We are required to verify the identity, age and address of our customers and, in some cases, the source of their funds. Verification is explained in the <L to="kyc-aml" />.</p>,
            <p key="b">You must complete verification before your first withdrawal. We may also ask for verification at any other time, for example when a risk check, payment provider or regulator requires it. While we wait for documents we may suspend play, deposits or withdrawals.</p>,
            <p key="c">If you do not provide the requested documents within a reasonable time, provide false or altered documents, or we cannot verify you, we may close the account. Where documents are false or we suspect fraud, winnings may be voided and the matter reported to the authorities.</p>,
          ],
        },
        {
          title: "Deposits and withdrawals",
          lead: <p>The full rules are in <L to="payments" />. In summary:</p>,
          items: [
            <p key="a">Deposits are made in {RULES.currency} or in cryptocurrency converted to {RULES.currency} at the rate on arrival. Each method has a minimum deposit shown in the wallet. You may only use payment methods and wallets that belong to you.</p>,
            <p key="b">The minimum withdrawal is {RULES.minWithdrawal}. Only the real balance can be withdrawn. A withdrawal requires a verified account and is not possible while a bonus is active; you can finish the wagering or cancel the bonus first (cancelling forfeits the bonus balance).</p>,
            <p key="c">Every withdrawal is reviewed and approved manually. The amount is set aside as a pending withdrawal while it is reviewed; if the withdrawal is rejected, it is returned to your real balance. Cryptocurrency payout addresses are screened against sanctions lists and our internal blacklist, both when you request the withdrawal and again before it is paid.</p>,
            <p key="d">The casino is not a bank: balances do not earn interest, and you must not use the account for transfers, savings or any purpose other than playing.</p>,
            <p key="e">If you reverse or charge back a deposit, or a deposit is reversed by the payment provider, we may suspend the account, deduct the amount and any related costs from your balance, and void winnings obtained with those funds.</p>,
          ],
        },
        {
          title: "Bonuses and bonus abuse",
          items: [
            <p key="a">Bonuses, free spins, promo codes, cashback and rakeback are governed by the <L to="bonus-terms" /> and the <L to="vip" />.</p>,
            <>
              <p>Bonus abuse is not allowed. It includes, among other things:</p>
              <ul className="list">
                <li>opening or using more than one account, or acting together with other players, to claim offers more than once;</li>
                <li>using another person&apos;s identity, payment method or crypto wallet;</li>
                <li>using software, bots or any automated method to play or to claim rewards;</li>
                <li>arranging bets in a way that removes or reduces the risk of losing (for example, coordinated opposite bets between accounts);</li>
                <li>depositing and withdrawing without genuine play in order to obtain rewards or to move money.</li>
              </ul>
            </>,
            <p key="c">If we reasonably believe that bonus abuse has taken place, we may cancel the bonuses concerned, void the bonus money and winnings obtained with it, withhold rewards, and suspend or close the accounts involved. Your own deposited money that has not been used in the abuse is returned to you.</p>,
          ],
        },
        {
          title: "Playing the games",
          items: [
            <p key="a">The rules of each game, its return to player (RTP) and our provably fair Dice are described in <L to="game-rules" />. A bet is accepted only when it has been confirmed by our system and the amount has been taken from your balance.</p>,
            <p key="b">Bets are taken from your real balance first and, when that is not enough, from your bonus balance. Wins are credited in the same proportion as the bet was funded.</p>,
            <p key="c">The record of bets, wins and transactions kept on our servers and by the game provider is final. If the record shown in your browser differs from our server record, the server record applies.</p>,
            <p key="d">The maximum amount that can be won is {pending.maxWin}. Individual games may set their own lower limits.</p>,
          ],
        },
        {
          title: "Errors and malfunctions",
          items: [
            <p key="a">A malfunction voids all pays and plays. If a game, our platform or a provider&apos;s system malfunctions, any affected bets and wins are void. Where the round could not be completed, the provider may cancel (roll back) the round and the stake is returned to the balance it came from.</p>,
            <p key="b">If an amount is credited to your account by mistake, for example through a technical or human error, a wrong odds or payout figure, or a payment credited twice, it remains our property. You must tell us and must not use it; we may remove it from your account and void any bets placed and winnings obtained with it. If the money has already been withdrawn, you must return it on request.</p>,
            <p key="c">If you lose connection during a game, the round is completed according to the game&apos;s rules and the result is shown in your bet history. We are not responsible for losses caused by your device, internet connection or other circumstances outside our control.</p>,
          ],
        },
        {
          title: "Suspension and closure of accounts",
          items: [
            <p key="a">You may close your account at any time by contacting {co.supportEmail}. If you close your account for gambling-related reasons, please tell us so that we can treat it as self-exclusion (see <L to="responsible-gaming" />).</p>,
            <>
              <p>We may suspend or close an account, block withdrawals, or limit the services available to you if:</p>
              <ul className="list">
                <li>you breach these Terms or any document they refer to;</li>
                <li>we cannot verify you, or we suspect fraud, money laundering, terrorist financing or another crime;</li>
                <li>a payout address or incoming funds are linked to sanctions or to a high-risk source (see the <L to="kyc-aml" />);</li>
                <li>you are under age, live in or play from a restricted country, or are self-excluded;</li>
                <li>we are required to do so by law, by our licensing authority or by a payment provider;</li>
                <li>you behave in an abusive or threatening way towards our staff.</li>
              </ul>
            </>,
            <p key="c">While an account is suspended you cannot log in, play or withdraw. We will explain the reason where the law allows and tell you what you can do. When an account is closed, the verified real balance is paid to you after any checks have been completed, minus amounts that are void under these Terms. Bonus balances and unclaimed rewards are forfeited when an account is closed.</p>,
          ],
        },
        {
          title: "Dormant accounts",
          items: [
            <p key="a">An account is dormant if you have not logged in, played or made a payment for {pending.dormancyPeriod}.</p>,
            <p key="b">Before an account becomes dormant we will contact you at your registered email address. A dormant account fee of {pending.dormantFee} may be charged to the real balance of a dormant account, never taking the balance below zero. You can stop the fee by logging in or asking us to pay out your balance.</p>,
            <p key="c">Bonus balances, pending bonuses and unclaimed rewards on a dormant account are forfeited. Any remaining real balance is kept for you and handled as required by the law of {co.jurisdiction}.</p>,
          ],
        },
        {
          title: "Responsible gaming",
          items: [
            <p key="a">Gambling should be entertainment, not a way to make money. Information, warning signs and the help we offer, including self-exclusion, are in <L to="responsible-gaming" />.</p>,
          ],
        },
        {
          title: "Intellectual property",
          items: [
            <p key="a">The website, the A2Casino name and logo, our software and our content belong to us or our licensors. Games belong to their providers. You may use them only to play on our website for your personal, non-commercial use.</p>,
            <p key="b">You must not copy, change, reverse-engineer or interfere with the website or games, or use automated tools to access them.</p>,
          ],
        },
        {
          title: "Liability",
          items: [
            <p key="a">The services are provided &quot;as is&quot;. We do our best to keep them available and accurate, but we do not promise that they will be uninterrupted or free of errors, and we may change or withdraw games and features.</p>,
            <p key="b">To the extent permitted by law, we are not liable for indirect or consequential loss, loss of profit or opportunity, or losses caused by events beyond our reasonable control, including failures of the internet, payment networks, blockchains or third-party providers.</p>,
            <p key="c">To the extent permitted by law, our total liability to you in connection with the services is limited to the amount of the deposits you made in the 12 months before the event giving rise to the claim. Nothing in these Terms limits liability for fraud, for death or personal injury caused by negligence, or any other liability that cannot be limited by law.</p>,
            <p key="d">You agree to compensate us for losses caused by your breach of these Terms, including fraud and bonus abuse.</p>,
          ],
        },
        {
          title: "Changes to these Terms",
          items: [
            <p key="a">We may change these Terms and the documents they refer to, for example because of changes in law, in our licence or in the services. The date at the top shows when a document was last changed.</p>,
            <p key="b">We will tell you about material changes by email or on the website before they take effect, and may ask you to accept the new version when you next log in. If you do not agree, you may close your account and withdraw your real balance. Bets placed before a change are settled under the version in force when they were placed.</p>,
          ],
        },
        {
          title: "Governing law and disputes",
          items: [
            <p key="a">These Terms are governed by the laws of {co.jurisdiction}.</p>,
            <p key="b">If you have a complaint, please follow the <L to="complaints" />, which includes escalation to our licensing authority and, where available, to {co.adrBody}. Disputes that are not resolved this way are subject to the exclusive jurisdiction of {co.courts}, unless mandatory consumer protection law in your country gives you the right to bring proceedings there.</p>,
            <p key="c">If any part of these Terms is found invalid or unenforceable, the rest remains in force. If we do not enforce a right immediately, we do not give it up.</p>,
          ],
        },
      ]}
    />
  );
}
