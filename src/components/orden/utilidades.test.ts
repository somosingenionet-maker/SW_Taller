import { describe, it, expect } from 'vitest';
import type { LineaOT, OrdenTrabajo } from '../../types';

import { calcTotals, diasDesde, ESTADOS_SIN_AVISO_EXTRA, mailHref, progresoTareas, textoRecordatoriosPresupuesto } from './utilidades';
import { waHref } from '../../utils/whatsapp';

function linea(overrides: Partial<LineaOT> = {}): LineaOT {
  return { id: 'l1', tipo: 'mano_de_obra', descripcion: 'Tarea', cantidad: 1, precioUnitario: 10, subtotal: 10, ...overrides };
}

function ordenFixture(overrides: Partial<OrdenTrabajo> = {}): OrdenTrabajo {
  return {
    id: 'ot-1', numero: 'OT-1', vehiculoId: 'v1', clienteId: 'c1', estado: 'en_reparacion',
    fechaRecepcion: '2026-01-01', kilometrajeEntrada: 0, descripcionProblema: '',
    lineas: [], subtotal: 0, ivaPct: 21, totalIva: 0, total: 0,
    fechaActualizacion: '2026-01-01T00:00:00Z', historial: [],
    ...overrides,
  };
}

describe('waHref / mailHref', () => {
  it('waHref arma el enlace de WhatsApp limpiando el teléfono de todo lo que no sea dígito', () => {
    expect(waHref('+34 600 000 001', 'Hola')).toBe('https://wa.me/34600000001?text=Hola');
    // Un móvil español guardado sin prefijo (lo habitual) recibe el 34: sin él el chat no abre.
    expect(waHref('600 000 001', 'Hola')).toBe('https://wa.me/34600000001?text=Hola');
  });

  it('waHref devuelve null sin teléfono (evita un enlace roto)', () => {
    expect(waHref(undefined, 'Hola')).toBeNull();
    expect(waHref('', 'Hola')).toBeNull();
  });

  it('mailHref devuelve null sin correo', () => {
    expect(mailHref(undefined, 'Asunto', 'Cuerpo')).toBeNull();
  });

  it('mailHref codifica asunto y cuerpo en la query string', () => {
    const href = mailHref('a@b.com', 'Asunto con espacios', 'Cuerpo\ncon salto');
    expect(href).toBe('mailto:a@b.com?subject=Asunto%20con%20espacios&body=Cuerpo%0Acon%20salto');
  });
});

describe('calcTotals', () => {
  it('suma subtotales y calcula el IVA sobre esa suma', () => {
    const total = calcTotals([linea({ subtotal: 40 }), linea({ id: 'l2', subtotal: 60 })], 21);
    expect(total.subtotal).toBe(100);
    expect(total.totalIva).toBeCloseTo(21);
    expect(total.total).toBeCloseTo(121);
  });

  it('sin líneas, todo es cero', () => {
    expect(calcTotals([], 21)).toEqual({ subtotal: 0, totalIva: 0, total: 0 });
  });
});

describe('diasDesde', () => {
  it('marca "hoy" para una fecha de hace unos minutos, sin aviso', () => {
    const r = diasDesde(new Date().toISOString());
    expect(r.texto).toBe('hoy');
    expect(r.aviso).toBe(false);
  });

  it('avisa cuando pasan más de 5 días desde la recepción', () => {
    const hace6dias = new Date(Date.now() - 6 * 86400000).toISOString();
    const r = diasDesde(hace6dias);
    expect(r.texto).toBe('6 días');
    expect(r.aviso).toBe(true);
  });

  it('no avisa con exactamente 5 días', () => {
    const hace5dias = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(diasDesde(hace5dias).aviso).toBe(false);
  });
});

describe('progresoTareas', () => {
  it('sin líneas de mano de obra, no está "terminado" (evita el falso positivo de 0/0)', () => {
    const ot = ordenFixture({ lineas: [linea({ tipo: 'producto' })] });
    const p = progresoTareas(ot);
    expect(p.total).toBe(0);
    expect(p.terminado).toBe(false);
  });

  it('cuenta solo líneas de mano de obra, ignorando las de producto', () => {
    const ot = ordenFixture({
      lineas: [
        linea({ id: 'l1', tipo: 'mano_de_obra', completado: true }),
        linea({ id: 'l2', tipo: 'producto', completado: false }),
      ],
    });
    const p = progresoTareas(ot);
    expect(p.total).toBe(1);
    expect(p.hechas).toBe(1);
    expect(p.terminado).toBe(true);
  });

  it('terminado solo cuando TODAS las tareas de mano de obra están completadas', () => {
    const ot = ordenFixture({
      lineas: [
        linea({ id: 'l1', tipo: 'mano_de_obra', completado: true }),
        linea({ id: 'l2', tipo: 'mano_de_obra', completado: false }),
      ],
    });
    expect(progresoTareas(ot).terminado).toBe(false);
  });
});

describe('ESTADOS_SIN_AVISO_EXTRA', () => {
  it('excluye presupuesto, cancelado y entregado del aviso de línea añadida', () => {
    expect(ESTADOS_SIN_AVISO_EXTRA).toEqual(['presupuesto', 'cancelado', 'entregado']);
  });

  it('no excluye recibido, en_reparacion ni listo — ahí sí debe avisar', () => {
    expect(ESTADOS_SIN_AVISO_EXTRA).not.toContain('recibido');
    expect(ESTADOS_SIN_AVISO_EXTRA).not.toContain('en_reparacion');
    expect(ESTADOS_SIN_AVISO_EXTRA).not.toContain('listo');
  });
});

describe('textoRecordatoriosPresupuesto', () => {
  const base = { presupuestoEstado: 'enviado' as const };
  it('sin enviar, ya respondido o aceptado no se dice nada', () => {
    expect(textoRecordatoriosPresupuesto({ presupuestoEstado: 'pendiente' })).toBeNull();
    expect(textoRecordatoriosPresupuesto({ ...base, presupuestoAprobado: false })).toBeNull();
    expect(textoRecordatoriosPresupuesto({ ...base, presupuestoAprobado: true })).toBeNull();
    expect(textoRecordatoriosPresupuesto({ ...base, aceptacionPresupuesto: { nombre: 'Ana', en: '2026-11-17T10:00:00Z', total: 10 } })).toBeNull();
  });
  it('recién enviado, avisa de cuándo se le recordará', () => {
    expect(textoRecordatoriosPresupuesto(base)).toContain('a los 3 días');
    expect(textoRecordatoriosPresupuesto({ ...base, presupuestoRecordatorios: 0 })).toContain('a los 7');
  });
  it('tras el primer aviso, dice cuándo fue y que habrá uno último', () => {
    const r = textoRecordatoriosPresupuesto({ ...base, presupuestoRecordatorios: 1, presupuestoRecordadoEn: '2026-11-17T09:00:00Z' });
    expect(r).toContain('Ya se le avisó el');
    expect(r).toContain('último aviso');
  });
  it('tras el segundo, no habrá más', () => {
    expect(textoRecordatoriosPresupuesto({ ...base, presupuestoRecordatorios: 2, presupuestoRecordadoEn: '2026-11-21T09:00:00Z' })).toContain('No se le avisará más');
  });
  it('un presupuesto anterior a esta función (marcado como recordado sin fecha) no dice nada', () => {
    expect(textoRecordatoriosPresupuesto({ ...base, presupuestoRecordatorios: 2 })).toBeNull();
  });
});
