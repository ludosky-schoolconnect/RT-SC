# Phase 5d.4 — Appel raison capture (matches legacy)

## What this phase ships

The prof can now type a reason when marking a student absent during
appel — same flow as the legacy SchoolConnect. The reason is optional;
leaving it empty saves the row without one (displayed as "Aucune raison
renseignée" downstream).

This was the missing piece causing the "« inconnue »" placeholder to
appear in the admin delete confirm. Going forward, raisons are real
strings written by the prof.

## The legacy behavior, ported

In the legacy app, when a prof flipped a student to Absent, an inline
picker appeared:

```
Raison de l'absence :
[ Inconnue ]   ou   [ Raison (Max 40 car.)  ] [ Enregistrer ]
```

RT-SC simplifies this to a single inline input — no separate "Inconnue"
button, because "Inconnue" was just a way to skip the input back when
clicking Save was a separate step. Now the input is always present (and
optional), so the prof can:

- Leave it empty → no raison saved
- Type something → raison stored verbatim
- Click "Effacer" → quick-clear

The 40 char max is preserved because that's what the legacy data model
expects, and it forces concise reasons rather than mini-essays.

## Storage shape

`AbsentMark` already had an optional `raison` field — no schema change
needed. The save payload conditionally includes it:

```ts
absents[e.id] = r ? { nom, heure, raison: r } : { nom, heure }
```

When raison is empty, the field is omitted entirely (rather than stored
as empty string). Cleaner queries, smaller docs.

## Re-take preserves raisons (anti-clobber)

Critical detail: when a prof re-opens an appel that was already saved,
the existing slot is fetched and the local state is hydrated:

```ts
Object.entries(existingSlot.absents ?? {}).forEach(([id, mark]) => {
  nextMarks.set(id, 'absent')
  if (mark?.raison) nextRaisons.set(id, mark.raison)  // ← preserved
})
```

Without this, a prof correcting one student's status would silently
wipe everyone else's raison on save. Now the raisons round-trip cleanly.

## Cleanup on flip-back-to-present

When a prof changes a student from Absent back to Présent, their raison
is dropped from local state:

```ts
if (etat !== 'absent') {
  setRaisons((prev) => {
    const next = new Map(prev)
    next.delete(eleveId)
    return next
  })
}
```

This prevents a ghost raison from re-appearing if the prof flips them
back to Absent later — the input would otherwise show the stale text.

## On the user's "what about update/cancel?" question

Re-take is safe by design. The save does:

```ts
setDoc(presenceDocRef, { [matiereSlug]: slot }, { merge: true })
```

The `merge: true` protects OTHER matières' slots in the same day's doc
(e.g. another prof's Anglais slot stays untouched). But within
`{matiereSlug}`, the entire slot object is replaced — so if Marie was
marked absent in a previous save and the prof re-opens, sees they
clicked the wrong row, flips her to Présent and saves, the new slot
has no Marie in `slot.absents{}`. Her absence is cleanly cancelled.

No special "cancel" or "delete" flow needed.

## On the "« inconnue » sera supprimée" message

That dialog wording was already partially fixed (in a previous patch
not in the journal — `src/lib/absences-display.ts` exists with
`cleanRaison()` that maps "inconnue" → null). The fallback message
now reads:

> "La déclaration de Marie KPETA (lun. 21 avr.) sera supprimée
>  définitivement."

Identifying the row by élève + date instead of quoting a meaningless
placeholder. With this phase shipped, new appel-marked absences will
have real raisons (or no raison at all), so the placeholder fallback
only ever shows for legacy data + the 14-day cleanup will eventually
clear those out.

## Files

### Modified

- `src/routes/prof/tabs/appel/AppelScreen.tsx`
  - Added `raisons: Map<string, string>` parallel state
  - Hydrated from existing slot on snap
  - Cleanup on flip-to-present
  - Inline raison input renders below absent rows (40 char max,
    optional, with Effacer quick-clear)
  - Save payload conditionally includes raison only when non-empty

### Pre-existing (mentioned for completeness — already in code)

- `src/lib/absences-display.ts` — `cleanRaison()` maps known placeholders
  to null, plus `RAISON_PLACEHOLDER` constant for the "Aucune raison
  renseignée" fallback string
- `AbsencesEcoleView.tsx` and `AbsencesClasseView.tsx` already use both
  helpers in their delete confirms and display

## Testing priorities

1. **Mark absent, type raison, save** — prof opens appel, flips Marie
   to Absent, the raison input appears below her row in red. Type
   "Rendez-vous médical". Save. Re-open the same appel — Marie is
   still Absent, the input still shows "Rendez-vous médical".

2. **Mark absent, leave empty, save** — same as above but skip the
   input. Save works. Re-open — Marie is Absent, input is empty.

3. **Flip back to présent** — Marie has raison "Malade". Flip her back
   to Présent. Flip her back to Absent. Input is empty (raison was
   cleared on the flip-to-present, no ghost text).

4. **40 char max** — type a long string; input cuts off at 40 chars.

5. **Effacer button** — type something, "Effacer" appears. Click it,
   field is empty, button disappears.

6. **Re-take preserves OTHER raisons** — prof saves with Marie absent
   ("Malade") and Pierre absent ("Sans excuse"). Re-opens, only changes
   Marie's status to Présent (doesn't touch Pierre). Save. Pierre's
   raison "Sans excuse" still in the saved doc.

7. **Admin Vie scolaire shows the raison** — open Vie scolaire (admin
   or prof), expand Marie's row, the marked absence card shows
   "Note : Rendez-vous médical" italic line.

8. **Empty raisons display gracefully** — for absences saved without
   a raison, the timeline card omits the Note line entirely instead
   of showing "inconnue" or empty quotes.
