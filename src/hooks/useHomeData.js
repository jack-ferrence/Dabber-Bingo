import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth.jsx'

/**
 * Fetches all open public rooms and the current user's joined rooms
 * (with card progress). Subscribes to realtime changes.
 *
 * Returns { allRooms, myRooms, loading, error, reload }
 */
export function useHomeData() {
  const { user } = useAuth()
  const [allRooms, setAllRooms] = useState([])
  const [myRooms, setMyRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const initialLoadDone = useRef(false)

  const load = useCallback(async () => {
    if (!initialLoadDone.current) setLoading(true)
    setError(null)

    try {
      // Fetch live/lobby rooms, recently finished rooms, and user participations in parallel
      const [liveAndLobbyResult, recentFinishedResult, participantsResult] = await Promise.all([
        supabase
          .from('rooms_with_counts')
          .select('*')
          .eq('room_type', 'public')
          .in('status', ['lobby', 'live'])
          .order('starts_at', { ascending: true, nullsFirst: false }),
        supabase
          .from('rooms_with_counts')
          .select('*')
          .eq('room_type', 'public')
          .eq('status', 'finished')
          .gte('starts_at', new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString())
          .order('starts_at', { ascending: false })
          .limit(30),
        user
          ? supabase
              .from('room_participants')
              .select('room_id')
              .eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ])

      if (liveAndLobbyResult.error) throw liveAndLobbyResult.error

      const participantData = participantsResult.data ?? []
      const joinedIds = participantData.map((p) => p.room_id)

      const allRoomsData = [
        ...(liveAndLobbyResult.data ?? []),
        ...(recentFinishedResult.data ?? []),
      ]
      setAllRooms(allRoomsData)

      // Build myRooms for sidebar (active + finished)
      if (user && joinedIds.length > 0) {
        const allJoined = allRoomsData.filter((r) => joinedIds.includes(r.id))

        const { data: cardsData } = await supabase
          .from('cards')
          .select('room_id, lines_completed, squares_marked')
          .eq('user_id', user.id)
          .in('room_id', allJoined.map((r) => r.id))

        const cardsByRoom = {}
        for (const card of cardsData ?? []) {
          cardsByRoom[card.room_id] = card
        }

        setMyRooms(
          allJoined.map((room) => ({
            ...room,
            lines_completed: cardsByRoom[room.id]?.lines_completed ?? 0,
            squares_marked: cardsByRoom[room.id]?.squares_marked ?? 0,
          }))
        )
      } else {
        setMyRooms([])
      }
    } catch (err) {
      setError(err.message)
    }

    setLoading(false)
    initialLoadDone.current = true
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Realtime: reload on rooms or participant changes (debounced)
  const debounceRef = useRef(null)
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(), 600)
  }, [load])

  useEffect(() => {
    const roomsCh = supabase
      .channel('home-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, debouncedLoad)
      .subscribe()

    const participantsCh = supabase
      .channel('home-participants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants' }, debouncedLoad)
      .subscribe()

    return () => {
      supabase.removeChannel(roomsCh)
      supabase.removeChannel(participantsCh)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [debouncedLoad])

  return { allRooms, myRooms, loading, error, reload: load }
}
