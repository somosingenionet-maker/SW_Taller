import { beforeEach, describe, expect, it, vi } from 'vitest';

// Dos clientes: el principal (la sesión del usuario) y el de comprobación (sin sesión guardada).
const { principal, comprobador } = vi.hoisted(() => ({
  principal: { getSession: vi.fn(), updateUser: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() },
  comprobador: { signInWithPassword: vi.fn(), signOut: vi.fn() },
}));
vi.mock('./supabase', () => ({
  supabase: { auth: principal },
  crearClienteSinSesion: () => ({ auth: comprobador }),
}));
const { cambiarPassword, mensajeCambioPassword } = await import('./auth');

beforeEach(() => {
  vi.resetAllMocks();
  principal.getSession.mockResolvedValue({ data: { session: { user: { email: 'ana@taller.es' } } } });
  comprobador.signInWithPassword.mockResolvedValue({ error: null });
  comprobador.signOut.mockResolvedValue({ error: null });
  principal.updateUser.mockResolvedValue({ error: null });
});

describe('cambiarPassword', () => {
  it('comprueba la contraseña actual en el cliente aparte y luego cambia la del usuario', async () => {
    expect(await cambiarPassword('Vieja123', 'Nueva1234')).toBeNull();
    expect(comprobador.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@taller.es', password: 'Vieja123' });
    expect(principal.updateUser).toHaveBeenCalledWith({ password: 'Nueva1234' });
  });

  it('nunca inicia ni cierra sesión en el cliente principal (no se pierde el segundo factor)', async () => {
    await cambiarPassword('Vieja123', 'Nueva1234');
    expect(principal.signInWithPassword).not.toHaveBeenCalled();
    expect(principal.signOut).not.toHaveBeenCalled();
  });

  it('cierra solo la sesión de comprobación (un cierre global echaría al usuario)', async () => {
    await cambiarPassword('Vieja123', 'Nueva1234');
    expect(comprobador.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('si la contraseña actual no es correcta, no cambia nada', async () => {
    comprobador.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    expect(await cambiarPassword('mala', 'Nueva1234')).toBe('La contraseña actual no es correcta.');
    expect(principal.updateUser).not.toHaveBeenCalled();
  });

  it('sin sesión no intenta nada', async () => {
    principal.getSession.mockResolvedValue({ data: { session: null } });
    expect(await cambiarPassword('Vieja123', 'Nueva1234')).toContain('sesión ha caducado');
    expect(comprobador.signInWithPassword).not.toHaveBeenCalled();
  });

  it('un fallo al cerrar la sesión de comprobación no impide el cambio', async () => {
    comprobador.signOut.mockRejectedValue(new Error('red'));
    expect(await cambiarPassword('Vieja123', 'Nueva1234')).toBeNull();
    expect(principal.updateUser).toHaveBeenCalled();
  });

  it('traduce el rechazo del servidor a la contraseña nueva', async () => {
    principal.updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } });
    expect(await cambiarPassword('Vieja123', 'Vieja123')).toBe('La nueva contraseña debe ser distinta de la actual.');
  });
});

describe('mensajeCambioPassword', () => {
  it('nunca enseña el texto en inglés del servidor', () => {
    for (const m of ['Invalid login credentials', 'Email rate limit exceeded', 'Failed to fetch', 'Password update requires reauthentication', 'AAL2 session is required', 'algo raro']) {
      for (const paso of ['actual', 'nueva'] as const) expect(mensajeCambioPassword(m, paso)).not.toContain(m);
    }
  });
  it('distingue los casos que el usuario puede resolver', () => {
    expect(mensajeCambioPassword('Request rate limit reached', 'actual')).toContain('Demasiados intentos');
    expect(mensajeCambioPassword('Password update requires reauthentication', 'nueva')).toContain('cierra sesión');
    expect(mensajeCambioPassword('Password is known to be weak and easy to guess', 'nueva')).toContain('Elige otra');
  });
});
