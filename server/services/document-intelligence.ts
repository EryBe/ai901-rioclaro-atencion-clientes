import { AzureKeyCredential } from "@azure/core-auth";
import { DefaultAzureCredential } from "@azure/identity";
import { DocumentAnalysisClient } from "@azure/ai-form-recognizer";

export interface InvoiceSummary {
  proveedor: string | null;
  fecha: string | null;
  importe: string | null;
  numeroFactura: string | null;
  confianza: number | null;
}

export function isDocumentIntelligenceConfigured(): boolean {
  return Boolean(process.env.DOCUMENT_INTELLIGENCE_ENDPOINT?.trim());
}

export async function analyzeInvoice(bytes: Buffer): Promise<InvoiceSummary> {
  const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT?.trim();
  const key = process.env.DOCUMENT_INTELLIGENCE_KEY?.trim();
  if (!endpoint) {
    throw new Error("Document Intelligence no está configurado.");
  }

  const credential = key ? new AzureKeyCredential(key) : new DefaultAzureCredential();
  const client = new DocumentAnalysisClient(endpoint, credential);
  const poller = await client.beginAnalyzeDocument("prebuilt-invoice", bytes);
  const result = await poller.pollUntilDone();
  const fields = result.documents?.[0]?.fields ?? {};
  const value = (fieldName: string): string | null => {
    const field = fields[fieldName];
    if (!field) return null;
    const rawValue = field.content;
    return rawValue === undefined || rawValue === null ? null : String(rawValue);
  };

  const confidenceValues = ["VendorName", "InvoiceDate", "InvoiceTotal", "InvoiceId"]
    .map((name) => fields[name]?.confidence)
    .filter((confidence): confidence is number => typeof confidence === "number");

  return {
    proveedor: value("VendorName"),
    fecha: value("InvoiceDate"),
    importe: value("InvoiceTotal"),
    numeroFactura: value("InvoiceId"),
    confianza: confidenceValues.length
      ? confidenceValues.reduce((sum, confidence) => sum + confidence, 0) / confidenceValues.length
      : null,
  };
}
