export function isSpeechConfigured(): boolean {
  return Boolean(process.env.SPEECH_KEY?.trim() && process.env.SPEECH_REGION?.trim());
}

export async function issueSpeechToken(): Promise<{ token: string; region: string }> {
  const key = process.env.SPEECH_KEY?.trim();
  const region = process.env.SPEECH_REGION?.trim();
  if (!key || !region) {
    throw new Error("Speech no está configurado.");
  }

  const response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0" },
  });
  if (!response.ok) {
    throw new Error(`No se pudo obtener el token de Speech (${response.status}).`);
  }

  return { token: await response.text(), region };
}
