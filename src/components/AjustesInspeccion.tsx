import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Plus, Star, Trash2 } from 'lucide-react';
import {
  actualizarServicio, borrarServicio, crearServicio, listServicios, type Servicio,
} from '../lib/data/servicios';
import {
  actualizarPunto, anadirPunto, borrarPlantilla, borrarPuntoPlantilla, crearPlantilla, establecerDefecto, getPuntosPlantilla,
  guardarOrden, listPlantillas, renombrarPlantilla, type PlantillaPunto, type PlantillaResumen,
} from '../lib/data/plantillasInspeccion';
import { mensajeDeError } from '../lib/errores';
import { categoriasDe, moverCategoria, moverPunto, nombreValido, parsearPrecio } from '../utils/inspeccion';
import { fmt2 } from '../utils/moneda';

const campo = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';
const boton = 'px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';

/** Servicios predefinidos: el texto de la reparación y su precio, para sugerirlos al revisar una inspección. */
function Servicios({ servicios, recargar }: { servicios: Servicio[]; recargar: () => Promise<void> }) {
  const [nombre, setNombre] = useState('');
  const [reparacion, setReparacion] = useState('');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const ejecutar = async (accion: () => Promise<void>, queFallo: string) => {
    setError(''); setOcupado(true);
    try { await accion(); await recargar(); } catch (e) { setError(mensajeDeError(e, queFallo)); } finally { setOcupado(false); }
  };

  const crear = () => {
    const n = nombreValido(nombre, 80); const r = nombreValido(reparacion, 300); const p = parsearPrecio(precio);
    if (!n) return setError('Escribe el nombre del servicio (hasta 80 caracteres).');
    if (!r) return setError('Escribe el texto de la reparación (hasta 300 caracteres).');
    if (p === null || p === undefined) return setError('Escribe un precio válido, por ejemplo 64 o 64,50.');
    void ejecutar(async () => { await crearServicio({ nombre: n, reparacion: r, precio: p }); setNombre(''); setReparacion(''); setPrecio(''); }, 'No se pudo crear el servicio.');
  };

  return (
    <section className="space-y-3" data-testid="ajustes-servicios">
      <div>
        <p className="text-xs font-bold text-slate-600">Servicios predefinidos</p>
        <p className="text-[11px] text-slate-400">Al revisar una inspección, recepción los elige para poner la reparación y el precio de un toque. Precio sin IVA.</p>
      </div>

      {servicios.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
          {servicios.map((s) => (
            <li key={s.id} className={`px-3 py-2 flex items-center gap-2 text-xs ${s.activo ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-700 truncate">{s.nombre}</p>
                <p className="text-slate-400 truncate">{s.reparacion}</p>
              </div>
              <span className="font-bold text-slate-700 whitespace-nowrap">{fmt2(s.precio)} €</span>
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
        <input value={nombre} onChange={(e) => { setNombre(e.target.value); setError(''); }} placeholder="Nombre (p. ej. Cambio de pastillas)" aria-label="Nombre del servicio" maxLength={80} className={campo} />
        <input value={precio} onChange={(e) => { setPrecio(e.target.value); setError(''); }} placeholder="Precio €" aria-label="Precio del servicio" inputMode="decimal" className={`${campo} sm:w-28`} />
        <input value={reparacion} onChange={(e) => { setReparacion(e.target.value); setError(''); }} placeholder="Texto de la reparación (lo que verá el cliente)" aria-label="Texto de la reparación" maxLength={300} className={`${campo} sm:col-span-2`} />
        <button type="button" disabled={ocupado} onClick={crear} className="sm:col-span-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"><Plus size={13} /> Añadir servicio</button>
      </div>
      {error && <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
    </section>
  );
}

/** Plantillas de inspección: puntos agrupados en categorías, con un servicio sugerido opcional por punto. */
function Plantillas({ servicios }: { servicios: Servicio[] }) {
  const [plantillas, setPlantillas] = useState<PlantillaResumen[] | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [puntos, setPuntos] = useState<PlantillaPunto[]>([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nombreNueva, setNombreNueva] = useState('');
  const [nuevoPunto, setNuevoPunto] = useState<Record<string, string>>({});
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [nombreEdicion, setNombreEdicion] = useState('');

  const cargar = useCallback(async (preferida?: string | null) => {
    const lista = await listPlantillas();
    setPlantillas(lista);
    const id = (preferida && lista.some((p) => p.id === preferida) ? preferida : null) ?? lista.find((p) => p.esDefecto)?.id ?? lista[0]?.id ?? null;
    setElegida(id);
    setPuntos(id ? await getPuntosPlantilla(id) : []);
    setNombreEdicion(lista.find((p) => p.id === id)?.nombre ?? '');
  }, []);

  useEffect(() => { cargar().catch((e) => setError(mensajeDeError(e, 'No se pudieron cargar las plantillas.'))); }, [cargar]);

  const ejecutar = async (accion: () => Promise<string | void>, queFallo: string, tras?: string | null) => {
    setError(''); setOcupado(true);
    try { const r = await accion(); await cargar(typeof r === 'string' ? r : tras ?? elegida); } catch (e) { setError(mensajeDeError(e, queFallo)); await cargar(elegida).catch(() => undefined); } finally { setOcupado(false); }
  };

  const actual = plantillas?.find((p) => p.id === elegida) ?? null;
  const categorias = useMemo(() => categoriasDe(puntos), [puntos]);
  const serviciosActivos = servicios.filter((s) => s.activo);

  if (plantillas === null) return <p className="text-xs text-slate-400">Cargando plantillas…</p>;

  return (
    <section className="space-y-3" data-testid="ajustes-plantillas">
      <div>
        <p className="text-xs font-bold text-slate-600">Plantillas de inspección</p>
        <p className="text-[11px] text-slate-400">Los puntos que revisa el mecánico. Cada inspección copia la plantilla en el momento de crearla: cambiarla después no altera las ya hechas.</p>
      </div>

      {plantillas.length === 0 ? (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2">
          <p className="text-xs text-slate-600">Ahora usas la plantilla estándar (28 puntos), que no se puede editar. Crea la tuya a partir de ella para quitar, añadir o reordenar puntos.</p>
          <div className="flex gap-2 flex-wrap">
            <input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Nombre (p. ej. Revisión general)" aria-label="Nombre de la plantilla" maxLength={60} className={`${campo} flex-1 min-w-[12rem]`} />
            <button type="button" disabled={ocupado} data-testid="crear-plantilla-estandar"
              onClick={() => { const n = nombreValido(nombreNueva, 60); if (!n) return setError('Escribe un nombre para la plantilla.'); void ejecutar(() => crearPlantilla(n), 'No se pudo crear la plantilla.'); setNombreNueva(''); }}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">Crear desde la estándar</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 flex-wrap items-center">
            {plantillas.map((p) => (
              <button key={p.id} type="button" onClick={() => void cargar(p.id)} aria-pressed={p.id === elegida}
                className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer border ${p.id === elegida ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                {p.nombre}{p.esDefecto ? ' · por defecto' : ''}
              </button>
            ))}
            <span className="flex gap-1.5 items-center">
              <input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Nueva plantilla" aria-label="Nombre de la nueva plantilla" maxLength={60} className={`${campo} w-40 py-1.5 text-xs`} />
              <button type="button" disabled={ocupado} className={boton} onClick={() => { const n = nombreValido(nombreNueva, 60); if (!n) return setError('Escribe un nombre para la plantilla.'); void ejecutar(() => crearPlantilla(n, elegida ?? undefined), 'No se pudo crear la plantilla.'); setNombreNueva(''); }}>
                <Plus size={12} className="inline -mt-0.5" /> Copiar la actual
              </button>
            </span>
          </div>

          {actual && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap items-center">
                <input value={nombreEdicion} onChange={(e) => setNombreEdicion(e.target.value)} aria-label="Nombre de esta plantilla" maxLength={60} className={`${campo} flex-1 min-w-[10rem] py-1.5`}
                  onBlur={() => { const n = nombreValido(nombreEdicion, 60); if (!n) return setNombreEdicion(actual.nombre); if (n !== actual.nombre) void ejecutar(() => renombrarPlantilla(actual.id, n), 'No se pudo renombrar la plantilla.'); }} />
                {!actual.esDefecto && <button type="button" disabled={ocupado} className={boton} onClick={() => void ejecutar(() => establecerDefecto(actual.id), 'No se pudo cambiar la plantilla por defecto.')}><Star size={12} className="inline -mt-0.5" /> Usar por defecto</button>}
                <button type="button" disabled={ocupado} className={`${boton} hover:!text-rose-600`} onClick={() => void ejecutar(() => borrarPlantilla(actual.id), 'No se pudo borrar la plantilla.', null)}><Trash2 size={12} className="inline -mt-0.5" /> Borrar plantilla</button>
              </div>

              {categorias.map((cat, ci) => {
                const delaCat = puntos.filter((p) => p.categoria === cat);
                return (
                  <div key={cat} className="border border-slate-100 rounded-2xl" data-testid="categoria-plantilla">
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-t-2xl">
                      <p className="text-xs font-bold text-slate-700">{cat} <span className="font-normal text-slate-400">({delaCat.length})</span></p>
                      <span className="flex gap-1">
                        <button type="button" disabled={ocupado || ci === 0} aria-label={`Subir la categoría ${cat}`} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer" onClick={() => void ejecutar(() => guardarOrden(puntos, moverCategoria(puntos, cat, -1)), 'No se pudo reordenar.')}><ArrowUp size={13} /></button>
                        <button type="button" disabled={ocupado || ci === categorias.length - 1} aria-label={`Bajar la categoría ${cat}`} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer" onClick={() => void ejecutar(() => guardarOrden(puntos, moverCategoria(puntos, cat, 1)), 'No se pudo reordenar.')}><ArrowDown size={13} /></button>
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {delaCat.map((p, pi) => (
                        <li key={p.id} className="px-3 py-1.5 flex items-center gap-2 text-xs" data-testid="punto-plantilla">
                          <input defaultValue={p.nombre} aria-label={`Nombre del punto ${p.nombre}`} maxLength={80} className={`${campo} flex-1 min-w-0 py-1 text-xs`}
                            onBlur={(e) => { const n = nombreValido(e.target.value, 80); if (!n) { e.target.value = p.nombre; return; } if (n !== p.nombre) void ejecutar(() => actualizarPunto(p.id, { nombre: n }), 'No se pudo renombrar el punto.'); }} />
                          <select value={p.servicioId ?? ''} aria-label={`Servicio sugerido para ${p.nombre}`} disabled={ocupado} className={`${campo} py-1 text-xs max-w-[11rem]`}
                            onChange={(e) => void ejecutar(() => actualizarPunto(p.id, { servicioId: e.target.value || null }), 'No se pudo asociar el servicio.')}>
                            <option value="">Sin servicio</option>
                            {serviciosActivos.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {fmt2(s.precio)} €</option>)}
                            {p.servicioId && !serviciosActivos.some((s) => s.id === p.servicioId) && <option value={p.servicioId}>(servicio desactivado)</option>}
                          </select>
                          <button type="button" disabled={ocupado || pi === 0} aria-label={`Subir ${p.nombre}`} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer" onClick={() => void ejecutar(() => guardarOrden(puntos, moverPunto(puntos, p.id, -1)), 'No se pudo reordenar.')}><ArrowUp size={13} /></button>
                          <button type="button" disabled={ocupado || pi === delaCat.length - 1} aria-label={`Bajar ${p.nombre}`} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer" onClick={() => void ejecutar(() => guardarOrden(puntos, moverPunto(puntos, p.id, 1)), 'No se pudo reordenar.')}><ArrowDown size={13} /></button>
                          <button type="button" disabled={ocupado} aria-label={`Quitar ${p.nombre}`} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer disabled:opacity-50" onClick={() => void ejecutar(() => borrarPuntoPlantilla(p.id), 'No se pudo quitar el punto.')}><Trash2 size={13} /></button>
                        </li>
                      ))}
                    </ul>
                    <div className="px-3 py-2 flex gap-2 border-t border-slate-100">
                      <input value={nuevoPunto[cat] ?? ''} onChange={(e) => setNuevoPunto((m) => ({ ...m, [cat]: e.target.value }))} placeholder={`Añadir punto a «${cat}»`} aria-label={`Nuevo punto en ${cat}`} maxLength={80} className={`${campo} flex-1 py-1 text-xs`} />
                      <button type="button" disabled={ocupado} className={boton} onClick={() => {
                        const n = nombreValido(nuevoPunto[cat] ?? '', 80); if (!n) return setError('Escribe el nombre del punto.');
                        void ejecutar(async () => { await anadirPunto(actual.id, cat, n, puntos); setNuevoPunto((m) => ({ ...m, [cat]: '' })); }, 'No se pudo añadir el punto.');
                      }}><Check size={12} className="inline -mt-0.5" /> Añadir</button>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-2 flex-wrap bg-slate-50 border border-slate-100 rounded-2xl p-3">
                <input value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.target.value)} placeholder="Nueva categoría (p. ej. Aire acondicionado)" aria-label="Nueva categoría" maxLength={60} className={`${campo} flex-1 min-w-[12rem] py-1.5 text-xs`} />
                <button type="button" disabled={ocupado} className={boton} onClick={() => {
                  const c = nombreValido(nuevaCategoria, 60); if (!c) return setError('Escribe el nombre de la categoría.');
                  if (categorias.some((x) => x.toLowerCase() === c.toLowerCase())) return setError('Ya existe una categoría con ese nombre.');
                  void ejecutar(async () => { await anadirPunto(actual.id, c, 'Revisión general', puntos); setNuevaCategoria(''); }, 'No se pudo añadir la categoría.');
                }}><Copy size={12} className="inline -mt-0.5" /> Crear categoría con un primer punto</button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
    </section>
  );
}

export default function AjustesInspeccion() {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => { setServicios(await listServicios()); }, []);
  useEffect(() => { recargar().catch((e) => setError(mensajeDeError(e, 'No se pudieron cargar los servicios.'))); }, [recargar]);

  if (servicios === null) return error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : <p className="text-xs text-slate-400">Cargando…</p>;
  return (
    <div className="space-y-6" data-testid="ajustes-inspeccion">
      <Servicios servicios={servicios} recargar={recargar} />
      <Plantillas servicios={servicios} />
    </div>
  );
}
