function DobberLogo({ size = 28 }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-label="Dobber"
      role="img"
      style={{ flexShrink: 0 }}
    >
      <rect x="0" y="0" width="120" height="120" rx="27" fill="#ff6b35" />
      <circle cx="28" cy="26" r="7" fill="#0c0c14" />
      <circle cx="40" cy="40" r="8" fill="#0c0c14" />
      <circle cx="60" cy="60" r="18" fill="#0c0c14" />
      <circle cx="60" cy="60" r="13" fill="#ff6b35" />
      <circle cx="60" cy="60" r="9" fill="none" stroke="#0c0c14" strokeWidth="1" opacity="0.25" />
      <circle cx="80" cy="80" r="8" fill="#0c0c14" />
      <circle cx="92" cy="94" r="7" fill="#0c0c14" />
    </svg>
  )
}

export default DobberLogo
