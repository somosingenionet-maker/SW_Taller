import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Boton, Chip, Ventana } from './componentes';
import { derivarMarca, normalizarHex, PRESETS_COLOR } from './colorMarca';
import { Icono } from './iconos';

/** Ventana «Color y aspecto»: el taller elige su color y ve cómo queda antes de guardarlo. Solo para administradores. */
export default function ColorYAspecto({ colorActual, onGuardar, onCerrar }: { colorActual: string; onGuardar: (hex: string) => Promise<void>; onCerrar: () => void }) {
  const inicial = normalizarHex(colorActual) ?? PRESETS_COLOR[0].hex;
  const [color, setColor] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const m = useMemo(() => derivarMarca(color), [color]);
  const esPreset = PRESETS_COLOR.some((p) => p.hex === color);
  const vista = { '--u-brand': m.boton, '--u-on-brand': m.sobreBoton, '--u-brand-ink': m.tinta } as React.CSSProperties;

  const guardar = async () => {
    setGuardando(true); setError('');
    try { await onGuardar(color); onCerrar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el color.'); }
    finally { setGuardando(false); }
  };

  return (
    <Ventana titulo="Color y aspecto" onCerrar={onCerrar}>
      <p className="u-leer" style={{ marginTop: 0 }}>Elige el color de tu taller. Se ve en botones, menú, enlaces y pasos, y también en las páginas que abren tus clientes.</p>
      <div className="u-sw" role="group" aria-label="Colores">
        {PRESETS_COLOR.map((p) => (
          <button key={p.hex} type="button" aria-pressed={color === p.hex} onClick={() => setColor(p.hex)} data-testid="color-preset">
            <span className="u-dot" style={{ background: p.hex }} />{p.nombre}
          </button>
        ))}
        <label aria-pressed={!esPreset} style={!esPreset ? { borderColor: 'var(--u-ink)' } : undefined}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="Otro color" style={{ width: 26, height: 26, border: 0, padding: 0, background: 'none' }} data-testid="color-libre" />
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
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
        {error && <span role="alert" className="u-leer" style={{ color: 'var(--u-danger)', marginRight: 'auto' }} data-testid="error-color">{error}</span>}
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="principal" onClick={() => void guardar()} disabled={guardando || color === inicial} data-testid="guardar-color">{guardando ? 'Guardando…' : 'Guardar color'}</Boton>
      </div>
    </Ventana>
  );
}
