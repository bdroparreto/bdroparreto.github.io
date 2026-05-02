create extension if not exists pgcrypto;

create table if not exists checklists(
  id bigint primary key,
  csv_id bigint unique,
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

alter table checklists add column if not exists csv_id bigint;
create unique index if not exists idx_checklists_csv_id on checklists(csv_id);

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

insert into checklists (id, csv_id, unidade, categoria, momento, frequencia, horario_previsto, responsavel_sugerido, obrigatorio, anexo_manual, foto_ambiente, campo_aberto) values
(1,1,'Delivery','Abertura da casa','Manhã','Diária','Início do turno / abertura','Líder de cozinha ou responsável da abertura',true,true,true,false),
(2,2,'Delivery','Checagem de temperatura 1','Manhã','Diária - 2x ao dia','Após abertura / início da operação','Responsável da cozinha/produção',true,true,false,false),
(3,3,'Delivery','Checklist de praça 1','Manhã','Diária - 2x ao dia','Após abertura / antes do início do serviço','Responsável da praça',true,false,true,true),
(4,4,'Delivery','Troca de turno','Troca de turno','Diária','No momento da troca de turno','Responsável que entrega o turno',true,false,false,true),
(5,5,'Delivery','Checklist de praça 2','Troca de turno','Diária - 2x ao dia','Durante a troca de turno','Responsável que recebe o turno',true,false,true,true),
(6,6,'Delivery','Checagem de temperatura 2','Antes do fechamento','Diária - 2x ao dia','Antes do fechamento','Responsável do fechamento',true,true,false,false),
(7,7,'Delivery','Fechamento da casa','Fechamento','Diária','Final do turno / fechamento','Responsável do fechamento',true,true,true,false),
(8,8,'Delivery','Limpeza da casa','Manhã / fechamento / conforme rotina','Diária','Conforme rotina definida','Responsável da limpeza ou líder do turno',true,false,true,false),
(9,9,'Delivery','Manutenção','Quando houver problema','Sob demanda','No momento da identificação','Qualquer responsável do turno',true,false,true,true)
on conflict (id) do update set
csv_id=excluded.csv_id, unidade=excluded.unidade, categoria=excluded.categoria, momento=excluded.momento, frequencia=excluded.frequencia, horario_previsto=excluded.horario_previsto, responsavel_sugerido=excluded.responsavel_sugerido, obrigatorio=excluded.obrigatorio, anexo_manual=excluded.anexo_manual, foto_ambiente=excluded.foto_ambiente, campo_aberto=excluded.campo_aberto;

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
