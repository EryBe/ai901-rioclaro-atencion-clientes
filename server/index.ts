import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { getOrderByFolio, getOrderForEmail, getProducts } from "./data.js";
import { createIncident, listIncidents, saveIncident } from "./incidents.js";
import { askFoundry, isFoundryConfigured } from "./services/foundry.js";
import { analyzeInvoice, isDocumentIntelligenceConfigured } from "./services/document-intelligence.js";
import { isSpeechConfigured, issueSpeechToken } from "./services/speech.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const acceptedTypes = ["application/pdf", "image/jpeg", "image/png", "image/tiff"];
    if (!acceptedTypes.includes(file.mimetype)) {
      callback(new Error("Formato no admitido."));
      return;
    }
    callback(null, true);
  },
});

app.use(express.json({ limit: "32kb" }));

const azureServiceLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Se alcanzó el límite temporal. Intenta de nuevo en un minuto." },
});

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/orders/:orderId", async (request, response, next) => {
  try {
    const order = await getOrderByFolio(request.params.orderId);
    if (!order) {
      response.status(404).json({ error: "No encontramos un pedido con esos datos." });
      return;
    }
    response.json(order);
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", async (request, response, next) => {
  try {
    const query = typeof request.query.q === "string" ? request.query.q.trim().toLocaleLowerCase("es-MX") : "";
    const products = await getProducts();
    response.json(query
      ? products.filter((product) => `${product.nombre} ${product.categoria}`.toLocaleLowerCase("es-MX").includes(query))
      : products);
  } catch (error) {
    next(error);
  }
});

const incidentRequestSchema = z.object({
  pedidoId: z.string().trim().min(1).max(32),
  correo: z.email(),
  tipo: z.enum(["Entrega retrasada", "Pedido incompleto", "Producto dañado", "Solicitud de servicio", "Otro"]),
  prioridad: z.enum(["Baja", "Media", "Alta"]),
  descripcion: z.string().trim().min(10).max(1000),
});

app.post("/api/incidents", async (request, response, next) => {
  try {
    const parsed = incidentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Revisa los campos: descripción de 10 a 1000 caracteres y datos válidos." });
      return;
    }
    const order = await getOrderForEmail(parsed.data.pedidoId, parsed.data.correo);
    if (!order) {
      response.status(404).json({ error: "No encontramos un pedido con esos datos." });
      return;
    }

    const incident = createIncident({
      pedidoId: order.pedidoId,
      tipo: parsed.data.tipo,
      prioridad: parsed.data.prioridad,
      estado: "Abierta",
      descripcion: parsed.data.descripcion,
    });
    await saveIncident(incident);
    response.status(201).json(incident);
  } catch (error) {
    next(error);
  }
});

app.get("/api/incidents/:folio", async (request, response, next) => {
  try {
    const email = z.email().safeParse(request.query.email);
    if (!email.success) {
      response.status(400).json({ error: "Escribe el correo asociado al pedido." });
      return;
    }
    const incident = (await listIncidents()).find((item) => item.folio.toLowerCase() === request.params.folio.toLowerCase());
    if (!incident || !(await getOrderForEmail(incident.pedidoId, email.data))) {
      response.status(404).json({ error: "No encontramos una incidencia con esos datos." });
      return;
    }
    response.json(incident);
  } catch (error) {
    next(error);
  }
});

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1500),
  sessionId: z.string().uuid().optional(),
});

app.post("/api/chat", azureServiceLimiter, async (request, response, next) => {
  const parsed = chatRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Escribe una pregunta de hasta 1500 caracteres." });
    return;
  }
  if (!isFoundryConfigured()) {
    response.status(503).json({ error: "El asistente no está disponible en este momento. Intenta de nuevo." });
    return;
  }
  try {
    response.json(await askFoundry(parsed.data.message, parsed.data.sessionId));
  } catch (error) {
    console.error("Falló la llamada al agente de Foundry.", error instanceof Error ? error.name : "Error desconocido");
    response.status(502).json({ error: "El asistente no está disponible en este momento. Intenta de nuevo." });
  }
});

app.post("/api/invoices", azureServiceLimiter, upload.single("document"), async (request, response, next) => {
  if (!isDocumentIntelligenceConfigured()) {
    response.status(503).json({ error: "No es posible analizar documentos en este momento." });
    return;
  }
  if (!request.file) {
    response.status(400).json({ error: "Selecciona un PDF o una imagen de factura." });
    return;
  }
  try {
    response.json(await analyzeInvoice(request.file.buffer));
  } catch (error) {
    console.error("Falló el análisis de la factura.", error instanceof Error ? error.name : "Error desconocido");
    response.status(502).json({ error: "No fue posible analizar el documento. Revisa el archivo e intenta de nuevo." });
  }
});

app.get("/api/speech/token", azureServiceLimiter, async (_request, response) => {
  if (!isSpeechConfigured()) {
    response.status(503).json({ error: "La interacción por voz no está disponible en este momento." });
    return;
  }
  try {
    response.setHeader("Cache-Control", "no-store");
    response.json(await issueSpeechToken());
  } catch (error) {
    console.error("Falló la emisión del token de Speech.", error instanceof Error ? error.name : "Error desconocido");
    response.status(502).json({ error: "No fue posible iniciar el servicio de voz." });
  }
});

if (process.env.NODE_ENV === "production") {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const clientDirectory = path.resolve(currentDirectory, "../client");
  app.use(express.static(clientDirectory));
  app.use((_request, response, next) => {
    response.sendFile(path.join(clientDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({ error: "El archivo supera el límite de 8 MB." });
    return;
  }
  if (error instanceof Error && error.message === "Formato no admitido.") {
    response.status(415).json({ error: "El archivo debe ser PDF, JPG, PNG o TIFF." });
    return;
  }
  console.error("Error de API.", error instanceof Error ? error.name : "Error desconocido");
  response.status(500).json({ error: "Ocurrió un error inesperado." });
};
app.use(errorHandler);

const onListening = () => {
  console.log(`API Río Claro escuchando en puerto ${port}`);
};

app.listen(port, "0.0.0.0", onListening);
