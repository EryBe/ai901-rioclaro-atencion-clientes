import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const orderSchema = z.object({
  pedidoId: z.string(),
  clienteId: z.string(),
  producto: z.string(),
  estado: z.string(),
  fechaPedido: z.string(),
  fechaEntrega: z.string(),
});

const customerSchema = z.object({
  clienteId: z.string(),
  correo: z.email(),
});

const productSchema = z.object({
  productoId: z.string(),
  nombre: z.string(),
  categoria: z.string(),
  precio: z.number(),
});

const incidentSchema = z.object({
  folio: z.string(),
  pedidoId: z.string(),
  tipo: z.string(),
  estado: z.string(),
  prioridad: z.string(),
  descripcion: z.string().optional(),
  fechaCreacion: z.string().optional(),
});

export type Order = z.infer<typeof orderSchema>;
export type OrderTracking = Omit<Order, "clienteId">;
export type Customer = z.infer<typeof customerSchema>;
export type Product = z.infer<typeof productSchema>;
export type Incident = z.infer<typeof incidentSchema>;

async function readData<T>(filename: string, schema: z.ZodType<T>): Promise<T[]> {
  const filepath = path.resolve(process.cwd(), "Datos", filename);
  const content = await readFile(filepath, "utf8");
  const parsed = JSON.parse(content) as unknown;
  return z.array(schema).parse(parsed);
}

export const getOrders = () => readData("pedidos.json", orderSchema);
export const getCustomers = () => readData("clientes.json", customerSchema);
export const getProducts = () => readData("productos.json", productSchema);
export const getSeedIncidents = () => readData("incidencias.json", incidentSchema);

export async function getOrderByFolio(orderId: string): Promise<OrderTracking | undefined> {
  const order = (await getOrders()).find((item) => item.pedidoId.toLowerCase() === orderId.trim().toLowerCase());
  if (!order) return undefined;
  return {
    pedidoId: order.pedidoId,
    producto: order.producto,
    estado: order.estado,
    fechaPedido: order.fechaPedido,
    fechaEntrega: order.fechaEntrega,
  };
}

export async function getOrderForEmail(orderId: string, email: string): Promise<Order | undefined> {
  const [orders, customers] = await Promise.all([getOrders(), getCustomers()]);
  const order = orders.find((item) => item.pedidoId.toLowerCase() === orderId.toLowerCase());
  const customer = customers.find((item) => item.clienteId === order?.clienteId);
  return customer?.correo.toLowerCase() === email.trim().toLowerCase() ? order : undefined;
}
