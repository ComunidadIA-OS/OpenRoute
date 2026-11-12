# El motor de rutas

Código en [`src/core/solver.ts`](../src/core/solver.ts), pruebas en [`src/core/solver.test.ts`](../src/core/solver.test.ts).

## Qué problema resuelve

Rutas de vehículos con capacidades y ventanas horarias (CVRPTW), con pedidos que pueden quedar fuera:

- Cada vehículo sale del depósito y vuelve a él dentro de su jornada.
- Cada vehículo lleva como mucho su capacidad en kilos.
- Cada pedido se entrega dentro de su franja. Si se llega antes, se espera.
- Si un pedido no cabe en ninguna ruta, queda **sin asignar** con el motivo. Los de prioridad alta pesan más: el motor prefiere dejar fuera uno de prioridad baja.

Las franjas son restricciones duras: el motor nunca propone un plan con retrasos. Si mueves un pedido a mano, la app recalcula y te avisa de los retrasos o la sobrecarga que provoque, pero no te lo impide.

## Qué minimiza

El coste en euros: kilómetros por el coste por kilómetro de cada vehículo, más una pizca de tiempo para desempatar. Por eso, si tienes una furgoneta eléctrica más barata por kilómetro, el motor tiende a darle más trabajo.

## Cómo lo resuelve

1. **Construcción por inserción con arrepentimiento (regret-2).** Primero se colocan los pedidos de prioridad alta. Dentro de cada prioridad, va antes el pedido que más perdería si no se coloca ya en su mejor sitio.
2. **Búsqueda local.** 2-opt dentro de cada ruta, mover un pedido a otra posición o ruta, e intercambiar pedidos entre rutas, mientras alguno de estos cambios mejore.
3. **Destrucción y reconstrucción (LNS).** Quita entre un 10 % y un 30 % de pedidos cercanos entre sí y los vuelve a insertar. Acepta un plan si no empeora más de un pequeño margen el mejor encontrado (aceptación «récord a récord»), y ese margen se cierra vuelta a vuelta.
4. **Varios arranques.** Repite todo lo anterior 16 veces con semillas distintas y se queda con el mejor plan.

El motor cuenta en **vueltas**, no en segundos: con la misma entrada da siempre el mismo plan, en cualquier ordenador. Por defecto hace 100 vueltas por pedido (entre 1.600 y 4.000 en total), unos 2,5 segundos con 30 pedidos. Hay un tope de seguridad de 20 segundos para listas muy grandes; solo si se alcanza, el resultado depende de la velocidad del equipo.

## Distancias

La matriz de distancias y tiempos viene de [OSRM](https://project-osrm.org) (por calles). Si no hay conexión, se estima en línea recta con un factor de rodeo urbano de 1,3 y una velocidad media de 28 km/h ([`src/core/geo.ts`](../src/core/geo.ts)). La app avisa cuando usa la estimación.

## El plan manual de referencia

Para medir el ahorro no comparamos con un plan absurdo, sino con lo que haría un jefe de tráfico con un Excel ([`src/core/baseline.ts`](../src/core/baseline.ts)):

1. Parte los pedidos en tantas zonas como vehículos (k-means sobre las coordenadas).
2. Dentro de cada zona, sale primero a lo urgente y, a igual urgencia, a lo que cierra antes.

Este plan no comprueba la capacidad ni las franjas, así que puede sobrecargar una furgoneta o llegar tarde. La app lo dice cuando pasa.

## Estimaciones de CO₂

250 g/km para una furgoneta diésel y 40 g/km para una eléctrica (`CO2_G_PER_KM` en el motor). Son valores orientativos para comparar planes entre sí, no una medición.

## Con los pedidos de ejemplo

30 pedidos en Alicante y Elche, tres furgonetas y distancias por calles del servidor público de OSRM (medido el 12 de noviembre de 2026; si cambia el mapa de OSRM, pueden variar algunas décimas):

| | Plan manual por zonas | Motor de OpenRoute |
|---|---|---|
| Kilómetros | 169,0 | 169,3 |
| Coste | 37,71 € | 31,08 € |
| Furgonetas sobrecargadas | 1 | 0 |
| Retrasos | 0 | 0 |

Los kilómetros son prácticamente los mismos porque los pedidos están en dos núcleos separados (Alicante y Elche) y hay que ir a los dos de todas formas. El ahorro está en el coste, un 18 % menos, al dar más trabajo a la furgoneta eléctrica, y en que el plan se puede ejecutar: el manual mete en una furgoneta más kilos de los que admite.
