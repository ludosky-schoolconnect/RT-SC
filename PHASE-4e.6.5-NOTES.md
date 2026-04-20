# RT-SC · Phase 4e.6.5 — Locked notice copy refresh

You spotted that the locked notice was leaking PP procedure to regular profs. Fixed.

## What changed

The bulletin-generated notice was telling profs to do the PP's job:

> Le bulletin de cette période a déjà été généré. Pour ajouter ou supprimer une colle, le professeur principal doit d'abord supprimer les bulletins de la période (onglet Bulletins → Déverrouiller), puis les régénérer une fois les colles ajustées.

Wrong audience. A regular prof shouldn't need to know what the PP does internally — they just need to know the right action: contact the PP. Now:

> Cette colle ne peut plus être ajoutée ni supprimée. Pour toute modification, contactez le **professeur principal**.

The matière-closure notice is also tightened:

> Vous avez clôturé cette matière pour cette période. Pour un incident postérieur, donnez la colle pour la **période suivante**, ou contactez le professeur principal.

Both notices are now short, prescriptive, and audience-appropriate.

## On the matière-clôture lock

Quick clarification on your other point — the matière-clôture lock IS implemented (Phase 4e.6.4) and IS firing correctly. In your screenshot both conditions were true (matière clôturé AND bulletin generated), and the bulletin-lock takes priority because it's the more comprehensive blocker (bulletin generated implies all matières clôturé anyway).

If you want to verify the matière-only path: clôture a matière but DON'T generate the period's bulletin yet. Open the colle modal → you should see the "Matière clôturée" notice instead.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.6.5-locknotice.zip
```

Vite hot-reloads.

## Status

```
Phase 4e.6.5   ✅ Locked notice copy refresh           ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent
Phase 5        ⏭ Daily ops + PP Vie scolaire
```
