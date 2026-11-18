import { describe, expect, it } from 'vitest';
import { ajustarContraste, contraste, CONTRASTE_MINIMO, derivarMarca, luminancia, mezclar, normalizarHex, PRESETS_COLOR, TINTA } from './colorMarca';

describe('colores básicos', () => {
  it('normalizarHex acepta #abc y #aabbcc, y rechaza lo demás', () => {
    expect(normalizarHex('#e8590c')).toBe('#E8590C');
    expect(normalizarHex(' #abc ')).toBe('#AABBCC');
    for (const mal of ['E8590C', '#12', '#GGGGGG', 'rojo', '', null, undefined, '#1234567']) expect(normalizarHex(mal)).toBeNull();
  });
  it('luminancia y contraste: valores de referencia WCAG', () => {
    expect(luminancia('#FFFFFF')).toBeCloseTo(1, 5);
    expect(luminancia('#000000')).toBeCloseTo(0, 5);
    expect(contraste('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contraste('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);       // el gris «casi» AA
    expect(contraste('#E8590C', '#E8590C')).toBeCloseTo(1, 5);
  });
  it('mezclar y ajustarContraste', () => {
    expect(mezclar('#FF0000', '#000000', 0.5)).toBe('#800000');
    expect(mezclar('#102030', '#FFFFFF', 0)).toBe('#102030');
    const c = ajustarContraste('#E8590C', '#FFFFFF', 4.5, '#000000');
    expect(contraste(c, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ajustarContraste('#000000', '#FFFFFF', 4.5, '#000000')).toBe('#000000');  // ya cumple: no se toca
  });
});

describe('derivarMarca', () => {
  it('TODOS los colores preparados salen legibles (botón y texto) en claro y en oscuro', () => {
    for (const p of PRESETS_COLOR) for (const oscuro of [false, true]) {
      const m = derivarMarca(p.hex, oscuro);
      expect(m.contrasteBoton, `${p.nombre} botón`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(m.contrasteTinta, `${p.nombre} texto${oscuro ? ' (oscuro)' : ''}`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    }
  });
  it('el naranja de Doonty se oscurece un poco y mantiene el texto blanco', () => {
    const m = derivarMarca('#E8590C');
    expect(m.sobreBoton).toBe('#FFFFFF');
    expect(m.boton).not.toBe('#E8590C');
    expect(m.corregido).toBe(true);
    expect(contraste('#E8590C', m.boton)).toBeLessThan(1.5);          // sigue pareciendo el mismo naranja
  });
  it('un color que ya se lee con texto blanco se usa tal cual', () => {
    const m = derivarMarca('#374151');
    expect(m).toMatchObject({ boton: '#374151', sobreBoton: '#FFFFFF', corregido: false });
  });
  it('un color muy claro (amarillo) conserva su tono y lleva texto oscuro', () => {
    const m = derivarMarca('#EAB308');
    expect(m).toMatchObject({ boton: '#EAB308', sobreBoton: TINTA, corregido: true });
  });
  it('lo ilegible o mal escrito cae en el naranja de Doonty; los extremos no rompen nada', () => {
    expect(derivarMarca('rojo').boton).toBe(derivarMarca(PRESETS_COLOR[0].hex).boton);
    expect(derivarMarca(null).boton).toBe(derivarMarca(PRESETS_COLOR[0].hex).boton);
    for (const extremo of ['#FFFFFF', '#000000', '#FFFF00', '#00FFFF', '#FF00FF']) {
      const m = derivarMarca(extremo);
      expect(m.contrasteBoton, extremo).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(derivarMarca(extremo, true).contrasteTinta, `${extremo} oscuro`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    }
  });
});
