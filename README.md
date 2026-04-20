# RT-SC

**SchoolConnect — React rewrite.** Plateforme de gestion scolaire pour le Bénin.

Stack : Vite 5 + React 18 + TypeScript + Tailwind + TanStack Query + Zustand + Firebase v10 + Framer Motion.

---

## État actuel — Phase 0 (Fondation)

Cette version contient la fondation complète mais aucun module fonctionnel n'est encore implémenté. Vous verrez des écrans de placeholder pour chaque route. L'objectif de Phase 0 est de valider que :
- Le projet démarre sur Termux
- La structure de routage marche
- Les guards (auth + subscription) sont en place
- La connexion Firebase est configurée
- Les design tokens et Tailwind chargent correctement

Les modules (auth, classes, élèves, bulletins, etc.) seront ajoutés un par un dans les phases suivantes.

---

## Démarrage rapide sur Termux

### Prérequis (à n'installer qu'une seule fois sur le téléphone)

```bash
pkg update && pkg upgrade -y
pkg install nodejs git unzip wget -y
```

Vérifier l'installation :

```bash
node --version    # doit afficher v20+ ou v22+
npm --version
```

### Installation du projet

Le fichier `RT-SC.zip` doit déjà être dans `~/storage/downloads/` (téléchargé depuis Claude).

```bash
cd ~/storage/downloads
unzip -o RT-SC.zip
cd RT-SC
cp .env.example .env.local
npm install
```

L'installation prend environ 2 à 4 minutes sur Termux selon votre connexion.

### Démarrage du serveur de développement

```bash
npm run dev -- --host
```

Vite affichera :

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

Ouvrir Chrome **sur le même téléphone** et aller sur `http://localhost:5173`.

### Tout en un (à coller en une fois après le premier setup)

```bash
cd ~/storage/downloads && unzip -o RT-SC.zip && cd RT-SC && cp .env.example .env.local && npm install && npm run dev -- --host
```

---

## Structure du projet

```
RT-SC/
├─ index.html              # Entry HTML, charge fonts + FedaPay CDN
├─ vite.config.ts          # Code-split par vendor (react/firebase/query/etc.)
├─ tailwind.config.js      # Design tokens étendus
├─ src/
│  ├─ main.tsx             # Mount React + QueryClient + Router
│  ├─ App.tsx              # Routes + AuthProvider + SubscriptionGuard
│  ├─ firebase.ts          # Init Firebase avec cache IndexedDB persistant
│  ├─ types/               # Tous les types Firestore (Eleve, Classe, etc.)
│  ├─ lib/                 # Logique métier pure (bulletin, finance, dates, paths)
│  ├─ stores/              # Zustand : auth, toast, confirm
│  ├─ components/
│  │  └─ guards/           # AuthProvider, ProtectedRoute, SubscriptionGuard
│  ├─ routes/              # Une page par route, organisé par rôle
│  └─ styles/              # tokens.css + base.css
```

---

## Variables d'environnement

Toutes les clés Firebase sont dans `.env.example`. Lors du setup, on copie ce fichier vers `.env.local` (qui est ignoré par git). Si vous changez de projet Firebase un jour, il suffira de mettre à jour `.env.local`.

---

## Commandes utiles

| Commande | Effet |
|---|---|
| `npm run dev -- --host` | Serveur de dev avec hot reload |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Servir le build de production en local |
| `npm run typecheck` | Vérifier les types TypeScript |
| `npm run lint` | Linter ESLint |

---

## Phases du build

Voir le document `RT-SC-FEATURE-MAP.md` (fourni séparément) pour la roadmap complète.

- **Phase 0** : Fondation ✅ (ce que vous avez maintenant)
- **Phase 1** : Composants UI partagés
- **Phase 2** : Écrans d'authentification
- **Phase 3** : Admin core (Classes, Élèves, Profs, Année)
- **Phase 4** : Notes & Bulletins
- **Phase 5** : Opérations quotidiennes (emploi, absences, appel)
- **Phase 6** : Communication (annonces, annales)
- **Phase 7** : Finances (config, caisse, bilan)
- **Phase 8** : Espace élève complet
- **Phase 9** : Portail parents + inscription
- **Phase 10** : SaaS (lock, FedaPay)
- **Phase 11** : Vigilance IA + palmarès
- **Phase 12** : Modules secondaires (Dark mode, English Hub, Visio, PhET, etc.)
