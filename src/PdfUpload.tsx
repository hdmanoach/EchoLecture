import React, { useState } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import { configurePdfWorker } from "./pdfWorker";

configurePdfWorker();

// Ajout d'une interface pour éviter l'erreur ESLint "no-explicit-any"
interface PdfItem {
  str: string;
}

const PdfUpload: React.FC = () => {
  const [texte, setTexte] = useState<string>("");

  const lireTexte = (texteALire: string) => {
    if (!texteALire.trim()) return;

    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(texteALire);
    const voices = speechSynthesis.getVoices();
    const frenchVoice = voices.find(v => v.lang.startsWith('fr'));
    if (frenchVoice) utterance.voice = frenchVoice;

    speechSynthesis.speak(utterance);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event: ProgressEvent<FileReader>) => {
      try {
        const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
        const loadingTask = getDocument(typedarray);
        const pdf: PDFDocumentProxy = await loadingTask.promise;

        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          
          // CORRECTION : Remplacement de 'any' par l'interface PdfItem
          const pageText = content.items
            .map((item) => (item as unknown as PdfItem).str)
            .join(" ");
          fullText += pageText + "\n\n";
        }

        setTexte(fullText);
      } catch (error) {
        console.error("Erreur lors de la lecture du PDF :", error);
        alert("Impossible de lire ce fichier PDF.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h3>Lecteur de PDF Haute Voix</h3>
      <input type="file" accept=".pdf" onChange={handleFileChange} />
      <br /><br />
      <textarea
        rows={10}
        cols={60}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder="Le texte du PDF apparaîtra ici après l'importation..."
      />
      <br />
      <div style={{ marginTop: "10px" }}>
        <button onClick={() => lireTexte(texte)}>Lire à haute voix</button>
        <button onClick={() => speechSynthesis.cancel()} style={{ marginLeft: "10px" }}>
          Arrêter
        </button>
      </div>
    </div>
  );
};

export default PdfUpload;
