# RT-SC · Phase 4c-v — Annual formula picker + copy fix

Two small additions you asked about. Quick patch.

## 1. Annual formula picker in BulletinConfigCard

Until now the annual formula (`standard` vs `simple`) was set in code only — admins had to flip it in Firestore Console. Now it's a proper UI control in **Année → Paramètres des bulletins**, sitting between the Note de conduite field and the Période dates editor.

Two side-by-side radio cards:

**Standard (Bénin)** — selected by default
> La dernière période compte double. Ex. trimestres : (T1 + T2 + T3×2) / 4.

**Simple**
> Moyenne arithmétique de toutes les périodes, à poids égaux.

Selection persists with the rest of the BulletinConfig fields when you tap "Enregistrer".

If your school uses the standard Bénin convention, just leave it on Standard — that's the default, no action needed. Some schools (especially private/international ones) prefer Simple — flip there.

## 2. Copy fix for the bulletins-delete button

The original copy was:
> **Supprimer les bulletins de la période** — utile après corrections importantes. Ne touche pas aux notes.

You correctly flagged it as confusing. The new copy:
> **Supprimer les bulletins de la période** — pour repartir d'une base propre après plusieurs corrections. Ne supprime PAS les notes saisies par les profs.
>
> *Pour de petites corrections, « Régénérer les bulletins » suffit (écrase en place).*

Two improvements:
- Replaced the vague "Ne touche pas aux notes" with the explicit "Ne supprime PAS les notes saisies par les profs" — clear that "notes" means the underlying interros/devoirs entered by profs, not the bulletin docs we're deleting
- Added a small italic line clarifying when to use this vs. just regenerating

This makes the difference between the two PP unlock actions actually understandable.

## On the prof bulletin-display question

Your other question — whether profs see student bulletins in PDF/display form — the proposal for **Phase 4d** is:

- **Élèves and parents**: see their own bulletin (display + PDF download)
- **PP**: sees bulletins for every élève in their PP class(es); also gets a "PDF en lot" action to download all class bulletins in one ZIP for printing
- **Regular prof**: only sees the per-matière view we built (baromètre, ranks, closed grid). No full bulletins — privacy reasons. Their matière is the only data they should see across students.
- **Admin**: read access to all bulletins across all classes

If your school operates differently and wants every prof to see full bulletins, that becomes a config flag we can add — let me know.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4c-v.zip
```

No `npm install` needed.

## What to test

1. **As admin** → Année → Paramètres des bulletins → scroll to "Formule moyenne annuelle"
   - Two radio cards visible
   - Click Simple → card highlights → Enregistrer becomes active → save → reload → still Simple
   - Click back to Standard → save → reload → still Standard
   - In Firestore Console, verify `ecole/bulletinConfig.formuleAnnuelle` reflects your choice
2. **As PP** → Bulletins → Annuelle → click "Clôturer l'année"
   - Modal should display formula in the periods strip ("Formule simple : moyenne arithmétique" or the standard description with the gold ×2 badge)
3. **As PP with bulletins generated** → Bulletins → Période → Actions PP — déverrouillage (expand)
   - The "Supprimer les bulletins" section now has the clearer copy

## Status

```
Phase 4c-v     ✅ Annual formula picker + copy fix    ← we are here
Phase 4d       ⏭  Bulletin display + PDF export
```
