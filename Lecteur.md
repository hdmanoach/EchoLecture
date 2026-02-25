# 📚 Application Lecteur Intelligent

## Vue d'ensemble

Application React avancée pour lire des documents PDF et Word à haute voix avec analyse IA en temps réel, suivi visuel et historique de lecture.

---

## 🎯 Écran d'accueil

L'app démarre avec deux boutons de choix :
- **Lecture PDF** 📄 - Pour les fichiers PDF (avec OCR si document scanné)
- **Lecture Word** 📝 - Pour les fichiers .docx

---

## ✨ Fonctionnalités principales

### **1. Import de documents**
- **PDF** : Extraction du texte + OCR automatique si le PDF est un scan
- **Word** : Extraction du contenu `.docx` avec `mammoth` (bibliothèque)

### **2. Synthèse vocale avancée** 🔊
- Sélection de **langue** (français, anglais, etc.)
- Sélection de **voix** (masculine/féminine selon la langue)
- **Contrôles** : 
  - ▶️ Lire tout
  - ⏸️ Pause
  - 🔄 Reprendre
  - ⏹️ Arrêter

### **3. Suivi visuel en temps réel** 👁️
- Un composant `ReadingProgress` surligne le mot en cours de lecture
- Animation visuelle pendant la synthèse vocale
- Synchronisation caractère par caractère
- Mise en évidence du texte actif

### **4. Analyse intelligente avec IA** 🤖
- Détecte les problèmes orthographiques, grammaticaux, stylistiques
- Suggestions de corrections en temps réel
- Powered by **Gemini API**
- Live analysis pendant la lecture

### **5. Texte à partir du curseur** ⏭️
- Place ton curseur n'importe où dans le document
- Bouton pour lire **à partir de là**
- Détecte automatiquement la phrase courante
- Reprendre la lecture à n'importe quel point

### **6. Historique de lecture** 📖
- Sauvegarde automatique des documents lus
- Reprendre une lecture précédente
- Gestion CRUD complète :
  - Créer (auto-save)
  - Lire (charger document)
  - Mettre à jour (progression)
  - Supprimer (clear history)

### **7. Sélection et analyse personnalisée** ✨
- Sélectionne n'importe quel texte
- Clique pour analyser avec IA
- Reçois des suggestions pertinentes
- Correction automatique proposée

---

## 🏗️ Architecture technique

```
App.tsx (Page d'accueil)
  ├─ PdfReader.tsx (Lecteur PDF)
  │  ├─ Extraction PDF via pdfjs-dist
  │  ├─ OCR via Tesseract.js
  │  ├─ Synthèse vocale + IA
  │  ├─ Suivi visuel en temps réel
  │  └─ Historique de lecture
  │
  └─ WordReader.tsx (Lecteur Word)
     ├─ Extraction .docx via mammoth
     ├─ Synthèse vocale + IA
     ├─ Suivi visuel en temps réel
     └─ Historique de lecture

Composants réutilisables :
  ├─ ReadingProgress.tsx (Surligner le texte en cours de lecture)
  ├─ hooks/
  │  ├─ useSpeechSynthesis() - Gère la synthèse vocale
  │  ├─ useLiveDocumentAnalysis() - Analyse en temps réel avec IA
  │  └─ useSpeechSynthesisStore() - État global du lecteur
  │
  └─ lib/
     ├─ readingAnalysis.ts - Intégration Gemini API
     ├─ readingHistory.ts - Gestion de l'historique
     └─ pdfWorker.ts - Configuration worker PDF.js
```

---

## 📦 Technologies utilisées

| Technologie | Usage |
|---|---|
| **React 19** | Framework principal |
| **TypeScript** | Typage statique |
| **Tailwind CSS** | Styling moderne |
| **pdfjs-dist** | Extraction texte PDF |
| **Tesseract.js** | OCR (reconnaissance optique) |
| **mammoth** | Extraction texte Word (.docx) |
| **Web Speech API** | Synthèse vocale native |
| **Gemini API** | Analyse IA avancée |
| **localStorage** | Historique persistant |

---

## 🚀 Utilisation typique

### Pour un fichier PDF :
1. ✅ Ouvre l'app → Choisir **PDF**
2. ✅ Upload un fichier `.pdf`
3. ✅ L'app extrait le texte (+ OCR si nécessaire)
4. ✅ Sélectionne langue/voix
5. ✅ Clique **"▶️ Lire tout"** → texte lu à haute voix
6. ✅ Visuellement, chaque mot lu est surligné en temps réel
7. ✅ Peut faire **Pause/Reprendre** en tout temps
8. ✅ Sélectionne du texte → **Analyse IA** pour corrections
9. ✅ Document automatiquement sauvegardé dans l'historique

### Pour un fichier Word :
1. ✅ Ouvre l'app → Choisir **Word**
2. ✅ Upload un fichier `.docx`
3. ✅ L'app extrait le contenu Word
4. ✅ Sélectionne langue/voix
5. ✅ Clique **"▶️ Lire tout"** ou **"⏭️ Lire à partir du curseur"**
6. ✅ Suivi visuel mot par mot
7. ✅ Analyse IA en direct
8. ✅ Historique auto-sauvegardé

---

## 🎮 Contrôles et Interactions

### Boutons de lecture
- **▶️ Lire tout** : Démarre la lecture du document entier
- **⏭️ Lire à partir du curseur** : Commence la lecture depuis la position du curseur
- **⏸️ Pause** : Met en pause la lecture (disponible pendant la lecture)
- **🔄 Reprendre** : Reprend la lecture après une pause
- **⏹️ Arrêter** : Arrête complètement la lecture

### Configuration
- **🌐 Langue** : Choisis la langue (FR, EN, ES, etc.)
- **🎤 Voix** : Sélectionne la voix selon la langue
- **⚙️ Historique** : Reprendre documents précédents

### Analyse IA
- **Sélection de texte** → Bouton "Analyser" → Suggestions
- **Animation** de l'analyse en cours
- **Corrections** proposées avec explication

---

## 💾 Persistance des données

### Historique de lecture (localStorage)
```javascript
{
  id: "unique-id",
  type: "pdf" | "word",
  filename: "mon-document.pdf",
  timestamp: 1708857600000,
  excerpt: "premiers mots du document...",
  duration: 3600 // en secondes
}
```

Chaque document est automatiquement sauvegardé avec :
- Nom du fichier
- Type (PDF/Word)
- Date de lecture
- Durée estimée

---

## 🎨 Interface utilisateur

- **Design moderne** avec Tailwind CSS
- **Layout responsive** (mobile, tablet, desktop)
- **Animations fluides** lors de la lecture
- **Surlignage en temps réel** du texte
- **Indicateurs visuels** de l'état (lecture, pause, etc.)
- **Notifications** d'erreur claires

---

## ⚙️ Configuration requise

### Navigateur
- Support **Web Speech API** (Chrome, Firefox, Safari - complet)
- Support **File API** pour upload
- Support **localStorage** pour historique

### Clés API requises
- **Gemini API key** (pour analyse IA)
  - À configurer dans les variables d'environnement
  - Nécessaire pour les suggestions d'IA

---

## 🔒 Sécurité et Confidentialité

- Les documents sont **traités localement** dans le navigateur
- Seul le texte à analyser est envoyé à Gemini API
- L'**historique reste local** (localStorage du navigateur)
- Pas de sauvegarde serveur des documents

---

## 🐛 Dépannage

### La voix ne fonctionne pas ?
1. Vérifier le **volume du système** 🔊
2. Ouvrir la **console** (F12) pour voir les erreurs
3. Tester dans un **autre navigateur** (Chrome → Firefox)
4. S'assurer que le **navigateur supporte Web Speech API**

### L'OCR prend du temps ?
- C'est normal : Tesseract.js analyse l'image en temps réel
- Plus le PDF est long/complexe, plus c'est long
- Attendre patiemment la fin du scan

### L'IA ne répond pas ?
- Vérifier la **clé Gemini API**
- Vérifier la **connexion Internet**
- Consulter les **logs de console** (F12)

---

## 📊 Flux de données

```
Upload document
    ↓
Extraction (PDF.js / Mammoth)
    ↓
Texte normalisé
    ↓
Affichage dans le textarea
    ↓
Utilisateur clique "Lire"
    ↓
Web Speech API → Synthèse vocale
    ↓
Suivi visuel (ReadingProgress) + Mise en surbrillance
    ↓
Analyse IA (Gemini) en parallèle
    ↓
Affichage des suggestions
    ↓
Sauvegarde dans l'historique
```

---

## 🎓 Pour apprendre

Ce projet utilise :
- **Hooks React** avancés (useState, useEffect, useRef, useMemo)
- **Gestion d'état** complexe avec plusieurs sources
- **API Web natives** (Speech, File, localStorage)
- **Async/Await** et gestion d'erreurs
- **Design patterns** : hooks personnalisés, composants fonctionnels
- **Intégration API externe** (Gemini)

---

## 📝 Notes développeur

- L'app fonctionne entièrement côté client
- Les dépendances lourdes (Tesseract, pdfjs) sont chargées à la demande
- Le suivi visuel utilise une `map d'index` pour la synchronisation parfaite
- L'IA analyse en direct sur chaque caractère lu
- L'historique utilise JSON sérialisé pour la persistence

---

**Version** : 1.0  
**Date** : 24 février 2026  
**Auteur** : GitHub Copilot  

