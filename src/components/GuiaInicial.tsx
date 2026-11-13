import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Rocket, X } from 'lucide-react';
import type { ModuloId } from '../types';
import { resumenGuia, type AccionPaso, type DatosGuia } from '../utils/guiaInicial';

interface Props {
  datos: DatosGuia;
  empresaId: string;
  /** Módulos a los que puede entrar este usuario: un paso sin acceso se muestra pero sin botón. */
  modulos: ModuloId[];
  brandColor: string;
  onAccion: (accion: AccionPaso) => void;
}

// «Ocultar» se recuerda en este navegador (es una comodidad por persona, no un dato del taller).
const clave = (empresaId: string) => `doonty-guia-oculta-${empresaId}`;
const leerOculta = (empresaId: string): boolean => { try { return localStorage.getItem(clave(empresaId)) === '1'; } catch { return false; } };
const guardarOculta = (empresaId: string) => { try { localStorage.setItem(clave(empresaId), '1'); } catch { /* sin almacenamiento */ } };

/** Primeros pasos de un taller nuevo, en Inicio. Se tacha sola y desaparece cuando está completa. */
export default function GuiaInicial({ datos, empresaId, modulos, brandColor, onAccion }: Props) {
  const [oculta, setOculta] = useState(() => leerOculta(empresaId));
  const [abierta, setAbierta] = useState(true);
  const r = resumenGuia(datos);

  if (oculta || r.completa) return null;

  const puedeIr = (a: AccionPaso) => a.tipo === 'empresa' || modulos.includes(a.modulo);
  const porcentaje = Math.round((r.hechos / r.total) * 100);

  return (
    <section aria-label="Primeros pasos" className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 overflow-hidden" data-testid="guia-inicial">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${brandColor}1a`, color: brandColor }}>
          <Rocket className="w-4 h-4" />
        </span>
        <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className="flex-1 min-w-0 text-left cursor-pointer">
          <p className="text-sm font-extrabold text-slate-800">Primeros pasos con Doonty</p>
          <p className="text-xs text-slate-500">{r.hechos} de {r.total} hechos{r.siguiente ? ` · Siguiente: ${r.siguiente.titulo.toLowerCase()}` : ''}</p>
        </button>
        <button type="button" onClick={() => setAbierta((a) => !a)} aria-label={abierta ? 'Plegar la guía' : 'Desplegar la guía'} className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
          <ChevronDown className={`w-4 h-4 transition ${abierta ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={() => { guardarOculta(empresaId); setOculta(true); }} aria-label="Ocultar la guía" title="Ocultar la guía" className="p-1.5 text-slate-300 hover:text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-1 bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.hechos} aria-label="Progreso de la guía">
        <div className="h-full transition-all" style={{ width: `${porcentaje}%`, backgroundColor: brandColor }} />
      </div>

      {abierta && (
        <ul className="divide-y divide-slate-100">
          {r.pasos.map((p) => {
            const esSiguiente = r.siguiente?.id === p.id;
            return (
              <li key={p.id} data-paso={p.id} data-hecho={p.hecho} className={`flex items-center gap-3 px-5 py-3 ${esSiguiente ? 'bg-slate-50/70' : ''}`}>
                <span
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-white"
                  style={p.hecho ? { backgroundColor: brandColor, borderColor: brandColor } : { borderColor: '#cbd5e1' }}
                  aria-hidden="true"
                >
                  {p.hecho && <Check className="w-3 h-3" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${p.hecho ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    {p.titulo}{p.opcional && !p.hecho && <span className="ml-2 text-[10px] font-bold uppercase text-slate-400 no-underline">Opcional</span>}
                  </p>
                  {!p.hecho && <p className="text-xs text-slate-500">{p.descripcion}</p>}
                </div>
                {!p.hecho && puedeIr(p.accion) && (
                  <button
                    type="button" onClick={() => onAccion(p.accion)}
                    className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${esSiguiente ? 'text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    style={esSiguiente ? { backgroundColor: brandColor } : undefined}
                  >
                    {p.etiquetaAccion} <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
