import { supabase } from '../supabase';
import type { Database } from '../database.types';
import {
  normalizarNif,
  type DatosCliente, type DatosProducto, type DatosVehiculo, type EntidadImport, type ExistentesImport, type FilaValidada,
} from '../../utils/csvImport';
import { mensajeErrorVehiculo } from './vehiculos';

// empresa_id lo rellena el trigger set_empresa_id() en el servidor.
type ClienteInsert = Database['public']['Tables']['clientes']['Insert'];
type VehiculoInsert = Database['public']['Tables']['vehiculos']['Insert'];
type ProductoInsert = Database['public']['Tables']['productos']['Insert'];
type MovimientoInsert = Database['public']['Tables']['movimientos_stock']['Insert'];

const TAMANO_LOTE = 200;
const TAMANO_PAGINA = 1000; // límite por petición de la API

export interface ResultadoImportacion {
  importadas: number;
  /** Filas que la base de datos rechazó (se importó el resto). */
  fallidas: { linea: number; mensaje: string }[];
  /** Cosas a revisar de filas que sí se importaron (p. ej. propietario no encontrado). */
  avisos: { linea: number; mensaje: string }[];
}

type ErrorDb = { code?: string; message: string };

/** Lee todas las filas de una tabla por páginas (la API devuelve como mucho 1000 por petición). */
async function leerTodo<T>(tabla: 'clientes' | 'vehiculos' | 'productos', columnas: string): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from(tabla)
      .select(columnas)
      .order('id')
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as unknown as T[];
    todo.push(...pagina);
    if (pagina.length < TAMANO_PAGINA) break;
  }
  return todo;
}

/** Lo que ya hay en el taller, para no duplicarlo al importar. */
export async function cargarExistentes(entidad: EntidadImport): Promise<ExistentesImport> {
  if (entidad === 'clientes') {
    const filas = await leerTodo<{ nif_nie_pasaporte: string; correo: string | null; nombre: string; apellidos: string; telefono: string | null }>(
      'clientes', 'id, nif_nie_pasaporte, correo, nombre, apellidos, telefono',
    );
    return {
      clientes: filas.map((c) => ({
        nif: c.nif_nie_pasaporte ?? '', correo: (c.correo ?? '').toLowerCase(), nombre: c.nombre, apellidos: c.apellidos ?? '', telefono: c.telefono ?? '',
      })),
    };
  }
  if (entidad === 'vehiculos') {
    const filas = await leerTodo<{ matricula: string; bastidor: string }>('vehiculos', 'id, matricula, bastidor');
    return { vehiculos: filas.map((v) => ({ matricula: v.matricula, bastidor: v.bastidor ?? '' })) };
  }
  const filas = await leerTodo<{ sku: string | null; nombre: string }>('productos', 'id, sku, nombre');
  return { productos: filas.map((p) => ({ sku: p.sku ?? '', nombre: p.nombre })) };
}

interface Item<R> { linea: number; row: R }

/**
 * Inserta por lotes. Si un lote falla (una fila viola una restricción), se reintenta fila a fila
 * para importar todo lo demás y saber exactamente cuál falló y por qué.
 */
async function insertarPorLotes<R, T>(
  items: Item<R>[],
  insertar: (rows: R[]) => PromiseLike<{ data: T[] | null; error: ErrorDb | null }>,
  traducir: (e: ErrorDb) => string,
  alProgresar: (hechas: number) => void,
): Promise<{ ok: { linea: number; creado: T }[]; fallidas: { linea: number; mensaje: string }[] }> {
  const ok: { linea: number; creado: T }[] = [];
  const fallidas: { linea: number; mensaje: string }[] = [];
  let hechas = 0;

  for (let i = 0; i < items.length; i += TAMANO_LOTE) {
    const lote = items.slice(i, i + TAMANO_LOTE);
    const { data, error } = await insertar(lote.map((it) => it.row));
    if (!error && data && data.length === lote.length) {
      lote.forEach((it, k) => ok.push({ linea: it.linea, creado: data[k] }));
    } else {
      // El lote se deshizo entero (una sola sentencia): se repite una a una.
      for (const it of lote) {
        const r = await insertar([it.row]);
        if (r.error || !r.data || r.data.length !== 1) fallidas.push({ linea: it.linea, mensaje: traducir(r.error ?? { message: 'No se pudo guardar.' }) });
        else ok.push({ linea: it.linea, creado: r.data[0] });
      }
    }
    hechas += lote.length;
    alProgresar(hechas);
  }
  return { ok, fallidas };
}

function filaCliente(d: DatosCliente): ClienteInsert {
  return {
    nombre: d.nombre, apellidos: d.apellidos, nif_nie_pasaporte: d.nif,
    correo: d.correo || null, telefono: d.telefono || null, direccion: d.direccion || null,
    ciudad: d.ciudad || null, pais: d.pais || null,
  } as ClienteInsert;
}

function filaVehiculo(d: DatosVehiculo): VehiculoInsert {
  return {
    marca: d.marca, modelo: d.modelo, anio: d.anio, color: d.color || null, combustible: d.combustible,
    matricula: d.matricula, bastidor: d.bastidor, kilometraje: d.kilometraje,
    itv_vencimiento: d.itv, seguro_vencimiento: d.seguro, impuesto_vencimiento: d.impuesto,
  } as VehiculoInsert;
}

function filaProducto(d: DatosProducto): ProductoInsert {
  return {
    nombre: d.nombre, descripcion: d.descripcion || null, sku: d.sku || null,
    precio_venta: d.precioVenta, costo: d.costo, stock_minimo: d.stockMinimo, unidad: d.unidad, activo: true,
  } as ProductoInsert;
}

const mensajeGenerico = (e: ErrorDb) => e.message;

/** Escribe en la base de datos las filas ya validadas (las que no tienen error ni son duplicadas). */
export async function importarFilas(
  entidad: EntidadImport,
  filas: FilaValidada[],
  alProgresar: (hechas: number, total: number) => void = () => undefined,
): Promise<ResultadoImportacion> {
  const total = filas.length;
  const progreso = (n: number) => alProgresar(n, total);
  const avisos: ResultadoImportacion['avisos'] = [];

  if (entidad === 'clientes') {
    const items = filas.map((f) => ({ linea: f.linea, row: filaCliente(f.datos as DatosCliente) }));
    const r = await insertarPorLotes(
      items,
      (rows) => supabase.from('clientes').insert(rows).select('id'),
      mensajeGenerico, progreso,
    );
    return { importadas: r.ok.length, fallidas: r.fallidas, avisos };
  }

  if (entidad === 'vehiculos') {
    // Propietarios: se buscan por NIF o, si no, por correo entre los clientes ya existentes.
    const necesitaPropietarios = filas.some((f) => {
      const d = f.datos as DatosVehiculo;
      return d.clienteNif !== '' || d.clienteCorreo !== '';
    });
    const porNif = new Map<string, string>(), porCorreo = new Map<string, string>();
    if (necesitaPropietarios) {
      const clientes = await leerTodo<{ id: string; nif_nie_pasaporte: string; correo: string | null }>('clientes', 'id, nif_nie_pasaporte, correo');
      for (const c of clientes) {
        if (c.nif_nie_pasaporte) porNif.set(normalizarNif(c.nif_nie_pasaporte), c.id);
        if (c.correo) porCorreo.set(c.correo.toLowerCase(), c.id);
      }
    }

    const items = filas.map((f) => ({ linea: f.linea, row: filaVehiculo(f.datos as DatosVehiculo) }));
    const r = await insertarPorLotes(
      items,
      (rows) => supabase.from('vehiculos').insert(rows).select('id'),
      mensajeErrorVehiculo, progreso,
    );

    const vinculos: { cliente_id: string; vehiculo_id: string }[] = [];
    const datosPorLinea = new Map(filas.map((f) => [f.linea, f.datos as DatosVehiculo]));
    for (const { linea, creado } of r.ok) {
      const d = datosPorLinea.get(linea)!;
      if (d.clienteNif === '' && d.clienteCorreo === '') continue;
      const cliente = (d.clienteNif !== '' ? porNif.get(normalizarNif(d.clienteNif)) : undefined)
        ?? (d.clienteCorreo !== '' ? porCorreo.get(d.clienteCorreo) : undefined);
      if (cliente) vinculos.push({ cliente_id: cliente, vehiculo_id: (creado as { id: string }).id });
      else avisos.push({ linea, mensaje: 'Vehículo importado, pero no se encontró al propietario (impórtalo antes en Clientes y asígnalo a mano).' });
    }
    for (let i = 0; i < vinculos.length; i += TAMANO_LOTE) {
      const { error } = await supabase.from('cliente_vehiculo').insert(vinculos.slice(i, i + TAMANO_LOTE));
      if (error) avisos.push({ linea: 0, mensaje: `No se pudieron asignar algunos propietarios: ${error.message}` });
    }
    return { importadas: r.ok.length, fallidas: r.fallidas, avisos };
  }

  // productos
  const items = filas.map((f) => ({ linea: f.linea, row: filaProducto(f.datos as DatosProducto) }));
  const r = await insertarPorLotes(
    items,
    (rows) => supabase.from('productos').insert(rows).select('id'),
    mensajeGenerico, progreso,
  );
  // El stock inicial entra por el libro de movimientos (el trigger actualiza stock_actual).
  const datosPorLinea = new Map(filas.map((f) => [f.linea, f.datos as DatosProducto]));
  const movimientos: MovimientoInsert[] = [];
  for (const { linea, creado } of r.ok) {
    const stock = datosPorLinea.get(linea)!.stock;
    if (stock > 0) movimientos.push({ producto_id: (creado as { id: string }).id, tipo: 'entrada', cantidad: stock, motivo: 'Alta inicial de inventario (importación)' } as MovimientoInsert);
  }
  for (let i = 0; i < movimientos.length; i += TAMANO_LOTE) {
    const { error } = await supabase.from('movimientos_stock').insert(movimientos.slice(i, i + TAMANO_LOTE));
    if (error) avisos.push({ linea: 0, mensaje: `No se pudo registrar el stock inicial de algunos artículos: ${error.message}` });
  }
  return { importadas: r.ok.length, fallidas: r.fallidas, avisos };
}
