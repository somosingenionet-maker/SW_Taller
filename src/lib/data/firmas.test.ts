import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const { mapFirmas, tipoDispositivo } = await import('./firmas');

const VACIA = { firma_presupuesto: null, firma_presupuesto_nombre: null, firma_presupuesto_en: null, firma_presupuesto_total: null, firma_entrega: null, firma_entrega_nombre: null, firma_entrega_en: null };

describe('mapFirmas', () => {
  it('una orden sin firmar no devuelve firmas', () => {
    expect(mapFirmas(VACIA)).toEqual({ presupuesto: undefined, entrega: undefined });
  });
  it('lee la firma del presupuesto con su importe', () => {
    const f = mapFirmas({ ...VACIA, firma_presupuesto: 'data:image/png;base64,AAA', firma_presupuesto_nombre: 'Ana García', firma_presupuesto_en: '2026-11-13T17:42:00Z', firma_presupuesto_total: 121 });
    expect(f.presupuesto).toEqual({ png: 'data:image/png;base64,AAA', nombre: 'Ana García', en: '2026-11-13T17:42:00Z', total: 121 });
    expect(f.entrega).toBeUndefined();
  });
  it('lee la de la entrega, que no lleva importe', () => {
    const f = mapFirmas({ ...VACIA, firma_entrega: 'data:image/png;base64,BBB', firma_entrega_nombre: 'Luis', firma_entrega_en: '2026-11-14T09:00:00Z' });
    expect(f.entrega).toEqual({ png: 'data:image/png;base64,BBB', nombre: 'Luis', en: '2026-11-14T09:00:00Z' });
    expect(f.entrega && 'total' in f.entrega && f.entrega.total).toBeFalsy();
  });
});

describe('tipoDispositivo', () => {
  it('distingue móvil, tableta y ordenador, y avisa si no hay dato', () => {
    expect(tipoDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Mobile/15E148')).toBe('Móvil');
    expect(tipoDispositivo('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Chrome Mobile Safari')).toBe('Móvil');
    expect(tipoDispositivo('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit')).toBe('Tableta');
    expect(tipoDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537')).toBe('Ordenador');
    expect(tipoDispositivo(null)).toBe('dispositivo desconocido');
    expect(tipoDispositivo('')).toBe('dispositivo desconocido');
  });
});
