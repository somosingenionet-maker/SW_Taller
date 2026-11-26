import { describe, expect, it } from 'vitest';
import { aprobadoEnInspeccionConIva, fechaHoraFirma, firmaSuficiente, importeCambiadoTrasFirma, type Punto } from './firma';

const trazo = (n: number, paso: number): Punto[] => Array.from({ length: n }, (_, i) => ({ x: i * paso, y: 0.1 }));

describe('firmaSuficiente', () => {
  it('sin trazos no hay firma', () => expect(firmaSuficiente([])).toBe(false));
  it('un toque suelto no es una firma', () => {
    expect(firmaSuficiente([[{ x: 0.5, y: 0.1 }]])).toBe(false);
    expect(firmaSuficiente([[{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.1 }]])).toBe(false);
  });
  it('muchos puntos pero casi sin recorrido tampoco', () => expect(firmaSuficiente([trazo(20, 0.001)])).toBe(false));
  it('un trazo con recorrido sí', () => expect(firmaSuficiente([trazo(10, 0.05)])).toBe(true));
  it('varios trazos cortos suman', () => expect(firmaSuficiente([trazo(4, 0.05), trazo(4, 0.05)])).toBe(true));
});

describe('importeCambiadoTrasFirma', () => {
  it('detecta un cambio de importe, no un redondeo', () => {
    expect(importeCambiadoTrasFirma(121, 200)).toBe(true);
    expect(importeCambiadoTrasFirma(121, 121.004)).toBe(false);
    expect(importeCambiadoTrasFirma(121, 121.01)).toBe(true);
  });
  it('sin firma no hay nada que comparar', () => expect(importeCambiadoTrasFirma(undefined, 200)).toBe(false));
});

describe('fechaHoraFirma', () => {
  it('formatea fecha y hora locales', () => expect(fechaHoraFirma(new Date(2026, 10, 13, 18, 7).toISOString())).toBe('13 nov. 2026 · 18:07'));
  it('una fecha rota no revienta', () => expect(fechaHoraFirma('nada')).toBe('—'));
});

describe('aprobadoEnInspeccionConIva', () => {
  it('suma con IVA solo las líneas que vienen de un punto de la inspección', () => {
    const lineas = [{ subtotal: 22.5 }, { subtotal: 12.5 }, { subtotal: 80, inspeccionPuntoId: 'p1' }];
    expect(aprobadoEnInspeccionConIva(lineas, 21)).toBe(96.8);
    // Caso real de la prueba completa: 42,35 € aceptados + 96,80 € de la inspección = 139,15 € de la orden.
    expect(importeCambiadoTrasFirma(42.35 + aprobadoEnInspeccionConIva(lineas, 21), 139.15)).toBe(false);
  });
  it('sin líneas de inspección no añade nada', () => {
    expect(aprobadoEnInspeccionConIva([{ subtotal: 50 }], 21)).toBe(0);
  });
});
