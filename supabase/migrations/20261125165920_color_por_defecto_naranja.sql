-- El color de marca por defecto de un taller nuevo pasa a ser el naranja de Doonty (antes azul #2563eb).
-- Solo cambia el valor por defecto: los talleres que ya existen conservan el color que tengan.
alter table public.empresas alter column brand_color set default '#E8590C';
