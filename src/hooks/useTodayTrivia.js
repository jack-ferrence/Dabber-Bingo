import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth.jsx'

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Fetches today's trivia questions (limit 3) and the user's answers.
 */
export function useTodayTrivia() {
  const { user } = useAuth()
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }

    const today = todayDateStr()

    const [qRes, aRes] = await Promise.all([
      supabase
        .from('trivia_questions')
        .select('*')
        .eq('question_date', today)
        .order('question_order', { ascending: true })
        .limit(3),
      supabase
        .from('trivia_answers')
        .select('*')
        .eq('user_id', user.id)
        .eq('answer_date', today),
    ])

    setQuestions(qRes.data ?? [])
    setAnswers(aRes.data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  return { questions, answers, loading, reload: load }
}
