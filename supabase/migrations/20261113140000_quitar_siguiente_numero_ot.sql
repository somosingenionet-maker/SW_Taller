-- Limpieza: `siguiente_numero_ot()` calculaba el número de orden contando filas, desde cuando la
-- aplicación numeraba en el navegador. Desde la migración 20261009130000 el número lo asigna el
-- disparador `trg_ot_numero` (único por taller, con bloqueo contra duplicados) y esta función no la
-- llama nadie (ni la aplicación, ni otra función, ni políticas ni valores por defecto). Sobraba y,
-- además, `anon` y `authenticated` podían ejecutarla. Se borra.
drop function if exists public.siguiente_numero_ot();
