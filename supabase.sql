-- 1) Crea un proyecto en https://supabase.com (plan gratuito).
-- 2) Abre SQL Editor, pega este script y ejecútalo.
-- 3) Copia la "Project URL" y la "anon public key" a config.js.
-- (Authentication → Providers → Email: desactiva "Confirm email" si no quieres confirmar por correo.)

create table if not exists study_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table study_state enable row level security;

create policy "own row select" on study_state for select using (auth.uid() = user_id);
create policy "own row insert" on study_state for insert with check (auth.uid() = user_id);
create policy "own row update" on study_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on study_state for delete using (auth.uid() = user_id);
