const sectionStyle = { fontFamily: 'var(--db-font-display)', fontSize: 14, letterSpacing: '0.08em', color: 'var(--db-text-primary, #e8e8f4)', marginTop: 28, marginBottom: 12 }
const bodyStyle = { fontFamily: 'var(--db-font-mono)', fontSize: 13, color: 'var(--db-text-secondary, rgba(255,255,255,0.55))', lineHeight: 1.8 }

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100%', background: 'var(--db-bg-page, #0c0c14)', padding: '24px 20px 80px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--db-font-display)', fontSize: 'clamp(24px, 5vw, 36px)', color: '#ff6b35', letterSpacing: '0.06em', marginBottom: 6 }}>PRIVACY POLICY</h1>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-muted, rgba(255,255,255,0.35))', marginBottom: 32 }}>Last updated: April 2026</p>

        <h2 style={sectionStyle}>INFORMATION WE COLLECT</h2>
        <div style={bodyStyle}>
          <p><strong>Account info:</strong> email address, username, phone number (optional for Featured Games verification).</p>
          <p><strong>Gameplay data:</strong> games joined, cards generated, squares marked, lines completed, Dobs earned.</p>
          <p><strong>Device info:</strong> push notification tokens (iOS), basic device type for analytics.</p>
          <p>We do <strong>NOT</strong> collect location data, contacts, photos, or any other sensitive data.</p>
        </div>

        <h2 style={sectionStyle}>HOW WE USE YOUR INFORMATION</h2>
        <ul style={bodyStyle}>
          <li>To provide the game experience (matchmaking, leaderboards, stat tracking)</li>
          <li>To send push notifications you've opted into (game start, bingo alerts)</li>
          <li>To prevent multi-accounting and abuse</li>
          <li>To improve the app via error tracking (Sentry)</li>
        </ul>

        <h2 style={sectionStyle}>THIRD-PARTY SERVICES</h2>
        <ul style={bodyStyle}>
          <li><strong>Supabase:</strong> database and authentication hosting</li>
          <li><strong>Stripe:</strong> payment processing for voluntary contributions (web only)</li>
          <li><strong>Sentry:</strong> error monitoring and crash reporting</li>
          <li><strong>ESPN:</strong> live sports statistics (no user data shared)</li>
        </ul>

        <h2 style={sectionStyle}>DATA SHARING</h2>
        <p style={bodyStyle}>We do not sell, rent, or trade your personal information to third parties. Data is only shared with the service providers listed above to operate the app.</p>

        <h2 style={sectionStyle}>DATA RETENTION AND DELETION</h2>
        <ul style={bodyStyle}>
          <li>Account data is retained while your account is active.</li>
          <li>You can request complete data deletion by emailing ferrencesup@gmail.com.</li>
          <li>Upon deletion request, all personal data is permanently removed within 30 days.</li>
        </ul>

        <h2 style={sectionStyle}>YOUR RIGHTS (CCPA)</h2>
        <ul style={bodyStyle}>
          <li>Right to know what data we collect</li>
          <li>Right to delete your data</li>
          <li>Right to opt out of data sales (we don't sell data)</li>
          <li>Contact: ferrencesup@gmail.com</li>
        </ul>

        <h2 style={sectionStyle}>CHILDREN'S PRIVACY</h2>
        <p style={bodyStyle}>Dobber is not intended for children under 13. We do not knowingly collect data from children under 13.</p>

        <h2 style={sectionStyle}>CHANGES TO THIS POLICY</h2>
        <p style={bodyStyle}>We may update this policy periodically. Continued use of Dobber after changes constitutes acceptance.</p>

        <h2 style={sectionStyle}>CONTACT</h2>
        <p style={bodyStyle}>Email: ferrencesup@gmail.com</p>
      </div>
    </div>
  )
}
