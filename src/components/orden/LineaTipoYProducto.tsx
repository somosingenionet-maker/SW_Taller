import type { LineaOTTipo, Producto } from '../../types';
import { fmt2 } from '../../utils/moneda';
import SearchableSelect from '../SearchableSelect';
import { EMPTY_LINEA, TIPO_META, type LineaForm } from './constantes';

/** Selector de tipo + (descripción libre o producto de catálogo), reutilizado
 * en los 4 formularios de línea (nueva/editar × crear-OT/editar-OT). Cuando
 * tipo='producto' el nombre queda fijado por el producto elegido — no se
 * edita a mano (así solo hay "un nombre": el del catálogo). */
export default function LineaTipoYProducto({
  form, setForm, productos, onSolicitarCrearProducto, bloquearTipo,
}: {
  form: LineaForm;
  setForm: (updater: (f: LineaForm) => LineaForm) => void;
  productos: Producto[];
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
        <input
          type="text"
          placeholder="Descripción *"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none"
        />
      )}
    </div>
  );
}
