const sectionStyle = { fontFamily: 'var(--db-font-display)', fontSize: 14, letterSpacing: '0.08em', color: 'var(--db-text-primary)', marginTop: 28, marginBottom: 12 }
const bodyStyle = { fontFamily: 'var(--db-font-mono)', fontSize: 13, color: 'var(--db-text-secondary)', lineHeight: 1.8 }

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100%', background: 'var(--db-bg-page)', padding: '24px 20px 80px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--db-font-display)', fontSize: 'clamp(24px, 5vw, 36px)', color: '#ff6b35', letterSpacing: '0.06em', marginBottom: 6 }}>TERMS OF SERVICE</h1>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-muted)', marginBottom: 32 }}>Last updated: April 2026</p>

        <h2 style={sectionStyle}>ACCEPTANCE OF TERMS</h2>
        <p style={bodyStyle}>By using Dobber, you agree to these terms. If you do not agree, do not use the app.</p>

        <h2 style={sectionStyle}>DESCRIPTION OF SERVICE</h2>
        <p style={bodyStyle}>Dobber is a free-to-play sports bingo game. Players receive bingo cards with real player stat lines that auto-mark during live games. Dobber is NOT a gambling application — no real money is wagered at any time.</p>

        <h2 style={sectionStyle}>VIRTUAL CURRENCY (DOBS)</h2>
        <ul style={bodyStyle}>
          <li>Dobs are virtual points earned through gameplay.</li>
          <li>Dobs have NO monetary value whatsoever.</li>
          <li>Dobs cannot be purchased, sold, traded, or exchanged for real money or goods.</li>
          <li>Dobs are used solely within the app to purchase cosmetic items.</li>
          <li>We reserve the right to modify Dobs balances, earn rates, and pricing at any time.</li>
        </ul>

        <h2 style={sectionStyle}>VOLUNTARY CONTRIBUTIONS</h2>
        <ul style={bodyStyle}>
          <li>Users may voluntarily contribute money to support Dobber's development.</li>
          <li>Contributions are not purchases of digital goods or services.</li>
          <li>Contributions do not provide gameplay advantages.</li>
          <li>Contributions are non-refundable.</li>
        </ul>

        <h2 style={sectionStyle}>USER ACCOUNTS</h2>
        <ul style={bodyStyle}>
          <li>You must be at least 13 years old to create an account.</li>
          <li>You are responsible for maintaining account security.</li>
          <li>One account per person — multi-accounting is prohibited.</li>
          <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
        </ul>

        <h2 style={sectionStyle}>FAIR PLAY</h2>
        <p style={bodyStyle}>Automated play, bots, and exploitation of bugs is prohibited. We reserve the right to disqualify players and revoke Dobs for violations.</p>

        <h2 style={sectionStyle}>DISCLAIMER</h2>
        <p style={bodyStyle}>Sports statistics are provided by third-party sources and may be delayed or inaccurate. We are not responsible for stat errors affecting gameplay outcomes. The service is provided "as is" without warranties.</p>

        <h2 style={sectionStyle}>LIMITATION OF LIABILITY</h2>
        <p style={bodyStyle}>Dobber is not liable for any indirect, incidental, or consequential damages. Total liability is limited to the amount you have contributed, if any.</p>

        <h2 style={sectionStyle}>CHANGES TO TERMS</h2>
        <p style={bodyStyle}>We may modify these terms at any time. Continued use after changes constitutes acceptance.</p>

        <h2 style={sectionStyle}>CONTACT</h2>
        <p style={bodyStyle}>Email: ferrencesup@gmail.com</p>
      </div>
    </div>
  )
}
