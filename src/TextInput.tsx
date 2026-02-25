import React, { useState } from "react";

const TextInput: React.FC = () => {
  const [texte, setTexte] = useState<string>("");

  const lireTexte = (texteALire: string) => {
    if (!texteALire.trim()) return;

    // Stoppe toute lecture en cours
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(texteALire);

    // Choisir une voix si disponible
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      utterance.voice = voices[0]; // Tu peux changer l’index ou filtrer par langue
    }

    speechSynthesis.speak(utterance);
  };

  return (
    <div>
      <textarea
        rows={6}
        cols={50}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder="Écris ou colle ton texte ici"
      />
      <br />
      <button onClick={() => lireTexte(texte)}>Lire à haute voix</button>
      <button onClick={() => speechSynthesis.cancel()}>Arrêter</button>
    </div>
  );
};

export default TextInput;