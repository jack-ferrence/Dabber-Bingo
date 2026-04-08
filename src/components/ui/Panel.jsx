function Panel({ title, className = '', children }) {
  return (
    <div
      className={`rounded-lg border p-4 card-bevel ${className}`}
      style={{ background: 'var(--db-bg-elevated)', borderColor: 'var(--db-border-subtle)' }}
    >
      {title && (
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

export default Panel
