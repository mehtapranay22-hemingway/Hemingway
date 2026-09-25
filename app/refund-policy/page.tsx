import LegalLayout from '../components/LegalLayout'

export const metadata = { title: 'Refund Policy — Hemingway' }

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund Policy" updated="September 25, 2026">
      <section>
        <p>
          Hemingway subscriptions are billed monthly in advance through Lemon Squeezy, our merchant of
          record. This policy explains when a refund is available.
        </p>
      </section>

      <section>
        <h2>1. First-cycle guarantee</h2>
        <p>
          If you subscribe and haven&apos;t generated any videos yet, you can request a full refund within 7
          days of your first payment. Email <a href="mailto:support@hemingwayengine.com">support@hemingwayengine.com</a>{' '}
          from the address on your account and we&apos;ll process it through Lemon Squeezy.
        </p>
      </section>

      <section>
        <h2>2. After you&apos;ve generated a video</h2>
        <p>
          Each video generation uses real, paid compute from our AI providers, so once you&apos;ve generated
          at least one video in a billing cycle, that cycle&apos;s payment is non-refundable. You can still
          cancel to stop future renewals — see below.
        </p>
      </section>

      <section>
        <h2>3. Cancelling</h2>
        <p>
          You can cancel anytime from the Billing page. Cancelling stops future renewals but doesn&apos;t
          refund the current cycle — you keep access (and any remaining credits) until the end of the
          period you&apos;ve already paid for.
        </p>
      </section>

      <section>
        <h2>4. Billing errors</h2>
        <p>
          If you were charged in error — a duplicate charge, a charge after you cancelled, or an incorrect
          amount — email us and we&apos;ll fix it, no time limit for genuine billing mistakes.
        </p>
      </section>

      <section>
        <h2>5. How refunds are issued</h2>
        <p>
          Approved refunds are issued by Lemon Squeezy back to your original payment method, and usually
          take 5–10 business days to appear depending on your bank or card issuer.
        </p>
      </section>

      <section>
        <h2>6. Contact</h2>
        <p>
          Questions about a charge? Email <a href="mailto:support@hemingwayengine.com">support@hemingwayengine.com</a>.
        </p>
      </section>
    </LegalLayout>
  )
}
