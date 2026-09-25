import LegalLayout from '../components/LegalLayout'

export const metadata = { title: 'Terms of Service — Hemingway' }

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="September 25, 2026">
      <section>
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of Hemingway (&quot;Hemingway,&quot; &quot;we,&quot; &quot;us&quot;), a
          web application at hemingwayengine.com that generates video advertisements using AI, including
          text and script generation and AI video rendering. By creating an account or using Hemingway,
          you agree to these Terms.
        </p>
      </section>

      <section>
        <h2>1. The service</h2>
        <p>
          Hemingway lets you describe a product or brief, select or upload an avatar/reference image, and
          generate a short video advertisement. Scripts are generated using Anthropic&apos;s Claude models;
          video is generated using ByteDance&apos;s Seedance model via the BytePlus Ark platform. Generation
          results are AI-produced, may vary between attempts, and are not guaranteed to be free of errors,
          artifacts, or inaccuracies.
        </p>
      </section>

      <section>
        <h2>2. Accounts</h2>
        <p>
          You must provide accurate information when creating an account and are responsible for
          safeguarding your password and any activity under your account. You must be at least 18 years
          old, or the age of majority in your jurisdiction, to use Hemingway.
        </p>
      </section>

      <section>
        <h2>3. Subscriptions and billing</h2>
        <p>
          Paid plans are billed monthly in advance and renew automatically until cancelled. Payments are
          processed by Paddle, our merchant of record — your purchase is a transaction with Paddle.com
          Market Ltd, and their terms also apply. Each plan includes a fixed number of video generations
          per billing cycle (displayed as &quot;credits&quot; in the product); unused credits do not roll over to
          the next cycle. You can cancel anytime from the Billing page to stop future renewals; see our{' '}
          <a href="/refund-policy">Refund Policy</a> for what happens to the current cycle.
        </p>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>You agree not to use Hemingway to:</p>
        <ul>
          <li>Generate content that is illegal, defamatory, fraudulent, or infringes someone else&apos;s rights (including likeness, trademark, or copyright)</li>
          <li>Upload a photo or likeness of a real person without their consent to use it that way</li>
          <li>Generate deceptive claims about a product, especially health, financial, or safety claims you cannot substantiate</li>
          <li>Attempt to abuse, overload, reverse-engineer, or interfere with the service</li>
        </ul>
        <p>We may suspend or terminate accounts that violate this section.</p>
      </section>

      <section>
        <h2>5. Your content and ownership</h2>
        <p>
          You retain ownership of the briefs, images, and other material you upload (&quot;Input&quot;). Subject to
          these Terms and payment of applicable fees, you own the video ads generated for your account
          (&quot;Output&quot;) and may use them commercially. You&apos;re responsible for making sure you have the
          rights to any Input you provide us, and for how you use any Output.
        </p>
      </section>

      <section>
        <h2>6. Third-party processing</h2>
        <p>
          Generating a video necessarily sends your brief and images to our AI providers (Anthropic and
          BytePlus/ByteDance) for processing. See our <a href="/privacy">Privacy Policy</a> for the full list
          of processors and what data goes where.
        </p>
      </section>

      <section>
        <h2>7. Disclaimers</h2>
        <p>
          Hemingway is provided &quot;as is.&quot; AI-generated video and script output can be unpredictable — we
          don&apos;t guarantee any particular result, generation speed, or that output will be error-free. You
          are responsible for reviewing generated ads before publishing them, including for factual
          accuracy and compliance with advertising regulations that apply to your business.
        </p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Hemingway is not liable for indirect, incidental, or
          consequential damages arising from your use of the service. Our total liability for any claim is
          limited to the amount you paid us in the 3 months before the claim arose.
        </p>
      </section>

      <section>
        <h2>9. Changes</h2>
        <p>
          We may update these Terms from time to time. If we make material changes, we&apos;ll update the
          date at the top of this page. Continued use of Hemingway after a change means you accept the
          updated Terms.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions about these Terms? Email <a href="mailto:support@hemingwayengine.com">support@hemingwayengine.com</a>.
        </p>
      </section>
    </LegalLayout>
  )
}
