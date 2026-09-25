import LegalLayout from '../components/LegalLayout'

export const metadata = { title: 'Privacy Policy — Hemingway' }

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="September 25, 2026">
      <section>
        <p>
          This Privacy Policy explains what data Hemingway collects, why, and who we share it with. We
          collect the minimum needed to run the product and bill for it.
        </p>
      </section>

      <section>
        <h2>1. What we collect</h2>
        <ul>
          <li><strong>Account data</strong> — your email and a securely hashed password (we never store your plain-text password).</li>
          <li><strong>Business profile</strong> — full name, business name, industry, and company size you give us during onboarding.</li>
          <li><strong>Content you provide</strong> — ad briefs, product descriptions, uploaded product/avatar images, and any custom avatars you create.</li>
          <li><strong>Generated content</strong> — the scripts and videos Hemingway produces for you, stored so you can view and download them later.</li>
          <li><strong>Billing data</strong> — your subscription plan and status. Card details are handled entirely by Paddle; we never see or store your card number.</li>
          <li><strong>Usage data</strong> — basic technical data like IP address and timestamps, used for rate-limiting and abuse prevention.</li>
        </ul>
      </section>

      <section>
        <h2>2. Why we collect it</h2>
        <ul>
          <li>To generate your ads (briefs and images are sent to our AI providers to produce scripts and video)</li>
          <li>To run your account (sign-in, saved avatars, video library)</li>
          <li>To bill your subscription and enforce plan limits</li>
          <li>To improve future generations for your account — we keep a lightweight record of which ads you&apos;ve downloaded, used only to give our script generator relevant examples of what you&apos;ve liked before</li>
          <li>To send account emails — verification links, password resets, and billing receipts</li>
          <li>To prevent abuse (rate limiting sign-ups and sign-ins)</li>
        </ul>
      </section>

      <section>
        <h2>3. Who we share it with</h2>
        <p>We use the following processors to run Hemingway. Each only receives the data it needs to do its job:</p>
        <ul>
          <li><strong>Anthropic</strong> — processes your brief text to generate ad scripts</li>
          <li><strong>BytePlus / ByteDance (Seedance)</strong> — processes your brief, images, and script to generate video</li>
          <li><strong>Paddle</strong> — our merchant of record; handles payment, your card details, and receipts</li>
          <li><strong>Resend</strong> — sends verification, password-reset, and transactional email on our behalf</li>
          <li><strong>Vercel</strong> — hosts the application and stores uploaded images and generated videos (Vercel Blob)</li>
          <li><strong>Neon</strong> — hosts our database (account, profile, and subscription data)</li>
        </ul>
        <p>We don&apos;t sell your data, and we don&apos;t share it with anyone else for advertising or marketing purposes.</p>
      </section>

      <section>
        <h2>4. Data retention</h2>
        <p>
          We keep your account data and generated videos for as long as your account is active. If you&apos;d
          like your account and its data deleted, email us and we&apos;ll process the request.
        </p>
      </section>

      <section>
        <h2>5. Your rights</h2>
        <p>
          Depending on where you live, you may have the right to access, correct, export, or delete your
          personal data. To exercise any of these, email <a href="mailto:support@hemingwayengine.com">support@hemingwayengine.com</a>.
        </p>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>
          Passwords are hashed with scrypt and a per-account random salt — we never store them in plain
          text. Data in transit is encrypted (HTTPS). No system is perfectly secure, but we take reasonable
          measures to protect your data.
        </p>
      </section>

      <section>
        <h2>7. Changes</h2>
        <p>
          If we make material changes to this policy, we&apos;ll update the date at the top of this page.
        </p>
      </section>

      <section>
        <h2>8. Contact</h2>
        <p>
          Questions about this policy? Email <a href="mailto:support@hemingwayengine.com">support@hemingwayengine.com</a>.
        </p>
      </section>
    </LegalLayout>
  )
}
