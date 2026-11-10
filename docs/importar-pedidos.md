# Formato de importación de pedidos

Un archivo CSV (separado por comas o por punto y coma) o un Excel (`.xlsx`) con **una fila por pedido** y una fila de cabecera. Las cabeceras pueden ir en español o en inglés, con o sin tildes y en mayúsculas o minúsculas.

## Columnas

| Campo | Cabeceras que se reconocen | ¿Obligatorio? | Por defecto |
|---|---|---|---|
| Id del pedido | `id`, `id_pedido`, `pedido`, `order_id`, `codigo`, `referencia` | No | `P-001`, `P-002`… |
| Cliente | `cliente`, `nombre`, `customer`, `destinatario`, `empresa` | No | El id |
| Dirección | `direccion`, `domicilio`, `calle`, `address` | Sí, salvo que haya `lat` y `lon` | |
| Población | `ciudad`, `poblacion`, `localidad`, `municipio`, `city` | No | Se añade a la dirección |
| Código postal | `cp`, `codigo_postal`, `postal_code`, `zip` | No | Se añade a la dirección |
| Latitud | `lat`, `latitud`, `latitude` | No | Se busca la dirección |
| Longitud | `lon`, `lng`, `longitud`, `longitude` | No | Se busca la dirección |
| Prioridad | `prioridad`, `priority`, `urgencia` | No | Media |
| Peso en kg | `peso_kg`, `peso`, `kg`, `kilos`, `weight` | No | 0 |
| Desde | `franja_inicio`, `desde`, `hora_inicio`, `inicio`, `window_start` | No | 08:00 |
| Hasta | `franja_fin`, `hasta`, `hora_fin`, `fin`, `window_end` | No | 20:00 |
| Notas | `observaciones`, `notas`, `notes`, `comentarios` | No | |
| Minutos de parada | `tiempo_servicio`, `servicio_min`, `minutos_parada` | No | 8 (se cambia en Ajustes) |

## Valores

- **Prioridad**: `alta`, `media`, `baja` (o `3`, `2`, `1`; también `high`, `medium`, `low` y `urgente`).
- **Horas**: `9`, `9:00`, `09:00`, `9.30`, `13h` o una hora de Excel.
- **Pesos**: `12,5` o `12.5`.

## Ejemplo

```csv
id_pedido;cliente;direccion;poblacion;prioridad;peso_kg;desde;hasta;observaciones
PED-001;Panadería Altabix;Calle Bernabé del Campo Latorre 12;Elche;media;15,5;9:00;12:00;Antes del mediodía
PED-002;Cafetería UMH;Avenida de la Universidad s/n;Elche;alta;40;9:00;11:00;
```

El archivo completo de ejemplo está en [`resources/samples/pedidos-alicante-elche.csv`](../resources/samples/pedidos-alicante-elche.csv).

## Errores

La app te dice qué filas no ha podido importar y por qué: sin dirección ni coordenadas, coordenadas fuera de rango o una franja en la que «hasta» va antes que «desde». Los ids repetidos se renombran con un aviso. Las direcciones que no se encuentran en el mapa quedan como pedidos sin asignar al calcular.

Para buscar direcciones se usa Nominatim (OpenStreetMap), a un ritmo de una por segundo. Las direcciones ya buscadas se guardan en caché. Si tus pedidos traen coordenadas, la importación es instantánea.
