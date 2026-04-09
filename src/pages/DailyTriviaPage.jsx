import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useTodayTrivia } from '../hooks/useTodayTrivia.js'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticSelection, hapticMedium, hapticLight } from '../lib/haptics.js'

const OPTION_KEYS = ['a', 'b', 'c', 'd']
const OPTION_LABELS = { a: 'A', b: 'B', c: 'C', d: 'D' }

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DailyTriviaPage() {
  const { user } = useAuth()
  const { questions, answers, loading, reload } = useTodayTrivia()
  const { activity, reload: reloadActivity } = useDailyActivity()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [localAnswers, setLocalAnswers] = useState([]) // track answers locally during session
  const [submitting, setSubmitting] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  const alreadyDone = activity?.trivia_completed || answers.length >= 3

  // If already completed, show summary
  if (!loading && alreadyDone && !showSummary) {
    const totalDobs = answers.reduce((sum, a) => sum + (a.dobs_earned ?? 0), 0)
    return (
      <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <Link to="/" className="back-btn" aria-label="Back to home">← Back</Link>
          <h1 style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
            fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
            color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)',
            margin: '8px 0 16px',
          }}>TRIVIA</h1>
        </div>
        <CompletedSummary questions={questions} answers={answers} totalDobs={totalDobs} />
      </main>
    )
  }

  const question = questions[currentIndex]
  const totalAnswered = localAnswers.length + answers.length

  const handleAnswer = async (option) => {
    if (revealed || submitting || !question || !user) return
    hapticSelection()
    setSelectedAnswer(option)
    setRevealed(true)
    setSubmitting(true)

    const isCorrect = option === question.correct_option
    const dobsEarned = isCorrect ? 5 : 0

    if (isCorrect) hapticMedium()

    // Insert answer
    await supabase.from('trivia_answers').insert({
      user_id: user.id,
      question_id: question.id,
      answer_date: todayDateStr(),
      selected_option: option,
      is_correct: isCorrect,
      dobs_earned: dobsEarned,
    })

    setLocalAnswers((prev) => [...prev, { question_id: question.id, selected_option: option, is_correct: isCorrect, dobs_earned: dobsEarned }])
    setSubmitting(false)
  }

  const handleNext = async () => {
    hapticLight()
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1)
      setSelectedAnswer(null)
      setRevealed(false)
    } else {
      // All done — calculate total and complete activity
      const allAnswers = [...answers, ...localAnswers]
      const totalDobs = allAnswers.reduce((sum, a) => sum + (a.dobs_earned ?? 0), 0)

      await supabase.rpc('complete_daily_activity', {
        p_user_id: user.id,
        p_activity: 'trivia',
        p_dobs_earned: totalDobs,
      })

      reload()
      reloadActivity()
      setShowSummary(true)
    }
  }

  const isLastQuestion = currentIndex === questions.length - 1

  return (
    <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <Link to="/" className="back-btn" aria-label="Back to home">← Back</Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 4px' }}>
          <h1 style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
            fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
            color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)', margin: 0,
          }}>TRIVIA</h1>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
            color: 'var(--db-text-muted)',
          }}>
            {currentIndex + 1}/{questions.length}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= currentIndex ? 'var(--db-primary)' : 'var(--db-bg-active)',
              transition: 'background 300ms ease',
            }} />
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)' }}>
            Loading questions...
          </span>
        </div>
      )}

      {/* No questions */}
      {!loading && questions.length === 0 && (
        <div style={{
          margin: '40px 20px', padding: '40px 20px', textAlign: 'center', borderRadius: 14,
          background: 'var(--db-bg-surface)', border: '1px dashed var(--db-border-default)',
        }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)' }}>
            No trivia questions today. Check back tomorrow!
          </span>
        </div>
      )}

      {/* Summary after completion */}
      {showSummary && (
        <CompletedSummary
          questions={questions}
          answers={[...answers, ...localAnswers]}
          totalDobs={[...answers, ...localAnswers].reduce((s, a) => s + (a.dobs_earned ?? 0), 0)}
        />
      )}

      {/* Question card */}
      {!loading && question && !showSummary && (
        <div style={{ padding: '24px 20px 0' }}>
          {/* Category badge */}
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
            letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-primary)',
            background: 'rgba(255,107,53,0.1)', padding: '3px 10px', borderRadius: 4,
          }}>
            {question.category}
          </span>

          {/* Question text */}
          <p style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
            color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-snug)',
            margin: '16px 0 24px',
          }}>
            {question.question}
          </p>

          {/* Answer options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {OPTION_KEYS.map((key) => {
              const text = question[`option_${key}`]
              const isSelected = selectedAnswer === key
              const isCorrect = key === question.correct_option
              const showCorrect = revealed && isCorrect
              const showWrong = revealed && isSelected && !isCorrect

              let bg = 'var(--db-bg-surface)'
              let borderColor = 'var(--db-border-subtle)'
              let textColor = 'var(--db-text-primary)'

              if (showCorrect) {
                bg = 'rgba(34,197,94,0.08)'
                borderColor = 'rgba(34,197,94,0.4)'
                textColor = 'var(--db-success)'
              } else if (showWrong) {
                bg = 'rgba(255,45,45,0.08)'
                borderColor = 'rgba(255,45,45,0.4)'
                textColor = 'var(--db-live)'
              } else if (!revealed && isSelected) {
                borderColor = 'var(--db-primary)'
              }

              return (
                <button
                  key={key}
                  type="button"
                  className={`daily-btn btn-press${revealed ? ' answer-reveal' : ''}`}
                  disabled={revealed}
                  aria-label={`Option ${OPTION_LABELS[key]}: ${text}`}
                  onClick={() => handleAnswer(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 10,
                    background: bg, border: `2px solid ${borderColor}`,
                    cursor: revealed ? 'default' : 'pointer',
                    textAlign: 'left', width: '100%',
                    transition: 'all 150ms ease',
                    ...(revealed ? { animationDelay: `${OPTION_KEYS.indexOf(key) * 60}ms` } : {}),
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
                    fontWeight: 'var(--db-weight-bold)',
                    background: showCorrect ? 'rgba(34,197,94,0.15)' : showWrong ? 'rgba(255,45,45,0.15)' : 'var(--db-bg-active)',
                    color: textColor,
                  }}>
                    {OPTION_LABELS[key]}
                  </span>
                  <span style={{
                    fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-base)',
                    color: textColor,
                  }}>
                    {text}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Fun fact + next button */}
          {revealed && (
            <div style={{ marginTop: 20 }}>
              {question.fun_fact && (
                <div className="fact-slide-in" style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 16,
                  background: 'rgba(255,107,53,0.05)', border: '1px solid rgba(255,107,53,0.15)',
                }}>
                  <span style={{
                    fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                    letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-primary)',
                    display: 'block', marginBottom: 4,
                  }}>DID YOU KNOW?</span>
                  <span style={{
                    fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
                    color: 'var(--db-text-secondary)', lineHeight: 'var(--db-leading-normal)',
                  }}>
                    {question.fun_fact}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={handleNext}
                style={{
                  width: '100%', padding: '16px', borderRadius: 10, border: 'none',
                  background: 'var(--db-gradient-primary)', color: '#fff',
                  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
                  fontWeight: 'var(--db-weight-extrabold)', letterSpacing: 'var(--db-tracking-wide)',
                  cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,107,53,0.3)',
                }}
              >
                {isLastQuestion ? 'SEE RESULTS' : 'NEXT QUESTION'}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  )
}

function CompletedSummary({ questions, answers, totalDobs }) {
  const correct = answers.filter((a) => a.is_correct).length

  return (
    <div style={{ padding: '24px 20px 0' }}>
      {/* Score card */}
      <div className="celebrate-pop" style={{
        padding: '24px', borderRadius: 14, textAlign: 'center',
        background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
        marginBottom: 20,
      }}>
        <span style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-4xl)',
          color: correct === questions.length ? 'var(--db-success)' : 'var(--db-primary)',
          display: 'block', lineHeight: 1,
        }}>
          {correct}/{questions.length}
        </span>
        <span style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
          color: 'var(--db-text-muted)', display: 'block', marginTop: 8,
        }}>
          {correct === questions.length ? 'Perfect score!' : correct > 0 ? 'Nice work!' : 'Better luck tomorrow!'}
        </span>
        <span style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
          color: 'var(--db-primary)', display: 'block', marginTop: 12,
        }}>
          +{totalDobs} ◈
        </span>
      </div>

      {/* Question review */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.map((q, i) => {
          const answer = answers.find((a) => a.question_id === q.id)
          const isCorrect = answer?.is_correct ?? false
          return (
            <div key={q.id} style={{
              padding: '12px 14px', borderRadius: 10,
              background: isCorrect ? 'rgba(34,197,94,0.06)' : 'rgba(255,45,45,0.06)',
              border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(255,45,45,0.2)'}`,
            }}>
              <span style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
                color: 'var(--db-text-primary)',
              }}>
                {q.question}
              </span>
              <span style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                color: isCorrect ? 'var(--db-success)' : 'var(--db-text-muted)',
                display: 'block', marginTop: 4,
              }}>
                {isCorrect ? '✓ Correct' : `✗ Answer: ${q[`option_${q.correct_option}`]}`}
              </span>
            </div>
          )
        })}
      </div>

      <Link to="/" className="daily-btn" style={{
        display: 'block', marginTop: 20, padding: '14px', borderRadius: 10,
        background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
        textAlign: 'center', textDecoration: 'none',
        fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
        letterSpacing: 'var(--db-tracking-wide)', color: 'var(--db-text-primary)',
      }}>
        BACK TO HOME
      </Link>
    </div>
  )
}
