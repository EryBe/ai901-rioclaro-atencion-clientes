import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  AudioLines,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  Headphones,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Mic,
  PackageCheck,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import type * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

type Page = "inicio" | "pedidos" | "incidencias" | "asistente" | "facturas";
type Order = {
  pedidoId: string;
  producto: string;
  estado: string;
  fechaPedido: string;
  fechaEntrega: string;
};
type Product = {
  productoId: string;
  nombre: string;
  categoria: string;
  precio: number;
};
type Message = { role: "assistant" | "user"; text: string; sources?: { title: string; url?: string }[] };
type Invoice = {
  proveedor: string | null;
  fecha: string | null;
  importe: string | null;
  numeroFactura: string | null;
  confianza: number | null;
};

const navItems: { page: Page; label: string; icon: typeof Box }[] = [
  { page: "inicio", label: "Resumen", icon: Box },
  { page: "pedidos", label: "Mis pedidos", icon: PackageCheck },
  { page: "incidencias", label: "Incidencias", icon: CircleHelp },
  { page: "asistente", label: "Asistente IA", icon: MessageCircle },
  { page: "facturas", label: "Facturas", icon: FileText },
];

const quickQuestions = ["¿Cuál es su política de devoluciones?", "¿Qué productos manejan?", "¿Cómo funciona la garantía?"];

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la solicitud.");
  return body as T;
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(date);
}

function App() {
  const [page, setPage] = useState<Page>("inicio");
  const [products, setProducts] = useState<Product[]>([]);
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [orderError, setOrderError] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [incidentType, setIncidentType] = useState("Entrega retrasada");
  const [priority, setPriority] = useState("Media");
  const [description, setDescription] = useState("");
  const [incidentResult, setIncidentResult] = useState("");
  const [incidentError, setIncidentError] = useState("");
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hola, soy el asistente de Río Claro. Puedo ayudarte con pedidos, productos, políticas y servicios." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string>();
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  useEffect(() => {
    void requestJson<Product[]>("/api/products").then(setProducts).catch(() => setProducts([]));
  }, []);

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderError("");
    setOrder(null);
    setOrderLoading(true);
    try {
      const result = await requestJson<Order>(`/api/orders/${encodeURIComponent(orderId)}`);
      setOrder(result);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "No encontramos el pedido.");
    } finally {
      setOrderLoading(false);
      setOrderId("");
    }
  }

  async function submitIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIncidentError("");
    setIncidentResult("");
    setIncidentLoading(true);
    try {
      const result = await requestJson<{ folio: string }>("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: orderId, correo: email, tipo: incidentType, prioridad: priority, descripcion: description }),
      });
      setIncidentResult(result.folio);
      setOrderId("");
      setEmail("");
      setIncidentType("Entrega retrasada");
      setPriority("Media");
      setDescription("");
    } catch (error) {
      setIncidentError(error instanceof Error ? error.message : "No se pudo registrar la solicitud.");
    } finally {
      setIncidentLoading(false);
    }
  }

  async function sendQuestion(question: string, speak = false) {
    const normalized = question.trim();
    if (!normalized || chatLoading) return;
    setChatInput("");
    setChatError("");
    setMessages((previous) => [...previous, { role: "user", text: normalized }]);
    setChatLoading(true);
    try {
      const result = await requestJson<{ answer: string; sessionId: string; sources: { title: string; url?: string }[] }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: normalized, sessionId: chatSessionId }),
      });
      setChatSessionId(result.sessionId);
      setMessages((previous) => [...previous, { role: "assistant", text: result.answer, sources: result.sources }]);
      if (speak) await speakText(result.answer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "El asistente no está disponible.";
      setChatError(message);
      setMessages((previous) => [...previous, { role: "assistant", text: "No pude consultar al agente de Río Claro. Revisa la configuración de Foundry y vuelve a intentarlo." }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function getSpeechConfig(SpeechSDK: typeof import("microsoft-cognitiveservices-speech-sdk")) {
    const credentials = await requestJson<{ token: string; region: string }>("/api/speech/token");
    const config = SpeechSDK.SpeechConfig.fromAuthorizationToken(credentials.token, credentials.region);
    config.speechRecognitionLanguage = "es-MX";
    return config;
  }

  async function startVoice() {
    setVoiceBusy(true);
    setChatError("");
    try {
      const SpeechSDK = await import("microsoft-cognitiveservices-speech-sdk");
      const speechConfig = await getSpeechConfig(SpeechSDK);
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, SpeechSDK.AudioConfig.fromDefaultMicrophoneInput());
      const result = await new Promise<SpeechSDK.SpeechRecognitionResult>((resolve, reject) => {
        recognizer.recognizeOnceAsync(resolve, reject);
      });
      recognizer.close();
      if (result.reason !== SpeechSDK.ResultReason.RecognizedSpeech || !result.text.trim()) {
        throw new Error("No se reconoció voz. Intenta hablar de nuevo o escribe tu pregunta.");
      }
      await sendQuestion(result.text, true);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "No se pudo iniciar el micrófono.");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function speakText(text: string) {
    const SpeechSDK = await import("microsoft-cognitiveservices-speech-sdk");
    const speechConfig = await getSpeechConfig(SpeechSDK);
    speechConfig.speechSynthesisLanguage = "es-MX";
    const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
    await new Promise<void>((resolve, reject) => {
      synthesizer.speakTextAsync(text, () => {
        synthesizer.close();
        resolve();
      }, (error) => {
        synthesizer.close();
        reject(error);
      });
    });
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fileInput = event.currentTarget.elements.namedItem("document") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setInvoiceError("Selecciona una factura para analizar.");
      return;
    }
    setInvoiceError("");
    setInvoice(null);
    setInvoiceLoading(true);
    const formData = new FormData();
    formData.append("document", file);
    try {
      setInvoice(await requestJson<Invoice>("/api/invoices", { method: "POST", body: formData }));
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "No se pudo leer el documento.");
    } finally {
      setInvoiceLoading(false);
      setInvoiceName("");
      if (fileInput) fileInput.value = "";
    }
  }

  const title = navItems.find((item) => item.page === page)?.label ?? "Resumen";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("inicio")} aria-label="Ir al resumen de Río Claro">
          <span className="brand-mark"><Leaf size={21} strokeWidth={2.5} /></span>
          <span className="brand-name">Río Claro<span>ATENCIÓN A CLIENTES</span></span>
        </button>
        <div className="sidebar-label">PORTAL</div>
        <nav className="side-nav" aria-label="Navegación principal">
          {navItems.map(({ page: target, label, icon: Icon }) => (
            <button key={target} className={`nav-item ${page === target ? "active" : ""}`} onClick={() => setPage(target)}>
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              {target === "asistente" && <span className="nav-spark"><Sparkles size={13} /></span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-block">
            <span className="support-icon"><Headphones size={18} /></span>
            <div><strong>¿Necesitas ayuda?</strong><span>Estamos para atenderte</span></div>
            <ArrowRight size={15} />
          </div>
          <div className="privacy-note"><ShieldCheck size={15} /><span>Atención digital protegida</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Río Claro</span><span className="crumb-divider">/</span><strong>{title}</strong></div>
          <div className="topbar-right">
            <span className="demo-badge"><span className="pulse-dot" /> PORTAL DE DEMOSTRACIÓN</span>
            <button className="user-menu" aria-label="Perfil de demostración"><span>RC</span><ChevronDown size={14} /></button>
          </div>
        </header>

        {page === "inicio" && (
          <section className="page-content home-page">
            <div className="welcome-row">
              <div><p className="eyebrow">ATENCIÓN AL CLIENTE <span>·</span> DISPONIBLE 24/7</p><h1>Hola, ¿en qué podemos ayudarte?</h1><p className="lead">Resuelve una consulta o continúa con una solicitud.</p></div>
              <div className="welcome-art" aria-hidden="true"><span className="sun-disc" /><span className="river-line river-one" /><span className="river-line river-two" /><Leaf size={32} /></div>
            </div>
            <div className="search-strip">
              <Search size={19} />
              <form onSubmit={(event) => { event.preventDefault(); setPage("pedidos"); }}>
                <label className="sr-only" htmlFor="quick-order">Busca el estado de tu pedido</label>
                <input id="quick-order" value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="Busca tu pedido por folio, por ejemplo PED-1002" />
                <button type="submit" className="button button-dark">Consultar <ArrowRight size={16} /></button>
              </form>
              <span className="search-hint">Solo necesitas el folio del pedido</span>
            </div>

            <div className="section-heading"><div><h2>Accesos rápidos</h2><span>Elige el servicio que necesitas</span></div><span className="section-aside">TU CUENTA <ArrowDownLeft size={14} /></span></div>
            <div className="quick-grid">
              <button className="quick-tile tile-order" onClick={() => setPage("pedidos")}><span className="tile-icon"><PackageCheck size={20} /></span><span><strong>Seguimiento de pedidos</strong><small>Consulta estado y fecha estimada</small></span><ArrowRight size={17} /></button>
              <button className="quick-tile tile-incident" onClick={() => setPage("incidencias")}><span className="tile-icon"><CircleHelp size={20} /></span><span><strong>Reportar una incidencia</strong><small>Entrega, producto o servicio</small></span><ArrowRight size={17} /></button>
              <button className="quick-tile tile-assistant" onClick={() => setPage("asistente")}><span className="tile-icon"><Sparkles size={20} /></span><span><strong>Preguntar al asistente</strong><small>Productos, políticas y más</small></span><ArrowRight size={17} /></button>
              <button className="quick-tile tile-invoice" onClick={() => setPage("facturas")}><span className="tile-icon"><FileText size={20} /></span><span><strong>Leer una factura</strong><small>Extrae los datos principales</small></span><ArrowRight size={17} /></button>
            </div>

            <div className="home-lower">
              <section className="recent-panel">
                <div className="panel-heading"><div><h2>Información útil</h2><span>Tu atención, en un solo lugar</span></div><button className="text-link" onClick={() => setPage("asistente")}>Consultar <ArrowRight size={14} /></button></div>
                <div className="info-row"><span className="info-icon green"><MessageCircle size={17} /></span><div><strong>Preguntas frecuentes</strong><span>Encuentra respuestas sobre devoluciones, garantías y atención.</span></div><ArrowRight size={15} /></div>
                <div className="info-row"><span className="info-icon coral"><AudioLines size={17} /></span><div><strong>Atención por voz</strong><span>Habla con el asistente o utiliza el teclado.</span></div><ArrowRight size={15} /></div>
                <div className="info-row"><span className="info-icon yellow"><ShieldCheck size={17} /></span><div><strong>Respuestas con respaldo</strong><span>El asistente consulta las fuentes de Río Claro.</span></div><ArrowRight size={15} /></div>
              </section>
            </div>
            <footer className="page-footer"><span>© Río Claro · Portal de atención a clientes</span><span>Versión de demostración</span></footer>
          </section>
        )}

        {page === "pedidos" && (
          <section className="page-content feature-page">
            <div className="feature-heading"><div><p className="eyebrow">SEGUIMIENTO</p><h1>Consulta tu pedido</h1><p className="lead">Ingresa el folio de tu pedido.</p></div><span className="feature-illustration order-illustration"><PackageCheck size={35} /></span></div>
            <form className="form-panel order-form" onSubmit={submitOrder}>
              <div className="form-grid"><label>Folio de pedido<input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="PED-1002" required /></label></div>
              <div className="form-actions"><span>La información se valida con los datos de demostración.</span><button className="button button-dark" disabled={orderLoading}>{orderLoading ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />} Consultar pedido</button></div>
            </form>
            {orderError && <div className="alert alert-error" role="alert"><X size={17} />{orderError}</div>}
            {order && <div className="order-result"><div className="result-label"><span className="result-icon"><PackageCheck size={20} /></span><div><span>PEDIDO {order.pedidoId}</span><h2>{order.producto}</h2></div><span className={`state-pill ${order.estado.toLowerCase().replaceAll(" ", "-")}`}>{order.estado}</span></div><div className="timeline"><div className="timeline-step done"><span><Check size={14} /></span><div><strong>Pedido recibido</strong><small>{dateLabel(order.fechaPedido)}</small></div></div><div className={`timeline-step ${order.estado === "Entregado" ? "done" : "current"}`}><span>{order.estado === "Entregado" ? <Check size={14} /> : <Clock3 size={14} />}</span><div><strong>{order.estado}</strong><small>Entrega estimada: {dateLabel(order.fechaEntrega)}</small></div></div><div className={`timeline-step ${order.estado === "Entregado" ? "done" : "pending"}`}><span>{order.estado === "Entregado" ? <Check size={14} /> : <Box size={14} />}</span><div><strong>Entrega</strong><small>{order.estado === "Entregado" ? "Pedido recibido" : "Fecha estimada"}</small></div></div></div></div>}
            <div className="note-band"><ShieldCheck size={17} /><span>El folio del pedido es suficiente para consultar el seguimiento de demostración.</span></div>
          </section>
        )}

        {page === "incidencias" && (
          <section className="page-content feature-page">
            <div className="feature-heading"><div><p className="eyebrow">ESTAMOS PARA AYUDARTE</p><h1>Registra una solicitud</h1><p className="lead">Cuéntanos qué ocurrió y daremos seguimiento a tu caso.</p></div><span className="feature-illustration incident-illustration"><CircleHelp size={35} /></span></div>
            <form className="form-panel" onSubmit={submitIncident}>
              <div className="form-grid"><label>Folio de pedido<input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="PED-1002" required /></label><label>Correo asociado<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@empresa.com" required /></label></div>
              <div className="form-grid"><label>Tipo de solicitud<select value={incidentType} onChange={(event) => setIncidentType(event.target.value)}><option>Entrega retrasada</option><option>Pedido incompleto</option><option>Producto dañado</option><option>Solicitud de servicio</option><option>Otro</option></select></label><label>Prioridad<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Baja</option><option>Media</option><option>Alta</option></select></label></div>
              <label>Describe la situación<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Incluye los detalles que nos ayuden a atenderte." minLength={10} maxLength={1000} rows={4} required /></label>
              <div className="form-actions"><span>El folio de seguimiento se generará al enviar.</span><button className="button button-dark" disabled={incidentLoading}>{incidentLoading ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Registrar solicitud</button></div>
            </form>
            {incidentError && <div className="alert alert-error" role="alert"><X size={17} />{incidentError}</div>}
            {incidentResult && <div className="alert alert-success" role="status"><Check size={18} /><span>Solicitud registrada. Tu folio es <strong>{incidentResult}</strong>.</span></div>}
            <div className="note-band"><ShieldCheck size={17} /><span>Esta versión de demostración guarda las solicitudes en almacenamiento local o Azure Table Storage si está configurado.</span></div>
          </section>
        )}

        {page === "asistente" && (
          <section className="page-content assistant-page">
            <div className="feature-heading"><div><p className="eyebrow">ASISTENTE VIRTUAL <span>·</span> RÍO CLARO</p><h1>¿Qué te gustaría saber?</h1><p className="lead">Consulta productos, políticas y procesos de atención.</p></div><span className="feature-illustration assistant-illustration"><Sparkles size={34} /></span></div>
            <div className="assistant-layout">
              <div className="chat-panel">
                <div className="chat-header"><span className="assistant-avatar"><Sparkles size={17} /></span><div><strong>Asistente Río Claro</strong><span>Atención digital</span></div><span className="ai-label">IA GENERATIVA</span></div>
                <div className="chat-messages" aria-live="polite">
                  {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`message-row ${message.role}`}><span className={`message-avatar ${message.role}`}>{message.role === "assistant" ? <Leaf size={15} /> : "TÚ"}</span><div className="message-bubble"><span className="message-author">{message.role === "assistant" ? "Río Claro" : "Tú"}</span><p>{message.text}</p>{message.sources?.length ? <div className="message-sources"><span>Fuentes</span>{message.sources.map((source) => source.url ? <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span key={source.title}>{source.title}</span>)}</div> : null}</div></div>)}
                  {chatLoading && <div className="message-row assistant"><span className="message-avatar assistant"><Leaf size={15} /></span><div className="message-bubble typing"><LoaderCircle size={15} className="spin" /><span>Consultando información...</span></div></div>}
                </div>
                {messages.length < 3 && <div className="suggestions"><span>CONSULTAS FRECUENTES</span><div>{quickQuestions.map((question) => <button key={question} onClick={() => void sendQuestion(question)}>{question}<ArrowRight size={13} /></button>)}</div></div>}
                {chatError && <p className="inline-error" role="alert">{chatError}</p>}
                <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void sendQuestion(chatInput); }}><label className="sr-only" htmlFor="chat-input">Escribe tu pregunta</label><input id="chat-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Escribe tu pregunta..." maxLength={1500} /><button type="button" className="icon-button voice-button" onClick={() => void startVoice()} disabled={voiceBusy} title="Preguntar por voz" aria-label="Preguntar por voz">{voiceBusy ? <LoaderCircle className="spin" size={19} /> : <Mic size={19} />}</button><button className="send-button" disabled={chatLoading || !chatInput.trim()} aria-label="Enviar pregunta"><Send size={17} /></button></form>
                <div className="chat-privacy"><ShieldCheck size={13} /> No compartas información financiera ni datos sensibles.</div>
              </div>
              <aside className="catalog-panel"><div className="catalog-head"><div><p className="eyebrow">CATÁLOGO</p><h2>Productos destacados</h2></div><Box size={19} /></div><div className="product-list">{products.slice(0, 5).map((product) => <div className="product-item" key={product.productoId}><span className="product-swatch"><span /></span><div><strong>{product.nombre}</strong><small>{product.categoria}</small></div><b>{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(product.precio)}</b></div>)}</div><button className="catalog-ask" onClick={() => { setChatInput("¿Qué productos tienen disponibles?"); document.getElementById("chat-input")?.focus(); }}>Preguntar por el catálogo <ArrowRight size={14} /></button></aside>
            </div>
            <div className="source-note"><ShieldCheck size={15} /><span>El asistente consulta información empresarial configurada por Río Claro. Confirma con atención al cliente si necesitas una decisión oficial.</span></div>
          </section>
        )}

        {page === "facturas" && (
          <section className="page-content feature-page">
            <div className="feature-heading"><div><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h1>Procesa una factura</h1><p className="lead">Extrae los datos principales de un documento comercial.</p></div><span className="feature-illustration invoice-illustration"><FileText size={35} /></span></div>
            <form className="invoice-panel" onSubmit={submitInvoice}>
              <label className="upload-drop" htmlFor="invoice-file"><span className="upload-icon"><Upload size={22} /></span><strong>{invoiceName || "Selecciona una factura"}</strong><span>PDF, JPG, PNG o TIFF · máximo 8 MB</span><span className="button button-outline">Buscar archivo</span><input id="invoice-file" name="document" type="file" accept="application/pdf,image/jpeg,image/png,image/tiff" onChange={(event) => setInvoiceName(event.target.files?.[0]?.name ?? "")} /></label>
              <div className="form-actions"><span>El archivo se procesa en memoria y no se conserva.</span><button className="button button-dark" disabled={invoiceLoading || !invoiceName}>{invoiceLoading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Extraer información</button></div>
            </form>
            {invoiceError && <div className="alert alert-error" role="alert"><X size={17} />{invoiceError}</div>}
            {invoice && <div className="invoice-result"><div className="result-label"><span className="result-icon"><FileText size={20} /></span><div><span>RESULTADO DEL ANÁLISIS</span><h2>{invoice.numeroFactura || "Factura procesada"}</h2></div>{invoice.confianza !== null && <span className="confidence-pill">{Math.round(invoice.confianza * 100)}% confianza</span>}</div><div className="invoice-fields"><div><span>Proveedor</span><strong>{invoice.proveedor || "No identificado"}</strong></div><div><span>Fecha</span><strong>{invoice.fecha || "No identificada"}</strong></div><div><span>Importe</span><strong>{invoice.importe || "No identificado"}</strong></div><div><span>Número de factura</span><strong>{invoice.numeroFactura || "No identificado"}</strong></div></div><div className="note-band"><ShieldCheck size={16} /><span>Verifica los datos extraídos contra el documento original antes de usarlos.</span></div></div>}
            <div className="invoice-caution"><ShieldCheck size={17} /><div><strong>Procesamiento temporal</strong><span>El documento se envía a Azure AI Document Intelligence para su análisis. Evita subir información personal o confidencial en esta demo.</span></div></div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
