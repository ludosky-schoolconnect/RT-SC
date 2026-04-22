/**
 * RT-SC · EnglishHubWidget — daily English micro-lesson for élève Accueil.
 *
 * Reads a deterministic word-of-the-day from the local catalog
 * (ENGLISH_DATABASE) — same word for every student on any given day.
 * Renders in the standard RT-SC widget idiom:
 *
 *   - White card, ring-1 ring-ink-100, soft shadow
 *   - Navy display font for the word itself
 *   - Indigo-tinted icon pill instead of a full-bleed gradient
 *   - Gold streak pill (only prominent past 3 days)
 *   - Quiz options as ghost-outline buttons that flip to semantic
 *     success/danger backgrounds after answer submission
 *
 * State sync:
 *   - 1 Firestore read on mount (streak + last-answer date from
 *     /classes/{cid}/eleves/{eid})
 *   - 1 Firestore write per day per student (when they answer)
 *   - Streak auto-resets client-side + persists if the student
 *     skipped yesterday (non-critical; no blocking if write fails)
 *
 * The legacy vanilla app shipped an eye-catching gradient. In the
 * React rewrite this widget sits in a column with other widgets,
 * so aggressive brand styling would break visual hierarchy. We
 * keep the content but honor the Accueil's quiet-elegance tone.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import {
  Flame,
  CheckCircle2,
  XCircle,
  RefreshCcw,
} from 'lucide-react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { eleveDoc } from '@/lib/firestore-keys'
import {
  ENGLISH_DATABASE,
  type EnglishEntry,
} from '@/data/englishDatabase'
import { cn } from '@/lib/cn'

interface Props {
  classeId: string
  eleveId: string
}

type QuizState =
  | { phase: 'loading' }
  | { phase: 'ready'; streak: number }
  | {
      phase: 'revealed'
      streak: number
      pickedIdx: number
      correct: boolean
    }
  | { phase: 'done_today'; streak: number }

// ─── Helpers ────────────────────────────────────────────────

/** Today as "YYYY-MM-DD" in local timezone. */
function todayISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Yesterday as "YYYY-MM-DD". */
function yesterdayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA')
}

/** Deterministic daily index — all students see the same word each day. */
function pickDaily(): EnglishEntry {
  const dayIndex = Math.floor(Date.now() / 86_400_000)
  return ENGLISH_DATABASE[dayIndex % ENGLISH_DATABASE.length]
}

/** "in 4h" or "in 23 min" — shown after the quiz to hint at the next drop. */
function untilMidnightLabel(): string {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const ms = midnight.getTime() - now.getTime()
  const hours = Math.floor(ms / 3_600_000)
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  if (hours >= 1) return `dans ${hours}h`
  if (mins >= 1) return `dans ${mins} min`
  return "dans un instant"
}

// ─── Component ──────────────────────────────────────────────

export function EnglishHubWidget({ classeId, eleveId }: Props) {
  const entry = useMemo(() => pickDaily(), [])
  const [state, setState] = useState<QuizState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ref = doc(db, eleveDoc(classeId, eleveId))
        const snap = await getDoc(ref)
        if (cancelled) return
        const raw = (snap.exists() ? snap.data() : {}) as {
          englishStreak?: number
          lastEnglishQuiz?: string
        }
        let streak = raw.englishStreak ?? 0
        const last = raw.lastEnglishQuiz ?? null
        const today = todayISO()
        const yesterday = yesterdayISO()

        // Gap detection: if the student has a streak but didn't
        // answer yesterday OR today, streak resets. Persist so the
        // counter doesn't lie on next login.
        if (streak > 0 && last !== today && last !== yesterday) {
          streak = 0
          updateDoc(ref, { englishStreak: 0 }).catch(() => {})
        }

        if (cancelled) return
        setState(
          last === today
            ? { phase: 'done_today', streak }
            : { phase: 'ready', streak }
        )
      } catch (err) {
        console.warn('[EnglishHub] load failed:', err)
        if (!cancelled) setState({ phase: 'ready', streak: 0 })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [classeId, eleveId])

  async function handleAnswer(idx: number) {
    if (state.phase !== 'ready') return
    const correct = idx === entry.ans
    const newStreak = correct ? state.streak + 1 : 0
    setState({
      phase: 'revealed',
      streak: newStreak,
      pickedIdx: idx,
      correct,
    })
    try {
      const ref = doc(db, eleveDoc(classeId, eleveId))
      await updateDoc(ref, {
        englishStreak: newStreak,
        lastEnglishQuiz: todayISO(),
      })
    } catch (err) {
      console.warn('[EnglishHub] save failed:', err)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_2px_8px_-2px_rgba(11,37,69,0.05)] overflow-hidden"
    >
      <LayoutGroup>
        {/* Header: icon pill · label · streak */}
        <header className="flex items-center gap-3 px-4 pt-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 text-[1.1rem]">
            🇬🇧
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.68rem] uppercase tracking-[0.15em] font-bold text-ink-500">
              Mot du jour
            </p>
            <p className="font-display text-[1.35rem] font-black text-navy leading-none mt-0.5 truncate">
              {entry.word}
            </p>
          </div>
          {state.phase !== 'loading' && (
            <StreakPill streak={state.streak} />
          )}
        </header>

        {/* Definition + example */}
        <div className="px-4 mt-2.5 space-y-1.5">
          <p className="text-[0.85rem] leading-snug text-navy">
            {entry.def}
          </p>
          <p className="text-[0.78rem] italic text-ink-500 leading-snug">
            « {entry.ex} »
          </p>
        </div>

        {/* Body — quiz or already-done */}
        <div className="px-4 pb-4 pt-3">
          <AnimatePresence mode="wait">
            {state.phase === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-24 rounded-lg bg-ink-50/70 animate-pulse"
              />
            )}

            {state.phase === 'ready' && (
              <motion.div
                key="quiz"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-[0.78rem] font-bold text-ink-700 mb-2">
                  {entry.q}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {entry.opts.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleAnswer(i)}
                      className="min-h-[44px] rounded-lg border-[1.5px] border-ink-200 bg-white px-3 py-2 text-[0.82rem] font-bold text-navy hover:border-navy hover:bg-navy/5 active:scale-[0.98] transition-all text-left"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {state.phase === 'revealed' && (
              <motion.div
                key="revealed"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="grid grid-cols-2 gap-2">
                  {entry.opts.map((opt, i) => {
                    const isRight = i === entry.ans
                    const isPicked = i === state.pickedIdx
                    return (
                      <div
                        key={i}
                        className={cn(
                          'min-h-[44px] rounded-lg border-[1.5px] px-3 py-2 text-[0.82rem] font-bold flex items-center',
                          isRight &&
                            'border-success bg-success-bg text-success-dark',
                          !isRight &&
                            isPicked &&
                            'border-danger bg-danger-bg text-danger-dark',
                          !isRight &&
                            !isPicked &&
                            'border-ink-100 bg-ink-50/50 text-ink-400'
                        )}
                      >
                        {opt}
                      </div>
                    )
                  })}
                </div>
                <ResultLine
                  correct={state.correct}
                  streak={state.streak}
                />
              </motion.div>
            )}

            {state.phase === 'done_today' && (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg bg-success-bg/60 border border-success/25 p-3 flex items-start gap-2.5"
              >
                <CheckCircle2
                  className="h-5 w-5 text-success-dark shrink-0 mt-0.5"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-success-dark text-[0.85rem] leading-tight">
                    Quiz du jour terminé
                  </p>
                  <p className="text-[0.75rem] text-ink-600 mt-0.5 leading-snug">
                    Nouveau mot {untilMidnightLabel()}.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </motion.div>
  )
}

// ─── Streak pill ────────────────────────────────────────────

function StreakPill({ streak }: { streak: number }) {
  if (streak === 0) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[0.66rem] font-bold text-ink-500">
        <Flame className="h-3 w-3" aria-hidden />
        0
      </span>
    )
  }
  const hot = streak >= 3
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-black',
        hot
          ? 'bg-gold-pale text-gold-dark ring-1 ring-gold/30'
          : 'bg-ink-100 text-ink-700'
      )}
    >
      <Flame
        className={cn('h-3 w-3', hot && 'text-gold-dark')}
        aria-hidden
      />
      {streak}
    </span>
  )
}

// ─── Result line (shown after answering) ────────────────────

function ResultLine({
  correct,
  streak,
}: {
  correct: boolean
  streak: number
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.2 }}
      className="mt-3 flex items-center gap-1.5 text-[0.78rem]"
    >
      {correct ? (
        <>
          <Flame className="h-3.5 w-3.5 text-gold-dark" aria-hidden />
          <span className="font-bold text-success-dark">
            Correct ! Série : {streak} jour{streak > 1 ? 's' : ''}.
          </span>
        </>
      ) : (
        <>
          <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden />
          <span className="font-bold text-danger-dark">
            Presque ! Série remise à zéro.
          </span>
          <RefreshCcw
            className="h-3 w-3 text-ink-400 ml-auto"
            aria-hidden
          />
        </>
      )}
    </motion.div>
  )
}
