import { describe, expect, it } from "vitest";
import { getOrderByFolio, getOrderForEmail, getProducts } from "../server/data.js";
import { createIncident } from "../server/incidents.js";

describe("datos de Río Claro", () => {
  it("consulta el seguimiento por folio y no expone el identificador del cliente", async () => {
    await expect(getOrderByFolio(" ped-1001 ")).resolves.toEqual({
      pedidoId: "PED-1001",
      producto: "Cloro Industrial 20L",
      estado: "Entregado",
      fechaPedido: "2026-09-15",
      fechaEntrega: "2026-09-18",
    });
    await expect(getOrderByFolio("PED-9999")).resolves.toBeUndefined();
  });

  it("devuelve un pedido solo al correo de su cliente", async () => {
    await expect(getOrderForEmail("PED-1001", "ana.martinez@laestrella.com")).resolves.toMatchObject({
      pedidoId: "PED-1001",
      clienteId: "CLI-001",
    });
    await expect(getOrderForEmail("PED-1001", "carlos.gomez@elcentro.com")).resolves.toBeUndefined();
  });

  it("no devuelve pedido cuando el folio no existe", async () => {
    await expect(getOrderForEmail("PED-9999", "ana.martinez@laestrella.com")).resolves.toBeUndefined();
  });

  it("lee el catálogo de productos existente", async () => {
    await expect(getProducts()).resolves.toHaveLength(5);
  });

  it("genera un folio de incidencia único y con fecha", () => {
    const incident = createIncident({
      pedidoId: "PED-1001",
      tipo: "Solicitud de servicio",
      prioridad: "Media",
      estado: "Abierta",
      descripcion: "Solicitud de prueba para validar el folio generado.",
    });

    expect(incident.folio).toMatch(/^INC-\d{4}-[A-F0-9]{6}$/);
    expect(Number.isNaN(Date.parse(incident.fechaCreacion))).toBe(false);
  });
});
