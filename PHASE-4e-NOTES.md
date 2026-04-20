# RT-SC · Phase 4e — Élève + Parent dashboards + PDF export

The consuming side. What we've been building toward all along: families and élèves can now actually SEE and DOWNLOAD their bulletins.

## What's in this patch

| Surface | Status |
|---|---|
| Élève dashboard | ✅ Replaces Phase 0 stub — full DashboardLayout with Bulletins + Plus tabs |
| Parent dashboard | ✅ Replaces Phase 0 stub — same shape |
| Bulletins listing | ✅ Polished cards, annual hero + period list |
| PDF generation | ✅ jsPDF + autoTable, A4, mirrors on-screen layout |
| PDF download from PP | ✅ "Télécharger PDF" in the modal works |
| PDF download from élève / parent | ✅ Same modal, same button |
| "PDF en lot" (PP zips entire class) | ⏭ Phase 4e.1 (needs `jszip` dep) |
| Multi-child parent support | ⏭ Phase 4e.1 (small follow-up) |

## The architecture

Three-layer separation that's been paying off all phase:

1. **`lib/bulletinView.ts`** — pure assembler. Raw docs in, view shape out.
2. **`hooks/useBulletinView.ts`** — TanStack hook that fetches + assembles.
3. **`routes/_shared/bulletins/BulletinView.tsx`** — React component that renders the view.

This patch adds the **fourth** layer:

4. **`lib/pdf/bulletinPdf.ts`** — generates a PDF Blob from the same view shape.

Same data → same display → same PDF. Change a bulletin field once, all four surfaces update.

## The PDF

A4 portrait, generated entirely in the browser via jsPDF + jspdf-autotable. No server roundtrip. Layout matches the on-screen BulletinView faithfully:

- **Header**: school name (uppercase navy) + ville + devise (italic gold) on the left, "RÉPUBLIQUE DU BÉNIN" + année scolaire on the right, horizontal navy rule, centered title ("BULLETIN DE NOTES — SEMESTRE 1" or "BULLETIN ANNUEL")
- **Identity**: 4-column plain table, label/value pairs (Nom et prénoms, Classe, Date de naissance, Sexe)
- **Period body**: matières table with M.I. cell showing the average and raw interros below in a multi-line cell ("12.50\n(15 · 10)"), color-coded moyennes (green ≥10, red <10), conduite line with `(−Xh colle)` indicator if applicable, gold-tinted totaux footer with moyenne générale
- **Annual body**: per-period rows table, gold-tinted ANNÉE footer showing the formula notation, then a centered statut box ("ADMIS EN CLASSE SUPÉRIEURE" green or "ÉCHOUÉ" red)
- **Verdict tiles** (period only): three roundedRect tiles (Moyenne / Rang / Mention) below the table
- **Footer**: 30mm from bottom, three signature blocks (Le/La PP, Le Censeur, Les parents) with signature lines, italic "Bulletin émis le DD month YYYY" centered

Filename pattern: `Bulletin-{Name}-{Periode}.pdf` (e.g. `Bulletin-Caled-Semestre1.pdf` or `Bulletin-Julie-ADI-Annuel.pdf`).

## The élève dashboard

```
┌──────────────────────────────────────┐
│  SCHOOLCONNECT  · CEG HOUETO    [Nom]│
├──────────────────────────────────────┤
│                                      │
│  Bulletins · 3ème M1                 │
│  3 bulletins de période · 1 annuel   │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ 🏆  BULLETIN ANNUEL          │    │ ← hero card if annual exists
│  │     Admis                    │    │
│  │     14.50 / 20  · Rang 5     │    │
│  └──────────────────────────────┘    │
│                                      │
│  PÉRIODE                             │
│  ┌──────────────────────────────┐    │
│  │ 📄 Trimestre 1   12.50  · 8 │ →  │
│  ├──────────────────────────────┤    │
│  │ 📄 Trimestre 2   13.10  · 6 │ →  │
│  └──────────────────────────────┘    │
│                                      │
├─────[Bulletins]────[Plus]────────────┤
└──────────────────────────────────────┘
```

Tap any card → modal opens with the polished BulletinView → "Télécharger PDF" downloads.

The annual bulletin is positioned FIRST and styled as a hero card (gold gradient background, large Award icon, big status). It's the most important document the student/family wants to see, especially at end-of-year.

## The parent dashboard

Same shape. The header just shows "Bulletins de [child name]" so the context is unambiguous. For Phase 4e it handles ONE child per parent — the common case. Multi-child parents become Phase 4e.1.

## Apply on Termux

```bash
cd ~/RT-SC && unzip -o ~/storage/downloads/RT-SC-phase4e.zip
```

No `npm install` needed — `jspdf` and `jspdf-autotable` are already in `package.json` from the initial setup.

## What to test

Best done in this order so you can verify both consuming surfaces against the same generated bulletin:

### From the PP side (verify PDF works)

1. As PP → Bulletins → Période → click "Voir" on any élève → modal opens with the on-screen bulletin
2. Click "Télécharger PDF" → file downloads to your Downloads folder
3. Open the PDF (any PDF viewer): verify the layout matches the on-screen one closely:
   - Header with school + république + devise
   - Identity row (name, classe, DOB, sex)
   - Matières table with M.I. showing interros below
   - Conduite line with colle indicator if applicable
   - Gold totaux footer
   - Three verdict tiles
   - Three signature blocks at the bottom
4. Repeat for an annual bulletin (Bulletins → Annuelle → click an élève name)

### From the élève side

1. Sign in as an élève (passkey login)
2. Should land on the new élève dashboard with a Bulletins tab pre-selected
3. Should see a "Bulletins · [class name]" header with summary count
4. Annual bulletin shows as a gold-tinted hero card if it exists
5. Period bulletins listed below as clickable cards
6. Tap any card → modal opens → "Télécharger PDF" works
7. Tap the "Plus" tab → see the "Bientôt disponible" placeholder
8. Try the bottom nav (mobile) and the top nav (desktop) — both should switch tabs

### From the parent side

1. Sign in as a parent (passkey)
2. Should land on the parent dashboard, also Bulletins-first
3. Header shows "Bulletins de [child name]" subline above the title
4. Same card layout as élève
5. PDF download works

## What's NOT in this patch (Phase 4e.1 follow-ups)

- **PDF en lot** — PP downloads a ZIP of all class bulletins for printing. Needs `jszip` added to package.json. Coming in 4e.1.
- **Multi-child parents** — one parent linked to several élèves. Needs a child selector in the parent header. Coming in 4e.1.
- **Print stylesheet for the on-screen modal** — for now the PDF download IS the printable surface. The on-screen view isn't print-optimized.

## Status

```
Phase 4e       ✅ Élève + Parent dashboards + PDF export    ← we are here
Phase 4e.1     ⏭ PDF en lot + multi-child parent (small follow-ups)
Phase 5        ⏭ Daily ops (emploi du temps, absences, appel)
```

Major milestone — the bulletin module is now end-to-end functional. PP generates → all parties consume → families download polished PDFs.
