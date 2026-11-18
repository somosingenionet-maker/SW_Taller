import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { buscarGlobal, type ResultadoBusqueda } from './navegacion';
import { Chip, Placa } from './componentes';
import type { Cliente, OrdenTrabajo, Vehiculo } from '../types';

const GRUPOS: { tipo: ResultadoBusqueda['tipo']; titulo: string }[] = [
  { tipo: 'orden', titulo: 'Órdenes' }, { tipo: 'vehiculo', titulo: 'Vehículos' }, { tipo: 'cliente', titulo: 'Clientes' },
];

/** Buscador global (Ctrl K): matrícula, cliente u orden. Enter abre el primer resultado; las flechas cambian de resultado. */
export default function Buscador({ datos, permitidos, onElegir, onCerrar }: {
  datos: { clientes: Cliente[]; vehiculos: Vehiculo[]; ordenes: OrdenTrabajo[] };
  permitidos: { taller: boolean; vehiculos: boolean; clientes: boolean };
  onElegir: (r: ResultadoBusqueda) => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [sel, setSel] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscarGlobal(texto, datos, permitidos), [texto, datos, permitidos]);
  // Se muestran agrupados; la selección recorre la lista en el mismo orden en que se ven.
  const ordenados = useMemo(() => GRUPOS.flatMap((g) => resultados.filter((r) => r.tipo === g.tipo)), [resultados]);
  useEffect(() => { entrada.current?.focus(); }, []);
  useEffect(() => { setSel(0); }, [texto]);

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (ordenados.length) setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + ordenados.length) % ordenados.length);
    } else if (e.key === 'Enter' && ordenados[sel]) { e.preventDefault(); onElegir(ordenados[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); onCerrar(); }
  };

  let indice = -1;
  return (
    <div className="u-pal" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }} data-testid="buscador">
      <div className="u-pal-caja" role="dialog" aria-modal="true" aria-label="Buscar">
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--u-line)' }}>
          <Search aria-hidden="true" style={{ width: 20, height: 20, marginLeft: 16, color: 'var(--u-muted)', flex: 'none' }} />
          <input ref={entrada} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={alTeclear} placeholder="Matrícula, cliente u orden"
            aria-label="Buscar matrícula, cliente u orden" autoComplete="off" style={{ borderBottom: 0 }} />
        </div>
        <div role="listbox" aria-label="Resultados" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {texto.trim().length < 2 && <p className="u-pal-vacio">Escribe al menos 2 letras o números. Por ejemplo, la matrícula 9007 o el nombre de un cliente.</p>}
          {texto.trim().length >= 2 && ordenados.length === 0 && <p className="u-pal-vacio">No hay nada con eso. Prueba con otra parte de la matrícula o del nombre.</p>}
          {GRUPOS.map((g) => {
            const lista = resultados.filter((r) => r.tipo === g.tipo);
            if (lista.length === 0) return null;
            return (
              <div key={g.tipo}>
                <div className="u-pal-grupo">{g.titulo}</div>
                {lista.map((r) => {
                  indice += 1;
                  const mio = indice;
                  return (
                    <button key={`${r.tipo}-${r.id}`} type="button" role="option" aria-selected={sel === mio} className={`u-pal-item${sel === mio ? ' sel' : ''}`}
                      onMouseEnter={() => setSel(mio)} onClick={() => onElegir(r)} data-testid="resultado-busqueda">
                      {r.matricula ? <Placa matricula={r.matricula} /> : <Chip tono="neutro">Cliente</Chip>}
                      <span style={{ minWidth: 0 }}><b style={{ fontWeight: 600 }}>{r.titulo}</b><br /><span style={{ color: 'var(--u-muted)', fontSize: 13.5 }}>{r.detalle}</span></span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
