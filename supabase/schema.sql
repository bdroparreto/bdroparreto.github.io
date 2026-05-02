create extension if not exists pgcrypto;

create table if not exists checklists(
  id bigint primary key,
  unidade text,
  categoria text,
  momento text,
  frequencia text,
  horario_previsto text,
  responsavel_sugerido text,
  obrigatorio boolean,
  anexo_manual boolean,
  foto_ambiente boolean,
  campo_aberto text
);

create table if not exists submissions(
  id uuid primary key default gen_random_uuid(),
  checklist_id bigint references checklists(id),
  operator_name text not null,
  unidade text not null,
  date date not null,
  filled_at timestamptz not null default now(),
  status text not null,
  has_problem boolean default false,
  observacoes text,
  oknok text,
  passagem text
);
create index if not exists idx_submissions_date on submissions(date);

create table if not exists submission_files(
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id) on delete cascade,
  file_name text,
  file_path text,
  file_type text
);

create table if not exists maintenance_records(
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id) on delete cascade,
  date date,
  unidade text,
  checklist_origem text,
  area_praca text,
  item_problema text,
  descricao_problema text,
  responsible text,
  criticidade text,
  status text,
  prazo_retorno text,
  observacoes text
);

-- MVP sem auth: políticas abertas para leitura/escrita
alter table checklists enable row level security;
alter table submissions enable row level security;
alter table submission_files enable row level security;
alter table maintenance_records enable row level security;

do $$ begin
  create policy "public checklists" on checklists for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public submissions" on submissions for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public submission_files" on submission_files for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public maintenance" on maintenance_records for all using (true) with check (true);
exception when duplicate_object then null; end $$;
