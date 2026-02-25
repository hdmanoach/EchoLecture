# Lecteurs Project

Application React + TypeScript pour lire des documents PDF/Word, suivre la lecture et assister la révision avec des outils d'analyse.

## Apercu

`Lecteurs Project` propose une interface simple avec plusieurs modes de lecture :

- `Choix 1` : Lecture PDF (extraction de texte + OCR selon le document)
- `Choix 2` : Lecture Word (`.docx`) avec synthese vocale
- `Choix 3` : Studio SuperDoc (actuellement marque *Disponible bientot*)

## Fonctionnalites

- Import de fichiers PDF et Word
- Lecture vocale via l'API Web Speech
- Controles de lecture : lire, pause, reprendre, arreter
- Suivi visuel de progression pendant la lecture
- Analyse de texte locale (logique, grammaire, vocabulaire)
- Export DOCX dans le mode SuperDoc

## Stack technique

- React 19
- TypeScript
- Vite 7
- Tailwind CSS 4
- `pdfjs-dist` pour la lecture PDF
- `tesseract.js` pour OCR
- `mammoth` pour extraction Word
- `@superdoc-dev/react` pour l'edition avancee

## Prerequis

- Node.js 18+
- npm

## Installation

```bash
npm install
```

## Lancer le projet

```bash
npm run dev
```

Application disponible ensuite sur l'URL affichee par Vite (souvent `http://localhost:5173`).

## Scripts disponibles

```bash
npm run dev      # Developpement
npm run build    # Build production (TypeScript + Vite)
npm run preview  # Previsualiser la build
npm run lint     # Lint ESLint
```

## Variables d'environnement

Creer un fichier `.env` a la racine du projet :

```bash
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-2.0-flash
```

Notes importantes :

- Les variables `VITE_` sont exposees au frontend.
- Ne jamais publier une cle API sensible sans backend/proxy.

## Structure du projet

```text
src/
  App.tsx
  PdfReader.tsx
  WordReader.tsx
  SuperDocReader.tsx
  hooks/
    useSpeechSynthesis.ts
    useLiveDocumentAnalysis.ts
  lib/
    readingAnalysis.ts
    readingHistory.ts
```

## Deploiement gratuit

Options recommandees :

- Vercel (Hobby)
- Netlify (Free)
- GitHub Pages (site statique)

Build de production :

```bash
npm run build
```

Le dossier genere est `dist/`.

## Etat du projet

Projet en evolution. Le mode SuperDoc est present dans le code, mais actuellement masque/desactive dans l'interface publique pour stabilisation audio.

## Contribution

1. Fork du repo
2. Creer une branche (`feature/ma-feature`)
3. Commit clair
4. Ouvrir une Pull Request

## Licence

Licence non definie pour le moment. Ajouter un fichier `LICENSE` (ex: MIT) avant publication publique finale.
