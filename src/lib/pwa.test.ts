import { describe, expect, it } from 'vitest';
import { colorSeguro, esIOS, manifiestoMecanico } from './pwa';

describe('manifiestoMecanico', () => {
  const url = 'https://motor.doonty.com/mecanico/abc123token';
  const m = manifiestoMecanico(url, 'Talleres Ruiz', '#e11d48');

  it('al instalar, el icono abre la página propia del mecánico (no la aplicación del taller)', () => {
    expect(m.start_url).toBe(url);
    expect(m.scope).toBe('https://motor.doonty.com/mecanico/');
    expect(m.start_url.startsWith(m.scope)).toBe(true); // el inicio tiene que caer dentro del ámbito
  });
  it('lleva el nombre del taller y su color', () => {
    expect(m.name).toBe('Mis vehículos · Talleres Ruiz');
    expect(m.theme_color).toBe('#e11d48');
    expect(m.display).toBe('standalone');
  });
  it('iconos con ruta absoluta (el manifiesto vive en una URL blob:) y uno «maskable»', () => {
    expect(m.icons.every((i) => i.src.startsWith('https://motor.doonty.com/icon-'))).toBe(true);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
  it('sin nombre de taller no deja un «· » colgando', () => {
    expect(manifiestoMecanico(url, '', '#2563eb').name).toBe('Mis vehículos');
  });
  it('un color raro de la base de datos no llega al manifiesto', () => {
    expect(manifiestoMecanico(url, 'X', 'red;evil').theme_color).toBe('#2563eb');
  });
});

describe('colorSeguro', () => {
  it('acepta #RRGGBB y rechaza el resto', () => {
    expect(colorSeguro('#0f172a')).toBe('#0f172a');
    expect(colorSeguro('#fff')).toBe('#2563eb');
    expect(colorSeguro('')).toBe('#2563eb');
    expect(colorSeguro(null)).toBe('#2563eb');
    expect(colorSeguro('blue', '#000000')).toBe('#000000');
  });
});

describe('esIOS', () => {
  it('iPhone y iPad (también el iPad que se presenta como Mac)', () => {
    expect(esIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(true);
    expect(esIOS('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe(true);
  });
  it('un Mac de escritorio o un Android no lo son', () => {
    expect(esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe(false);
    expect(esIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120')).toBe(false);
  });
});
