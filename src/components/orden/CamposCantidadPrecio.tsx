import { cantidadDesdeEntrada } from '../../utils/cantidadLinea';
import type { LineaForm } from './constantes';

/**
 * Cantidad, precio y coste de una línea, con su nombre encima (al rellenar un servicio el texto de ayuda
 * desaparece y no se sabría qué es cada número). En mano de obra la cantidad son horas con decimales y los
 * importes son por hora.
 */
export default function CamposCantidadPrecio({ form, setForm, resaltado }: {
  form: LineaForm;
  setForm: (updater: (f: LineaForm) => LineaForm) => void;
  /** Borde azul: la línea se está editando. */
  resaltado?: boolean;
}) {
  const horas = form.tipo === 'mano_de_obra';
  const campo = `w-full px-2 py-1.5 border ${resaltado ? 'border-blue-300' : 'border-slate-200'} rounded-xl text-xs font-mono focus:outline-none`;
  const etiqueta = 'block text-[10px] font-semibold text-slate-500 mb-0.5';
  const importe = (v: string): number | '' => (v === '' ? '' : Number(v));
  return (
    <div className="grid grid-cols-3 gap-2">
      <label>
        <span className={etiqueta}>{horas ? 'Horas *' : 'Cantidad *'}</span>
        <input type="number" min={horas ? 0 : 1} step={horas ? 'any' : 1} value={form.cantidad}
          onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, cantidad: cantidadDesdeEntrada(f.tipo, v) })); }}
          placeholder={horas ? '1,5' : '1'} className={campo} />
      </label>
      <label>
        <span className={etiqueta}>{horas ? 'Precio por hora € *' : 'Precio venta € *'}</span>
        <input type="number" min="0" step="0.01" value={form.precioUnitario}
          onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, precioUnitario: importe(v) })); }}
          placeholder="0,00" className={campo} />
      </label>
      <label>
        <span className={etiqueta}>{horas ? 'Coste por hora €' : 'Coste taller €'}</span>
        <input type="number" min="0" step="0.01" value={form.costoUnitario}
          onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, costoUnitario: importe(v) })); }}
          placeholder="Opcional" className={campo} />
      </label>
    </div>
  );
}
