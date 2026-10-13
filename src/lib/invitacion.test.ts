import { afterEach, describe, expect, it, vi } from 'vitest';

async function cargar(hash: string, search = '') {
  vi.resetModules();
  vi.stubGlobal('window', { location: { hash, search } });
  return import('./invitacion');
}
afterEach(() => vi.unstubAllGlobals());

describe('invitacion', () => {
  it('detecta el enlace de invitación en el fragmento', async () => {
    expect((await cargar('#access_token=abc&type=invite&expires_in=3600')).llegaDeInvitacion).toBe(true);
    expect((await cargar('#type=invite')).llegaDeInvitacion).toBe(true);
  });
  it('no confunde recuperación ni acceso normal con una invitación', async () => {
    expect((await cargar('#access_token=abc&type=recovery')).llegaDeInvitacion).toBe(false);
    expect((await cargar('')).llegaDeInvitacion).toBe(false);
    expect((await cargar('#subtype=invite_x')).llegaDeInvitacion).toBe(false);
  });
  it('avisa si el enlace caducó', async () => {
    expect((await cargar('#error=access_denied&error_code=otp_expired')).errorDeEnlace).toContain('caducado');
    expect((await cargar('#access_token=abc&type=invite')).errorDeEnlace).toBeNull();
  });
});
