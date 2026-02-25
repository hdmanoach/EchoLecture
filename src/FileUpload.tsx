import React, { useState } from "react";

const FileUpload: React.FC = () => {
  const [texte, setTexte] = useState<string>("");

  const lireTexte = (texteALire: string) => {
    if (!texteALire.trim()) return;

    // Annule la lecture en cours
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(texteALire);

    // Choisir une voix si disponible
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      utterance.voice = voices[0];
    }

    speechSynthesis.speak(utterance);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      const contenu = event.target?.result as string;
      setTexte(contenu);

      // Lecture après mise à jour du state
      setTimeout(() => lireTexte(contenu), 100);
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <input type="file" accept=".txt" onChange={handleFileChange} />
      <textarea
        rows={6}
        cols={50}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder="Le texte du fichier apparaîtra ici"
      />
      <br />
      <button onClick={() => lireTexte(texte)}>Lire à haute voix</button>
      <button onClick={() => speechSynthesis.cancel()}>Arrêter</button>
    </div>
  );
};

export default FileUpload;