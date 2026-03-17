import { useEffect, useState } from 'react'

function calcRemaining(targetDate) {
  if (!targetDate) return { total: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true }
  const total = Math.max(0, new Date(targetDate) - Date.now())
  return {
    total,
    hours:   Math.floor(total / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
    isExpired: total === 0,
  }
}

/**
 * Countdown to targetDate (ISO string or Date).
 * Updates every second when under 5 minutes, every minute otherwise.
 * Returns { total, hours, minutes, seconds, isExpired }.
 */
export function useCountdown(targetDate) {
  const [remaining, setRemaining] = useState(() => calcRemaining(targetDate))

  // Re-run when targetDate changes OR when we cross the 5-minute threshold
  // (boolean dependency flips once, switching from 60s to 1s interval)
  const underFiveMin = remaining.total < 5 * 60_000

  useEffect(() => {
    if (!targetDate) return
    setRemaining(calcRemaining(targetDate))
    const id = setInterval(
      () => setRemaining(calcRemaining(targetDate)),
      underFiveMin ? 1000 : 60_000
    )
    return () => clearInterval(id)
  }, [targetDate, underFiveMin])

  return remaining
}
