-- Rate limiting para los portales públicos (portal-mecanico, portal-cliente).
-- El token de acceso es un UUID difícil de adivinar, pero sin límite de
-- peticiones alguien podría bombardear el endpoint (fuerza bruta del token,
-- o simplemente abuso/DoS de bajo nivel) sin que nada lo frene. Se limita
-- por IP y por función, ANTES de resolver el token, para que ni siquiera la
-- búsqueda del token en la tabla se pueda machacar sin límite.

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null default 1
);

alter table public.rate_limits enable row level security;
-- Sin políticas: solo el service_role (usado por las Edge Functions) puede
-- leer/escribir esta tabla, nunca un cliente ni un usuario autenticado.

-- Comprueba y registra atómicamente una petición bajo `p_key` dentro de una
-- ventana deslizante de `p_window_seconds`. Devuelve true si la petición
-- número `count` todavía cabe dentro de `p_max_requests`.
create or replace function public.check_rate_limit(p_key text, p_max_requests int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    count = case
      when rate_limits.window_start <= v_now - (p_window_seconds || ' seconds')::interval
        then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start <= v_now - (p_window_seconds || ' seconds')::interval
        then v_now
      else rate_limits.window_start
    end
  returning count into v_count;

  return v_count <= p_max_requests;
end;
$$;

-- Limpieza diaria: sin esto la tabla crecería sin límite (una fila por
-- IP+función que haya pasado alguna vez). Ninguna ventana usada en el
-- proyecto supera unos pocos minutos, así que 1 día de margen es de sobra.
select cron.schedule(
  'rate-limits-limpieza-diaria',
  '30 3 * * *',
  $$ delete from public.rate_limits where window_start < now() - interval '1 day'; $$
);
