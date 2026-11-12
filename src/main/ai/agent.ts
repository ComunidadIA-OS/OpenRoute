// Agente Planificador: conversa con el modelo elegido y actúa con herramientas.
// El modelo entiende lo que pides; las rutas, horas y cifras salen siempre del
// motor (core/solver.ts). Aprobar el plan es cosa de la persona, no del agente.

import { stepCountIs, streamText, tool, type ModelMessage } from 'ai'
import { z } from 'zod'
import { googleMapsLegs } from '../../core/maps-links'
import { formatDuration, isTime, toHHMM } from '../../core/time'
import type { Order, Priority, Vehicle } from '../../core/types'
import type { ChatEvent, ChatMessage, ChatPart } from '../../shared/types'
import { invalidatePlan, moveOrder, planSession } from '../planner'
import { runtime } from '../runtime'
import { geocode } from '../services/geocode'
import { newId, store, type Session } from '../store'
import { createModel } from './providers'

type Emit = (e: ChatEvent) => void

const PRIORITY: Record<Priority, string> = { 3: 'alta', 2: 'media', 1: 'baja' }
const km = (n: number): string => `${n.toFixed(1).replace('.', ',')} km`
const eur = (n: number): string => `${n.toFixed(2).replace('.', ',')} €`
const pct = (a: number, b: number): string => (b > 0 ? `${Math.round(((b - a) / b) * 100)} %` : '0 %')

function findOrder(session: Session, ref: string): Order | undefined {
  const q = ref.trim().toLowerCase()
  return (
    session.orders.find((o) => o.id.toLowerCase() === q) ??
    session.orders.find((o) => o.customer.toLowerCase() === q) ??
    session.orders.find((o) => o.customer.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
  )
}

function findVehicle(ref: string): Vehicle | undefined {
  const q = ref.trim().toLowerCase()
  const vs = store.state.vehicles
  const digits = q.replace(/\D/g, '')
  return (
    vs.find((v) => v.id.toLowerCase() === q) ??
    vs.find((v) => v.driver?.toLowerCase() === q) ??
    vs.find((v) => v.name.toLowerCase().includes(q) || (v.driver ?? '').toLowerCase().includes(q)) ??
    (digits ? vs.find((v) => v.id.replace(/\D/g, '').replace(/^0+/, '') === digits.replace(/^0+/, '')) : undefined)
  )
}

function planSummary(session: Session): Record<string, unknown> | null {
  const plan = session.plan
  if (!plan) return null
  const vehicles = new Map(store.state.vehicles.map((v) => [v.id, v]))
  return {
    status: plan.status === 'approved' ? 'aprobado' : 'borrador',
    rutas: plan.routes
      .filter((r) => r.stops.length > 0)
      .map((r) => ({
        vehiculo: r.vehicleId,
        nombre: vehicles.get(r.vehicleId)?.name,
        conductor: vehicles.get(r.vehicleId)?.driver,
        paradas: r.stops.length,
        distancia: km(r.distanceKm),
        jornada: `${toHHMM(r.startMin)}-${toHHMM(r.endMin)}`,
        carga: `${Math.round(r.loadKg)} de ${vehicles.get(r.vehicleId)?.capacityKg ?? '?'} kg`,
        retrasos: r.lateStops,
        sobrecarga: r.overloaded
      })),
    sin_asignar: plan.unassigned,
    total: {
      distancia: km(plan.totals.distanceKm),
      coste: eur(plan.totals.costEur),
      co2_kg: Number(plan.totals.co2Kg.toFixed(1)),
      vehiculos: plan.totals.vehiclesUsed,
      retrasos: plan.totals.lateStops
    },
    frente_al_plan_manual: plan.baseline
      ? {
          explicacion: 'Plan manual de referencia: zonas por vehículo y orden por urgencia, como con un Excel.',
          km_manual: km(plan.baseline.distanceKm),
          ahorro_km: pct(plan.totals.distanceKm, plan.baseline.distanceKm),
          ahorro_coste: pct(plan.totals.costEur, plan.baseline.costEur),
          retrasos_manual: plan.baseline.lateStops,
          sobrecargas_manual: plan.baseline.overloadedRoutes
        }
      : null,
    distancias: plan.matrixSource === 'osrm' ? 'por calles (OSRM)' : 'estimadas en línea recta (sin motor de rutas)'
  }
}

function buildTools(session: Session) {
  return {
    get_overview: tool({
      description:
        'Estado actual: depósito, flota, número de pedidos por prioridad y resumen del plan si existe. Úsala antes de responder sobre la operación.',
      inputSchema: z.object({}),
      execute: async () => {
        const byPriority = { alta: 0, media: 0, baja: 0 }
        session.orders.forEach((o) => byPriority[PRIORITY[o.priority] as keyof typeof byPriority]++)
        return {
          summary: `${session.orders.length} pedidos, ${store.state.vehicles.length} vehículos`,
          deposito: store.state.depot,
          flota: store.state.vehicles.map((v) => ({
            id: v.id,
            nombre: v.name,
            conductor: v.driver,
            capacidad_kg: v.capacityKg,
            jornada: `${v.start}-${v.end}`,
            electrico: v.electric,
            disponible: v.available
          })),
          pedidos: { total: session.orders.length, por_prioridad: byPriority },
          plan: planSummary(session)
        }
      }
    }),

    list_orders: tool({
      description: 'Lista pedidos con su franja, peso, prioridad y a qué vehículo van en el plan actual.',
      inputSchema: z.object({
        filter: z
          .enum(['all', 'unassigned', 'late', 'high_priority'])
          .optional()
          .describe('all: todos; unassigned: fuera del plan; late: con retraso; high_priority: prioridad alta'),
        vehicle: z.string().optional().describe('Id, nombre o conductor del vehículo para ver solo sus pedidos'),
        limit: z.number().int().min(1).max(200).optional()
      }),
      execute: async (input) => {
        const { filter = 'all', vehicle, limit = 60 } = input
        const where = new Map<string, { vehicleId: string; eta: string; late: boolean }>()
        session.plan?.routes.forEach((r) =>
          r.stops.forEach((s) =>
            where.set(s.orderId, { vehicleId: r.vehicleId, eta: toHHMM(s.arrival + s.waitMin), late: s.late })
          )
        )
        const v = vehicle ? findVehicle(vehicle) : undefined
        if (vehicle && !v) return { summary: `No encuentro el vehículo «${vehicle}»`, error: 'vehículo no encontrado' }
        let list = session.orders
        if (filter === 'unassigned') list = list.filter((o) => !where.has(o.id))
        if (filter === 'late') list = list.filter((o) => where.get(o.id)?.late)
        if (filter === 'high_priority') list = list.filter((o) => o.priority === 3)
        if (v) list = list.filter((o) => where.get(o.id)?.vehicleId === v.id)
        return {
          summary: `${list.length} pedidos`,
          total: list.length,
          pedidos: list.slice(0, limit).map((o) => ({
            id: o.id,
            cliente: o.customer,
            direccion: o.address,
            franja: `${o.windowStart}-${o.windowEnd}`,
            peso_kg: o.weightKg,
            prioridad: PRIORITY[o.priority],
            vehiculo: where.get(o.id)?.vehicleId ?? null,
            llegada: where.get(o.id)?.eta ?? null,
            notas: o.notes
          }))
        }
      }
    }),

    plan_routes: tool({
      description:
        'Calcula el plan de rutas óptimo con el motor de optimización (capacidades, franjas, prioridades y jornada). Úsala para crear o rehacer el plan. Tarda unos segundos.',
      inputSchema: z.object({}),
      execute: async () => {
        const plan = await planSession(session)
        const used = plan.routes.filter((r) => r.stops.length > 0).length
        return {
          summary: `${plan.routes.reduce((a, r) => a + r.stops.length, 0)} pedidos en ${used} rutas · ${km(plan.totals.distanceKm)}`,
          ...planSummary(session)
        }
      }
    }),

    move_order: tool({
      description:
        'Mueve un pedido a otro vehículo (o a otra posición de la misma ruta) en el plan actual. Recalcula horas y avisa si hay retrasos o sobrecarga.',
      inputSchema: z.object({
        order: z.string().describe('Id o nombre del cliente del pedido'),
        vehicle: z.string().describe('Id, nombre o conductor del vehículo de destino'),
        position: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Posición en la ruta, empezando en 1. Si falta, va al final.')
      }),
      execute: async (input) => {
        const { order, vehicle, position } = input
        const o = findOrder(session, order)
        const v = findVehicle(vehicle)
        if (!o) return { summary: `No encuentro el pedido «${order}»`, error: 'pedido no encontrado' }
        if (!v) return { summary: `No encuentro el vehículo «${vehicle}»`, error: 'vehículo no encontrado' }
        const { warnings } = await moveOrder(session, o.id, v.id, position ? position - 1 : undefined)
        return {
          summary: `${o.id} → ${v.id}${warnings.length ? ' · con avisos' : ''}`,
          avisos: warnings,
          plan: planSummary(session)
        }
      }
    }),

    set_vehicle: tool({
      description:
        'Cambia un vehículo de la flota: disponibilidad (avería, baja), jornada o capacidad. Después hay que recalcular el plan para aplicarlo.',
      inputSchema: z.object({
        vehicle: z.string().describe('Id, nombre o conductor'),
        available: z.boolean().optional(),
        start: z.string().optional().describe('Inicio de jornada HH:MM'),
        end: z.string().optional().describe('Fin de jornada HH:MM'),
        capacityKg: z.number().positive().optional()
      }),
      execute: async (input) => {
        const { vehicle, available, start, end, capacityKg } = input
        const v = findVehicle(vehicle)
        if (!v) return { summary: `No encuentro el vehículo «${vehicle}»`, error: 'vehículo no encontrado' }
        if (start && !isTime(start)) return { summary: 'Hora de inicio no válida', error: start }
        if (end && !isTime(end)) return { summary: 'Hora de fin no válida', error: end }
        store.mutate(() => {
          if (available !== undefined) v.available = available
          if (start) v.start = start
          if (end) v.end = end
          if (capacityKg) v.capacityKg = capacityKg
          invalidatePlan(session)
        })
        return {
          summary: `${v.id} actualizado`,
          vehiculo: v,
          nota: 'Recalcula el plan con plan_routes para aplicar el cambio.'
        }
      }
    }),

    add_order: tool({
      description: 'Añade un pedido nuevo. Busca la dirección en el mapa.',
      inputSchema: z.object({
        customer: z.string(),
        address: z.string().describe('Dirección completa con población'),
        weightKg: z.number().min(0).optional(),
        windowStart: z.string().optional().describe('HH:MM'),
        windowEnd: z.string().optional().describe('HH:MM'),
        priority: z.enum(['alta', 'media', 'baja']).optional(),
        notes: z.string().optional()
      }),
      execute: async (input) => {
        const ws = input.windowStart && isTime(input.windowStart) ? input.windowStart : '08:00'
        const we = input.windowEnd && isTime(input.windowEnd) ? input.windowEnd : '20:00'
        const hit = await geocode(input.address, store.state.settings.countryCodes, store.state.depot ?? undefined)
        const id = `P-${String(session.orders.length + 1).padStart(3, '0')}-${newId().slice(-3)}`
        const order: Order = {
          id,
          customer: input.customer,
          address: input.address,
          ...(hit ? hit : {}),
          priority: input.priority === 'alta' ? 3 : input.priority === 'baja' ? 1 : 2,
          weightKg: input.weightKg ?? 0,
          windowStart: ws,
          windowEnd: we,
          ...(input.notes ? { notes: input.notes } : {})
        }
        store.mutate(() => {
          session.orders.push(order)
          invalidatePlan(session)
          store.touch(session)
        })
        return {
          summary: `${id} añadido${hit ? '' : ' · sin ubicar'}`,
          pedido: order,
          ubicado: Boolean(hit),
          nota: 'Recalcula el plan para incluirlo.'
        }
      }
    }),

    remove_order: tool({
      description: 'Quita un pedido de la lista (por ejemplo, si el cliente lo cancela).',
      inputSchema: z.object({ order: z.string().describe('Id o nombre del cliente') }),
      execute: async (input) => {
        const { order } = input
        const o = findOrder(session, order)
        if (!o) return { summary: `No encuentro el pedido «${order}»`, error: 'pedido no encontrado' }
        store.mutate(() => {
          session.orders = session.orders.filter((x) => x.id !== o.id)
          invalidatePlan(session)
          store.touch(session)
        })
        return { summary: `${o.id} quitado`, nota: 'Recalcula el plan para aplicarlo.' }
      }
    }),

    get_route: tool({
      description:
        'Detalle de la ruta de un vehículo: paradas en orden con hora de llegada y enlaces de Google Maps para el conductor.',
      inputSchema: z.object({ vehicle: z.string().describe('Id, nombre o conductor') }),
      execute: async (input) => {
        const { vehicle } = input
        const v = findVehicle(vehicle)
        const route = v && session.plan?.routes.find((r) => r.vehicleId === v.id)
        if (!v || !route) return { summary: `No hay ruta para «${vehicle}»`, error: 'sin ruta' }
        const byId = new Map(session.orders.map((o) => [o.id, o]))
        const depot = store.state.depot!
        const stops = route.stops.map((s) => byId.get(s.orderId)!).filter((o) => o.lat !== undefined)
        return {
          summary: `${v.id}: ${route.stops.length} paradas · ${km(route.distanceKm)}`,
          vehiculo: v.id,
          conductor: v.driver,
          salida: toHHMM(route.startMin),
          regreso: toHHMM(route.endMin),
          duracion: formatDuration(route.durationMin),
          paradas: route.stops.map((s, k) => ({
            n: k + 1,
            pedido: s.orderId,
            cliente: byId.get(s.orderId)?.customer,
            direccion: byId.get(s.orderId)?.address,
            llegada: toHHMM(s.arrival + s.waitMin),
            franja: `${byId.get(s.orderId)?.windowStart}-${byId.get(s.orderId)?.windowEnd}`,
            retraso: s.late
          })),
          google_maps: googleMapsLegs(depot, stops as { lat: number; lng: number }[])
        }
      }
    })
  }
}

const TOOL_LABEL: Record<string, string> = {
  get_overview: 'Revisando la operación',
  list_orders: 'Consultando pedidos',
  plan_routes: 'Calculando rutas',
  move_order: 'Moviendo pedido',
  set_vehicle: 'Actualizando la flota',
  add_order: 'Añadiendo pedido',
  remove_order: 'Quitando pedido',
  get_route: 'Abriendo ruta'
}

function systemPrompt(session: Session): string {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  return [
    'Eres el Planificador de OpenRoute, una app de escritorio para planificar el reparto de última milla de una flota propia.',
    `Hoy es ${today}. Reparto abierto: «${session.title}».`,
    '',
    'Cómo trabajas:',
    '- Las rutas, horas, distancias y costes los calcula el motor de optimización. Nunca los inventes ni los estimes tú: usa las herramientas y cita lo que devuelven.',
    '- Antes de hablar de pedidos, flota o plan, consulta el estado con get_overview o list_orders.',
    '- Para crear o rehacer el plan, usa plan_routes. Después de cambiar flota o pedidos, recalcula si la persona quiere aplicarlo.',
    '- Si algo no se puede hacer con tus herramientas, dilo claro en lugar de improvisar.',
    '- Tú propones; la persona aprueba el plan con el botón «Aprobar plan». No digas que está aprobado si no lo está.',
    '- Para mandar una ruta a un conductor, usa get_route: devuelve enlaces de Google Maps.',
    '',
    'Estilo: responde en el idioma de la persona, tuteando y con frases cortas. Escribe con mayúsculas normales (al empezar frase y en nombres), sin palabras enteras en mayúsculas y sin emojis. Usa listas solo si ayudan. Cifras siempre con su contexto (por ejemplo, «frente al plan manual por zonas»).'
  ].join('\n')
}

function trimHistory(history: ModelMessage[], max = 40): ModelMessage[] {
  if (history.length <= max) return history
  let start = history.length - max
  while (start < history.length && history[start].role !== 'user') start++
  return history.slice(start)
}

let controller: AbortController | null = null

export function stopChat(): void {
  controller?.abort()
}

export async function sendMessage(text: string, emit: Emit): Promise<void> {
  const session = store.active()
  const ref = store.state.settings.activeModel
  const now = new Date().toISOString()
  const userMsg: ChatMessage = { id: newId('m_'), role: 'user', parts: [{ type: 'text', text }], createdAt: now }
  const reply: ChatMessage = {
    id: newId('m_'),
    role: 'assistant',
    parts: [],
    createdAt: now,
    ...(ref ? { model: ref.model } : {})
  }
  store.mutate(() => {
    session.messages.push(userMsg, reply)
    if (session.messages.length === 2) session.title = text.length > 48 ? `${text.slice(0, 46)}…` : text
    store.touch(session)
  })
  emit({ type: 'start', sessionId: session.id, message: reply })

  const finish = (error?: string): void => {
    store.mutate(() => {
      if (error) reply.error = error
      store.touch(session)
    })
    emit({ type: 'end', sessionId: session.id, messageId: reply.id, ...(error ? { error } : {}) })
  }

  if (!ref) {
    finish('Elige un modelo en Ajustes para hablar con el planificador.')
    return
  }

  runtime.chatRunning = true
  controller = new AbortController()
  const history: ModelMessage[] = [...session.history, { role: 'user', content: text }]
  try {
    const result = streamText({
      model: createModel(ref),
      system: systemPrompt(session),
      messages: trimHistory(history),
      tools: buildTools(session),
      stopWhen: stepCountIs(10),
      abortSignal: controller.signal
    })
    let textPart: Extract<ChatPart, { type: 'text' }> | null = null
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        if (!textPart) {
          textPart = { type: 'text', text: '' }
          reply.parts.push(textPart)
        }
        textPart.text += part.text
        emit({ type: 'text', sessionId: session.id, messageId: reply.id, text: part.text })
      } else if (part.type === 'tool-call') {
        textPart = null
        const p: Extract<ChatPart, { type: 'tool' }> = {
          type: 'tool',
          id: part.toolCallId,
          name: part.toolName,
          status: 'running',
          label: TOOL_LABEL[part.toolName] ?? part.toolName
        }
        reply.parts.push(p)
        emit({ type: 'tool', sessionId: session.id, messageId: reply.id, part: p })
      } else if (part.type === 'tool-result' || part.type === 'tool-error') {
        const p = reply.parts.find(
          (x): x is Extract<ChatPart, { type: 'tool' }> => x.type === 'tool' && x.id === part.toolCallId
        )
        if (p) {
          const out = part.type === 'tool-result' ? (part.output as { summary?: string; error?: string }) : null
          p.status = part.type === 'tool-error' || out?.error ? 'error' : 'done'
          p.detail =
            part.type === 'tool-error'
              ? part.error instanceof Error
                ? part.error.message
                : String(part.error)
              : out?.summary
          emit({ type: 'tool', sessionId: session.id, messageId: reply.id, part: { ...p } })
        }
      } else if (part.type === 'error') {
        throw part.error
      }
    }
    const response = await result.response
    store.mutate(() => {
      session.history = [...history, ...response.messages]
    })
    finish()
  } catch (e) {
    const aborted = controller?.signal.aborted
    finish(aborted ? undefined : friendlyError(e))
  } finally {
    runtime.chatRunning = false
    controller = null
    store.emit('change')
  }
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/401|invalid.*key|authentication|unauthorized/i.test(msg))
    return 'La clave de API no es válida. Revísala en Ajustes.'
  if (/404|not.?found|does not exist/i.test(msg))
    return `El modelo no existe o tu clave no tiene acceso. (${msg.slice(0, 160)})`
  if (/429|rate|quota|credit|billing/i.test(msg))
    return 'El proveedor ha rechazado la petición por límite de uso o saldo.'
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(msg)) return 'No hay conexión con el proveedor del modelo.'
  if (/tool/i.test(msg) && /support/i.test(msg)) return 'Este modelo no admite herramientas. Elige otro en Ajustes.'
  return msg.slice(0, 300)
}

export async function testModel(ref: { provider: Parameters<typeof createModel>[0]['provider']; model: string }) {
  const t0 = Date.now()
  try {
    const result = streamText({
      model: createModel(ref),
      messages: [{ role: 'user', content: 'Responde solo «ok».' }],
      maxOutputTokens: 512
    })
    let got = ''
    for await (const t of result.textStream) got += t
    return { ok: got.length > 0, ms: Date.now() - t0, ...(got ? {} : { error: 'Respuesta vacía' }) }
  } catch (e) {
    return { ok: false, error: friendlyError(e) }
  }
}
