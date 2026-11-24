import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { LineaOTTipo, Producto } from '../../types';
import { fmt2 } from '../../utils/moneda';
import { textoPrecioServicio, type Servicio } from '../../lib/data/servicios';
import { avisarError } from '../../lib/avisos';
import { compacto } from '../../ui/navegacion';
import { serviciosQueCoinciden } from '../../utils/servicios';
import SearchableSelect from '../SearchableSelect';
import { EMPTY_LINEA, TIPO_META, type LineaForm } from './constantes';

type SetForm = (updater: (f: LineaForm) => LineaForm) => void;

/**
 * Descripción de una línea de mano de obra: se escribe libre, pero debajo salen los servicios del catálogo que
 * coinciden; al elegir uno se ponen su texto y, si lo tiene, su precio. Si no está y se puede (administrador),
 * se guarda en el catálogo para la próxima vez.
 */
function DescripcionManoDeObra({ form, setForm, servicios, onCrearServicio }: {
  form: LineaForm; setForm: SetForm; servicios: Servicio[];
  onCrearServicio?: (texto: string, precio: number | null) => Promise<Servicio>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Hacia arriba si debajo no cabe: el campo suele estar al final de una ventana con pie fijo que la cortaría.
  const [haciaArriba, setHaciaArriba] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);
  const abrir = () => {
    const r = campoRef.current?.getBoundingClientRect();
    if (r) setHaciaArriba(window.innerHeight - r.bottom < 320 && r.top > 260);
    setAbierto(true);
  };
  const texto = form.descripcion.trim();
  const opciones = serviciosQueCoinciden(servicios, form.descripcion).slice(0, 30);
  const yaExiste = servicios.some((s) => compacto(s.reparacion) === compacto(texto) || compacto(s.nombre) === compacto(texto));
  const puedeGuardar = !!onCrearServicio && texto.length > 0 && !yaExiste;

  const elegir = (s: Servicio) => {
    setForm((f) => ({ ...f, descripcion: s.reparacion, precioUnitario: s.precio ?? f.precioUnitario }));
    setAbierto(false);
  };
  const guardar = async () => {
    if (!onCrearServicio) return;
    setGuardando(true);
    try {
      elegir(await onCrearServicio(texto, form.precioUnitario === '' ? null : Number(form.precioUnitario)));
    } catch (e) {
      avisarError(e, 'No se pudo guardar el servicio.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Descripción o servicio *"
        value={form.descripcion}
        ref={campoRef}
        onChange={(e) => { setForm((f) => ({ ...f, descripcion: e.target.value })); if (!abierto) abrir(); }}
        onFocus={abrir}
        onBlur={() => setAbierto(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false); }}
        aria-label="Descripción de la mano de obra"
        aria-autocomplete="list"
        className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none"
      />
      {abierto && (opciones.length > 0 || puedeGuardar) && (
        // onMouseDown + preventDefault: elegir antes de que el campo pierda el foco y cierre la lista.
        <ul role="listbox" aria-label="Servicios del taller" className={`absolute z-50 ${haciaArriba ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 right-0 sm:right-auto sm:min-w-[18rem] max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-lg py-1`}>
          {opciones.map((s) => (
            <li key={s.id} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); elegir(s); }}
              className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-800 truncate">{s.nombre}</span>
              <span className={`text-[11px] whitespace-nowrap ${s.precio === null ? 'text-slate-400 italic' : 'text-slate-500 font-mono'}`}>{textoPrecioServicio(s.precio)}</span>
            </li>
          ))}
          {puedeGuardar && (
            <li role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); if (!guardando) void guardar(); }}
              className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 flex items-center gap-1.5 text-blue-700 border-t border-slate-100">
              <Plus size={12} className="shrink-0" />
              <span className="text-xs font-medium truncate">{guardando ? 'Guardando…' : `Guardar «${texto}» en mis servicios`}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Selector de tipo + (descripción libre o producto de catálogo), reutilizado
 * en los 4 formularios de línea (nueva/editar × crear-OT/editar-OT). Cuando
 * tipo='producto' el nombre queda fijado por el producto elegido — no se
 * edita a mano (así solo hay "un nombre": el del catálogo). */
export default function LineaTipoYProducto({
  form, setForm, productos, onSolicitarCrearProducto, bloquearTipo, servicios = [], onCrearServicio,
}: {
  form: LineaForm;
  setForm: SetForm;
  productos: Producto[];
  /** Catálogo de servicios del taller, para la mano de obra. */
  servicios?: Servicio[];
  /** Guarda en el catálogo un servicio escrito a mano; solo se pasa si el usuario puede (administrador). */
  onCrearServicio?: (texto: string, precio: number | null) => Promise<Servicio>;
  onSolicitarCrearProducto: (nombreBuscado: string, aplicar: (p: Producto) => void) => void;
  /** true cuando la línea ya existe en la OT (tipo/producto quedan fijos, solo cantidad/precio/costo editables). */
  bloquearTipo?: boolean;
}) {
  const opciones = productos.map((p) => ({
    value: p.id,
    label: p.nombre,
    sublabel: `Stock: ${p.stockActual} ${p.unidad} · Costo: ${fmt2(p.costo)} €`,
  }));

  const aplicarProducto = (p: Producto) => {
    setForm((f) => ({ ...f, productoId: p.id, descripcion: p.nombre, precioUnitario: p.precioVenta, costoUnitario: p.costo }));
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        value={form.tipo}
        disabled={bloquearTipo}
        onChange={(e) => setForm((f) => ({ ...EMPTY_LINEA, tipo: e.target.value as LineaOTTipo, cantidad: f.cantidad }))}
        className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400"
      >
        {(Object.keys(TIPO_META) as LineaOTTipo[]).map((t) => <option key={t} value={t}>{TIPO_META[t].label}</option>)}
      </select>
      {form.tipo === 'producto' ? (
        bloquearTipo ? (
          <div className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-100 text-slate-500 truncate flex items-center" title={form.descripcion}>
            {form.descripcion || '—'}
          </div>
        ) : (
          <SearchableSelect
            options={opciones}
            value={form.productoId ?? ''}
            onChange={(val) => {
              const p = productos.find((x) => x.id === val);
              if (p) aplicarProducto(p);
            }}
            placeholder="Buscar producto..."
            emptyMessage="Sin productos — créalo escribiendo su nombre"
            onCreateNew={(termino) => onSolicitarCrearProducto(termino, aplicarProducto)}
            createLabel="Crear producto"
          />
        )
      ) : (
        <DescripcionManoDeObra form={form} setForm={setForm} servicios={servicios} onCrearServicio={onCrearServicio} />
      )}
    </div>
  );
}
