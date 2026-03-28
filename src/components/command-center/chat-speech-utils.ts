// Speech recognition utilities

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as Window & {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

export function joinPromptWithSpeechTranscript(basePrompt = "", transcript = "") {
  const normalizedBase = String(basePrompt || "");
  const normalizedTranscript = String(transcript || "").trim();
  if (!normalizedTranscript) {
    return normalizedBase;
  }

  if (!normalizedBase.trim()) {
    return normalizedTranscript;
  }

  return /\s$/.test(normalizedBase)
    ? `${normalizedBase}${normalizedTranscript}`
    : `${normalizedBase} ${normalizedTranscript}`;
}
