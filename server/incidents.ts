import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
import { getSeedIncidents, type Incident } from "./data.js";

export type NewIncident = Incident & { fechaCreacion: string; descripcion: string };

let tablePromise: Promise<TableClient> | undefined;
const localFile = path.resolve(process.cwd(), "data", "incidents-local.json");

function getTableClient(): Promise<TableClient> {
  if (!tablePromise) {
    tablePromise = (async () => {
      const tableName = process.env.AZURE_TABLES_NAME ?? "RioClaroIncidents";
      const endpoint = process.env.AZURE_TABLES_ENDPOINT;
      if (!endpoint) {
        throw new Error("Azure Table Storage no está configurado.");
      }
      const table = new TableClient(endpoint, tableName, new DefaultAzureCredential());
      try {
        await table.createTable();
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 409) {
          throw error;
        }
      }
      return table;
    })();
  }
  return tablePromise;
}

async function readLocalIncidents(): Promise<Incident[]> {
  try {
    const content = await readFile(localFile, "utf8");
    return JSON.parse(content) as Incident[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function createIncident(input: Omit<NewIncident, "folio" | "fechaCreacion">): NewIncident {
  const year = new Date().getFullYear();
  const folio = `INC-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
  return { ...input, folio, fechaCreacion: new Date().toISOString() };
}

export async function listIncidents(): Promise<Incident[]> {
  const seedIncidents = await getSeedIncidents();
  if (process.env.AZURE_TABLES_ENDPOINT) {
    const table = await getTableClient();
    const stored: Incident[] = [];
    for await (const entity of table.listEntities({})) {
      stored.push({
        folio: String(entity.rowKey),
        pedidoId: String(entity.pedidoId),
        tipo: String(entity.tipo),
        estado: String(entity.estado),
        prioridad: String(entity.prioridad),
        descripcion: String(entity.descripcion ?? ""),
        fechaCreacion: String(entity.fechaCreacion ?? ""),
      });
    }
    return [...seedIncidents, ...stored];
  }
  return [...seedIncidents, ...(await readLocalIncidents())];
}

export async function saveIncident(incident: NewIncident): Promise<void> {
  if (process.env.AZURE_TABLES_ENDPOINT) {
    const table = await getTableClient();
    await table.createEntity({
      partitionKey: String(new Date(incident.fechaCreacion).getFullYear()),
      rowKey: incident.folio,
      pedidoId: incident.pedidoId,
      tipo: incident.tipo,
      estado: incident.estado,
      prioridad: incident.prioridad,
      descripcion: incident.descripcion,
      fechaCreacion: incident.fechaCreacion,
    });
    return;
  }

  const existing = await readLocalIncidents();
  await mkdir(path.dirname(localFile), { recursive: true });
  await writeFile(localFile, JSON.stringify([...existing, incident], null, 2), "utf8");
}
