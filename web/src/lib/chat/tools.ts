// JSONSchema tool definitions exposed to Ollama's chat API.
// Keep parameter sets small (3-5) - llama3.1:8b is more reliable with fewer fields.

import type { ToolDef } from "../ollama-client";

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "current_time",
      description:
        "Devuelve la fecha y hora actual en formato ISO 8601 y la fecha de hoy en formato YYYY-MM-DD. Úsala SIEMPRE antes de filtrar por 'hoy', 'mañana' o 'ayer' antes de cualquier otra herramienta de fechas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_orders",
      description:
        "Lista los pedidos filtrando por estado y/o fecha. Devuelve un resumen con los primeros 10 pedidos y el total.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["PENDING", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "FAILED", "RESCHEDULED"],
            description: "Estado del pedido. Opcional.",
          },
          date: {
            type: "string",
            description: "Fecha en formato YYYY-MM-DD. Opcional. Si no se da, todas las fechas.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order",
      description: "Obtiene el detalle de un pedido por código (ORD-...) o id.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Código del pedido, p.ej. ORD-2026-01001" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_order",
      description:
        "Modifica un pedido existente. Solo se actualizan los campos que se proporcionan. Si se cambia la dirección, se re-geocodifica.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Código del pedido a modificar" },
          street: { type: "string" },
          number: { type: "string" },
          windowStart: { type: "string", description: "ISO 8601 datetime" },
          windowEnd: { type: "string", description: "ISO 8601 datetime" },
          notes: { type: "string" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_vehicles",
      description: "Lista todas las furgonetas. Filtro availableOnly para sólo las disponibles.",
      parameters: {
        type: "object",
        properties: {
          availableOnly: { type: "boolean", description: "Si true, sólo disponibles" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_drivers",
      description: "Lista los conductores (role DRIVER) con su furgoneta asignada.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_routes",
      description:
        "Sugiere 2-3 opciones de rutas optimizadas para una fecha dada usando OSRM. Cada opción cubre un sector (Centro, Playa, Completa). Devuelve resumen: cantidad de entregas, distancia, duración. NO crea la ruta, sólo la propone.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD. Si no se da, se usa hoy." },
          maxStops: { type: "number", description: "Máximo paradas por ruta. Default 10." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_route",
      description:
        "Persiste una de las opciones de ruta propuestas (devuelta por suggest_routes), asignándola a un conductor y furgoneta. Requiere ejecutar suggest_routes primero - este tool usa los datos cacheados de la última llamada.",
      parameters: {
        type: "object",
        properties: {
          optionId: { type: "string", description: "A, B o C (de suggest_routes)" },
          driverUsername: { type: "string", description: "username del conductor, p.ej. juan" },
        },
        required: ["optionId", "driverUsername"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_routes",
      description: "Lista rutas filtrando por fecha y/o conductor.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          driverUsername: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_route",
      description: "Detalle de una ruta por código (RT-...) o id, con todas sus paradas.",
      parameters: {
        type: "object",
        properties: { code: { type: "string", description: "RT-2026-05-26-A" } },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_incident",
      description: "Registra una incidencia (avería, paquete no entregable, tráfico, etc.).",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["VEHICLE_BREAKDOWN", "UNDELIVERABLE", "TRAFFIC", "CUSTOMER_ABSENT", "OTHER"],
          },
          description: { type: "string" },
          orderCode: { type: "string", description: "Código del pedido afectado (opcional)" },
          routeCode: { type: "string", description: "Código de la ruta afectada (opcional)" },
          durationMin: { type: "number", description: "Duración del incidente en minutos" },
        },
        required: ["type", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_route",
      description:
        "Re-optimiza una ruta tras una avería. Recalcula las paradas pendientes con el retraso indicado. Las paradas que no caben en su franja horaria se difieren automáticamente a mañana. Crea también un Incident de tipo VEHICLE_BREAKDOWN.",
      parameters: {
        type: "object",
        properties: {
          routeCode: { type: "string", description: "Código de la ruta afectada" },
          delayMinutes: { type: "number", description: "Minutos que durará la avería" },
        },
        required: ["routeCode", "delayMinutes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_stop_delivered",
      description: "Marca una parada como entregada por código de pedido.",
      parameters: {
        type: "object",
        properties: { orderCode: { type: "string" } },
        required: ["orderCode"],
      },
    },
  },
];
