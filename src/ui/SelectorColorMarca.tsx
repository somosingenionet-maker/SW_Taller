import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { Boton, Chip } from './componentes';
import { derivarMarca, normalizarHex, PRESETS_COLOR } from './colorMarca';
import { Icono } from './iconos';

/**
 * El color del taller: se elige entre los colores de siempre o uno libre y se ve cómo queda (botones, menú, enlaces y estados) antes de
 * guardar. Es controlado: quien lo usa guarda el color junto con el resto de la configuración. Es el único sitio donde se elige.
 */
export default function SelectorColorMarca({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const actual = normalizarHex(color) ?? PRESETS_COLOR[0].hex;
  const m = useMemo(() => derivarMarca(actual), [actual]);
  const esPreset = PRESETS_COLOR.some((p) => p.hex === actual);
  const vista = { '--u-brand': m.boton, '--u-on-brand': m.sobreBoton, '--u-brand-ink': m.tinta } as React.CSSProperties;

  return (
    <div data-testid="selector-color">
      <div className="u-sw" role="group" aria-label="Colores">
        {PRESETS_COLOR.map((p) => (
          <button key={p.hex} type="button" aria-pressed={actual === p.hex} onClick={() => onChange(p.hex)} data-testid="color-preset">
            <span className="u-dot" style={{ background: p.hex }} />{p.nombre}
          </button>
        ))}
        <label aria-pressed={!esPreset} style={!esPreset ? { borderColor: 'var(--u-ink)' } : undefined}>
          <input type="color" value={actual} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label="Otro color" style={{ width: 26, height: 26, border: 0, padding: 0, background: 'none' }} data-testid="color-libre" />
          Otro color
        </label>
      </div>

      <div style={{ ...vista, marginTop: 16 }} className="u-card" data-testid="vista-color">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <Boton variante="principal"><Check /> Recibir coche</Boton>
          <Boton>Cancelar</Boton>
          <a href="#color" onClick={(e) => e.preventDefault()} style={{ color: 'var(--u-brand-ink)', fontWeight: 600 }}>Ver orden</a>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="u-nav" style={{ width: 'auto', background: 'var(--u-brand)', color: 'var(--u-on-brand)' }}><Icono id="taller" />En el taller</span>
          <Chip tono="en_reparacion">En reparación</Chip><Chip tono="listo">Listo</Chip><Chip tono="peligro">Vencida</Chip>
        </div>
      </div>
      <p className="u-leer" data-testid="lectura-color">
        Texto del botón: <b>{m.sobreBoton === '#FFFFFF' ? 'blanco' : 'oscuro'}</b> · contraste <b>{m.contrasteBoton.toFixed(1).replace('.', ',')}:1</b>.{' '}
        {m.sobreBoton !== '#FFFFFF' ? 'Es un color claro: el texto va oscuro para que se lea.' : m.corregido ? 'Hemos oscurecido un poco el tono para que el texto blanco se lea bien.' : 'Se usa tal cual.'}
        {' '}Los colores de estado (reparación, listo, vencida) no cambian: así significan lo mismo en todos los talleres.
      </p>
    </div>
  );
}
