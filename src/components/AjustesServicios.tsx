import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  actualizarServicio, borrarServicio, crearServicio, listServicios, textoPrecioServicio, type Servicio,
} from '../lib/data/servicios';
import { mensajeDeError } from '../lib/errores';
import { nombreValido, parsearPrecio } from '../utils/inspeccion';

const campo = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';
const boton = 'px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';

interface Borrador { nombre: string; reparacion: string; precio: string }
const VACIO: Borrador = { nombre: '', reparacion: '', precio: '' };
const aBorrador = (s: Servicio): Borrador => ({ nombre: s.nombre, reparacion: s.reparacion, precio: s.precio === null ? '' : String(s.precio).replace('.', ',') });

/** Comprueba el formulario; devuelve el error en una frase o los datos limpios. El precio vacío es «sin precio». */
function validar(b: Borrador): { error: string } | { nombre: string; reparacion: string; precio: number | null } {
  const nombre = nombreValido(b.nombre, 80);
  const reparacion = nombreValido(b.reparacion || b.nombre, 300);
  const precio = parsearPrecio(b.precio);
  if (!nombre) return { error: 'Escribe el nombre del servicio (hasta 80 caracteres).' };
  if (!reparacion) return { error: 'El texto de la línea puede tener hasta 300 caracteres.' };
  if (precio === undefined) return { error: 'Escribe un precio válido, por ejemplo 64 o 64,50, o déjalo vacío.' };
  return { nombre, reparacion, precio };
}

function Campos({ b, set }: { b: Borrador; set: (b: Borrador) => void }) {
  return (
    <>
      <input value={b.nombre} onChange={(e) => set({ ...b, nombre: e.target.value })} placeholder="Nombre (p. ej. Cambio de pastillas)" aria-label="Nombre del servicio" maxLength={80} className={campo} />
      <input value={b.precio} onChange={(e) => set({ ...b, precio: e.target.value })} placeholder="Precio €" aria-label="Precio del servicio" inputMode="decimal" className={`${campo} sm:w-28`} />
      <input value={b.reparacion} onChange={(e) => set({ ...b, reparacion: e.target.value })} placeholder="Texto en la orden y para el cliente (si lo dejas vacío, el nombre)" aria-label="Texto de la reparación" maxLength={300} className={`${campo} sm:col-span-2`} />
    </>
  );
}

/**
 * Catálogo de servicios del taller: se eligen al añadir mano de obra a una orden y al revisar una inspección.
 * Lo edita el administrador; los demás lo ven y lo usan.
 */
export function ListaServicios({ servicios, recargar }: { servicios: Servicio[]; recargar: () => Promise<void> }) {
  const [nuevo, setNuevo] = useState<Borrador>(VACIO);
  const [editando, setEditando] = useState<{ id: string; b: Borrador } | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const ejecutar = async (accion: () => Promise<void>, queFallo: string) => {
    setError(''); setOcupado(true);
    try { await accion(); await recargar(); } catch (e) { setError(mensajeDeError(e, queFallo)); } finally { setOcupado(false); }
  };

  const crear = () => {
    const v = validar(nuevo);
    if ('error' in v) return setError(v.error);
    void ejecutar(async () => { await crearServicio(v); setNuevo(VACIO); }, 'No se pudo crear el servicio.');
  };

  const guardar = () => {
    if (!editando) return;
    const v = validar(editando.b);
    if ('error' in v) return setError(v.error);
    void ejecutar(async () => { await actualizarServicio(editando.id, v); setEditando(null); }, 'No se pudo guardar el servicio.');
  };

  const sinPrecio = servicios.filter((s) => s.activo && s.precio === null).length;

  return (
    <section className="space-y-3" data-testid="ajustes-servicios">
      <div>
        <p className="text-xs font-bold text-slate-600">Servicios del taller</p>
        <p className="text-[11px] text-slate-400">
          Al añadir mano de obra a una orden se eligen de esta lista y se rellenan solos el texto y el precio. También los usa la inspección. Precio sin IVA; si lo dejas vacío se escribe en cada orden.
        </p>
        {sinPrecio > 0 && <p className="text-[11px] text-amber-700 mt-1">{sinPrecio === 1 ? 'Un servicio no tiene' : `${sinPrecio} servicios no tienen`} precio todavía.</p>}
      </div>

      {servicios.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
          {servicios.map((s) => editando?.id === s.id ? (
            <li key={s.id} className="p-3 bg-blue-50/40">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <Campos b={editando.b} set={(b) => { setEditando({ id: s.id, b }); setError(''); }} />
                <div className="sm:col-span-2 flex justify-end gap-2">
                  <button type="button" className={boton} onClick={() => { setEditando(null); setError(''); }}>Cancelar</button>
                  <button type="button" disabled={ocupado} onClick={guardar} className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">Guardar</button>
                </div>
              </div>
            </li>
          ) : (
            <li key={s.id} className={`px-3 py-2 flex items-center gap-2 text-xs ${s.activo ? '' : 'opacity-50'}`} data-testid="servicio">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-700 truncate">{s.nombre}</p>
                {s.reparacion !== s.nombre && <p className="text-slate-400 truncate">{s.reparacion}</p>}
              </div>
              <span className={`whitespace-nowrap ${s.precio === null ? 'text-slate-400 italic' : 'font-bold text-slate-700'}`}>{textoPrecioServicio(s.precio)}</span>
              <button type="button" disabled={ocupado} aria-label={`Editar ${s.nombre}`} className="p-1.5 text-slate-400 hover:text-blue-600 cursor-pointer disabled:opacity-50"
                onClick={() => { setEditando({ id: s.id, b: aBorrador(s) }); setError(''); }}><Pencil size={13} /></button>
              <button type="button" disabled={ocupado} className={boton} onClick={() => void ejecutar(() => actualizarServicio(s.id, { activo: !s.activo }), 'No se pudo cambiar el servicio.')}>
                {s.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button type="button" disabled={ocupado} aria-label={`Borrar ${s.nombre}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer disabled:opacity-50"
                onClick={() => void ejecutar(() => borrarServicio(s.id), 'No se pudo borrar el servicio.')}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-3">
        <Campos b={nuevo} set={(b) => { setNuevo(b); setError(''); }} />
        {error && <p role="alert" className="sm:col-span-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <button type="button" disabled={ocupado} onClick={crear} className="sm:col-span-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"><Plus size={13} /> Añadir servicio</button>
      </div>
    </section>
  );
}

/** Sección «Servicios» de la configuración: carga la lista y la muestra. */
export default function AjustesServicios() {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [error, setError] = useState('');
  const recargar = useCallback(async () => { setServicios(await listServicios()); }, []);
  useEffect(() => { recargar().catch((e) => setError(mensajeDeError(e, 'No se pudieron cargar los servicios.'))); }, [recargar]);

  if (servicios === null) return error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : <p className="text-xs text-slate-400">Cargando…</p>;
  return <ListaServicios servicios={servicios} recargar={recargar} />;
}
