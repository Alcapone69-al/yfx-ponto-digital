-- YFX Ponto Digital — esquema, segurança e funções do servidor
create extension if not exists pgcrypto with schema extensions;

-- ============================================================ tabelas
create table public.empresas(
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  morada text check (char_length(morada) <= 200),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  raio int not null default 100 check (raio between 20 and 1000),
  exigir_gps boolean not null default false,
  hora_inicio time not null default '08:00',
  hora_fim time not null default '17:00',
  tolerancia int not null default 10 check (tolerancia in (5,10,15,20)),
  almoco boolean not null default true,
  almoco_inicio time not null default '12:00',
  almoco_fim time not null default '13:00',
  minutos_previstos int not null default 480 check (minutos_previstos between 60 and 1440),
  plano text not null check (plano in ('pequeno','medio','grande')),
  limite_trabalhadores int not null check (limite_trabalhadores > 0),
  subscricao_estado text not null default 'activa' check (subscricao_estado in ('activa','pendente','suspensa')),
  subscricao_validade date,
  configurada boolean not null default false,
  criado_em timestamptz not null default now(),
  check (hora_fim > hora_inicio),
  check (almoco_fim > almoco_inicio)
);

create table public.membros(
  user_id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  perfil text not null check (perfil in ('chefe','gerente')),
  nome text not null check (char_length(nome) between 2 and 80),
  email text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index membros_empresa_idx on public.membros(empresa_id);

-- emitidos pela YFX (sem acesso pela API): o chefe só existe através de um código
create table public.codigos_ativacao(
  codigo text primary key,
  plano text not null check (plano in ('pequeno','medio','grande')),
  limite int not null check (limite > 0),
  validade date,
  usado_em timestamptz,
  usado_por uuid,
  empresa_id uuid references public.empresas(id),
  notas text,
  criado_em timestamptz not null default now()
);

create table public.convites(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  email text not null,
  nome text not null,
  perfil text not null default 'gerente' check (perfil = 'gerente'),
  token text not null unique default encode(extensions.gen_random_bytes(18),'hex'),
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  aceite_em timestamptz,
  aceite_por uuid,
  revogado_em timestamptz
);
create index convites_empresa_idx on public.convites(empresa_id);

create table public.trabalhadores(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nome text not null check (char_length(nome) between 3 and 80),
  funcao text not null check (char_length(funcao) between 2 and 40),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  desativado_em timestamptz
);
create index trabalhadores_empresa_idx on public.trabalhadores(empresa_id);

create table public.dias(
  empresa_id uuid not null references public.empresas(id),
  data date not null,
  fecho_id uuid unique,
  fechado_em timestamptz,
  fechado_por uuid,
  resumo_fecho jsonb,
  aprovado_em timestamptz,
  aprovado_por uuid,
  aprovado_por_nome text,
  corrigido_apos_aprovacao boolean not null default false,
  primary key (empresa_id, data)
);

-- registo bruto e imutável de cada operação feita no aparelho do gerente
create table public.marcacoes(
  id uuid primary key,                       -- gerado no aparelho antes do envio (evita duplicados)
  empresa_id uuid not null references public.empresas(id),
  trabalhador_id uuid not null references public.trabalhadores(id),
  data date not null,
  tipo text not null check (tipo in ('entrada','almoco_saida','almoco_regresso','saida','falta')),
  hora_aparelho timestamptz not null,
  hora_servidor timestamptz not null default now(),
  lat double precision, lng double precision, precisao real, distancia int,
  geo_estado text not null check (geo_estado in ('verificada','nao_verificada')),
  nota text check (char_length(nota) <= 200),
  offline boolean not null default false,
  registado_por uuid not null
);
create index marcacoes_empresa_data_idx on public.marcacoes(empresa_id, data);
create index marcacoes_trab_idx on public.marcacoes(trabalhador_id);

-- estado actual (com correcções) de cada trabalhador em cada dia
create table public.registos(
  empresa_id uuid not null references public.empresas(id),
  data date not null,
  trabalhador_id uuid not null references public.trabalhadores(id),
  entrada time, almoco_saida time, almoco_regresso time, saida time,
  falta boolean not null default false,
  nota text,
  geo jsonb not null default '{}'::jsonb,
  original jsonb,
  campos_corrigidos text[] not null default '{}',
  corrigido_apos_aprovacao boolean not null default false,
  versao int not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, data, trabalhador_id)
);
create index registos_trab_idx on public.registos(trabalhador_id);

create table public.auditoria(
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id),
  user_id uuid not null,
  user_nome text not null,
  trabalhador_id uuid not null references public.trabalhadores(id),
  data date not null,
  campo text not null,
  valor_anterior text,
  valor_novo text,
  motivo text not null,
  registo_ref text not null,
  apos_aprovacao boolean not null default false,
  criado_em timestamptz not null default now()
);
create index auditoria_empresa_idx on public.auditoria(empresa_id, criado_em desc);
create index auditoria_trab_idx on public.auditoria(trabalhador_id);

create table public.notificacoes(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  destinatario uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('fecho','pronto','aprovado','correcao','sync','atencao')),
  titulo text not null,
  descricao text not null,
  link text,
  chave text,
  lida_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (destinatario, chave)
);
create index notificacoes_dest_idx on public.notificacoes(destinatario, criado_em desc);
create index notificacoes_empresa_idx on public.notificacoes(empresa_id);

-- ============================================================ imutabilidade
create or replace function public.bloquear_alteracao() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Registo imutável: % não é permitido em %', tg_op, tg_table_name;
end $$;
create trigger auditoria_imutavel before update or delete on public.auditoria
  for each row execute function public.bloquear_alteracao();
create trigger marcacoes_imutaveis before update or delete on public.marcacoes
  for each row execute function public.bloquear_alteracao();

-- ============================================================ auxiliares
create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.membros where user_id = (select auth.uid()) and ativo
$$;
create or replace function public.meu_perfil() returns text
language sql stable security definer set search_path = public as $$
  select perfil from public.membros where user_id = (select auth.uid()) and ativo
$$;

create or replace function public._membro() returns public.membros
language plpgsql stable security definer set search_path = public as $$
declare m public.membros;
begin
  if auth.uid() is null then raise exception 'Sessão inválida. Entre novamente.'; end if;
  select * into m from public.membros where user_id = auth.uid() and ativo;
  if not found then raise exception 'O seu utilizador não está associado a nenhuma empresa.'; end if;
  return m;
end $$;

create or replace function public._exigir(p text) returns public.membros
language plpgsql stable security definer set search_path = public as $$
declare m public.membros;
begin
  m := public._membro();
  if m.perfil <> p then
    raise exception 'Sem permissão: esta operação é reservada ao %.', p;
  end if;
  return m;
end $$;

create or replace function public._hoje() returns date
language sql stable as $$ select (now() at time zone 'Africa/Maputo')::date $$;

create or replace function public._distancia(a double precision, b double precision, c double precision, d double precision) returns int
language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(c - a) / 2), 2) + cos(radians(a)) * cos(radians(c)) * power(sin(radians(d - b) / 2), 2)
  )))::int
$$;

create or replace function public._notificar(p_empresa uuid, p_perfil text, p_excepto uuid, p_tipo text, p_titulo text, p_desc text, p_link text, p_chave text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificacoes(empresa_id, destinatario, tipo, titulo, descricao, link, chave)
  select p_empresa, m.user_id, p_tipo, p_titulo, p_desc, p_link, p_chave
  from public.membros m
  where m.empresa_id = p_empresa and m.ativo and (p_perfil is null or m.perfil = p_perfil)
    and (p_excepto is null or m.user_id <> p_excepto)
  on conflict (destinatario, chave) do nothing;
end $$;

-- ============================================================ RLS (só leitura; escrita apenas por funções)
alter table public.empresas enable row level security;
alter table public.membros enable row level security;
alter table public.codigos_ativacao enable row level security;
alter table public.convites enable row level security;
alter table public.trabalhadores enable row level security;
alter table public.dias enable row level security;
alter table public.marcacoes enable row level security;
alter table public.registos enable row level security;
alter table public.auditoria enable row level security;
alter table public.notificacoes enable row level security;

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
revoke all on public.codigos_ativacao from authenticated;

create policy empresas_ler on public.empresas for select to authenticated using (id = (select public.minha_empresa()));
create policy membros_ler on public.membros for select to authenticated using (empresa_id = (select public.minha_empresa()));
create policy convites_ler on public.convites for select to authenticated
  using (empresa_id = (select public.minha_empresa()) and (select public.meu_perfil()) = 'chefe');
create policy trabalhadores_ler on public.trabalhadores for select to authenticated using (empresa_id = (select public.minha_empresa()));
create policy dias_ler on public.dias for select to authenticated using (empresa_id = (select public.minha_empresa()));
create policy marcacoes_ler on public.marcacoes for select to authenticated using (empresa_id = (select public.minha_empresa()));
create policy registos_ler on public.registos for select to authenticated using (empresa_id = (select public.minha_empresa()));
create policy auditoria_ler on public.auditoria for select to authenticated using (empresa_id = (select public.minha_empresa()));
create policy notificacoes_ler on public.notificacoes for select to authenticated
  using (destinatario = (select auth.uid()) and empresa_id = (select public.minha_empresa()));

-- ============================================================ empresa, convites
create or replace function public.agora_servidor() returns timestamptz
language sql stable as $$ select now() $$;

create or replace function public.ativar_empresa(p_codigo text, p_empresa text, p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.codigos_ativacao; v_emp uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Sessão inválida. Entre novamente.'; end if;
  if exists (select 1 from public.membros where user_id = auth.uid()) then
    raise exception 'Este utilizador já está associado a uma empresa.';
  end if;
  if char_length(trim(coalesce(p_empresa,''))) < 2 then raise exception 'Indique o nome da empresa.'; end if;
  if char_length(trim(coalesce(p_nome,''))) < 2 then raise exception 'Indique o seu nome.'; end if;
  select * into c from public.codigos_ativacao where codigo = upper(trim(p_codigo)) for update;
  if not found or c.usado_em is not null or (c.validade is not null and c.validade < public._hoje()) then
    raise exception 'Código de activação inválido, já usado ou expirado. Confirme o código com a YFX.';
  end if;
  insert into public.empresas(nome, plano, limite_trabalhadores) values (trim(p_empresa), c.plano, c.limite) returning id into v_emp;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.membros(user_id, empresa_id, perfil, nome, email) values (auth.uid(), v_emp, 'chefe', trim(p_nome), v_email);
  update public.codigos_ativacao set usado_em = now(), usado_por = auth.uid(), empresa_id = v_emp where codigo = c.codigo;
  return v_emp;
end $$;

create or replace function public.configurar_empresa(
  p_nome text, p_morada text, p_hora_inicio time, p_hora_fim time, p_tolerancia int, p_minutos_previstos int,
  p_almoco boolean, p_almoco_inicio time, p_almoco_fim time, p_lat double precision, p_lng double precision,
  p_raio int, p_exigir_gps boolean, p_configurada boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.membros;
begin
  m := public._exigir('chefe');
  if char_length(trim(coalesce(p_nome,''))) < 2 then raise exception 'Indique o nome da empresa.'; end if;
  if p_hora_fim <= p_hora_inicio then raise exception 'A hora de fim tem de ser depois da hora de início.'; end if;
  if p_tolerancia not in (5,10,15,20) then raise exception 'A tolerância tem de ser 5, 10, 15 ou 20 minutos.'; end if;
  if p_almoco and (p_almoco_fim <= p_almoco_inicio or p_almoco_inicio < p_hora_inicio or p_almoco_fim > p_hora_fim) then
    raise exception 'O intervalo de almoço tem de estar dentro do horário e terminar depois de começar.';
  end if;
  if p_minutos_previstos < 60 or p_minutos_previstos > extract(epoch from (p_hora_fim - p_hora_inicio)) / 60 then
    raise exception 'As horas diárias previstas têm de ser pelo menos 1h e não ultrapassar o horário.';
  end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'Indique a latitude e a longitude, ou nenhuma.'; end if;
  if p_raio < 20 or p_raio > 1000 then raise exception 'O raio tem de estar entre 20 e 1000 metros.'; end if;
  if p_exigir_gps and p_lat is null then raise exception 'Para exigir GPS, defina primeiro as coordenadas da empresa.'; end if;
  update public.empresas set nome = trim(p_nome), morada = nullif(trim(p_morada),''), hora_inicio = p_hora_inicio, hora_fim = p_hora_fim,
    tolerancia = p_tolerancia, minutos_previstos = p_minutos_previstos, almoco = p_almoco,
    almoco_inicio = coalesce(p_almoco_inicio, almoco_inicio), almoco_fim = coalesce(p_almoco_fim, almoco_fim),
    lat = p_lat, lng = p_lng, raio = p_raio, exigir_gps = p_exigir_gps, configurada = configurada or coalesce(p_configurada,false)
  where id = m.empresa_id;
end $$;

create or replace function public.convidar_gerente(p_email text, p_nome text)
returns text language plpgsql security definer set search_path = public as $$
declare m public.membros; v_token text; v_email text := lower(trim(p_email));
begin
  m := public._exigir('chefe');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'O e-mail do gerente não é válido.'; end if;
  if char_length(trim(coalesce(p_nome,''))) < 2 then raise exception 'Indique o nome do gerente.'; end if;
  if exists (select 1 from public.membros where lower(email) = v_email and ativo) then
    raise exception 'Este e-mail já tem acesso a uma empresa.';
  end if;
  update public.convites set revogado_em = now()
   where empresa_id = m.empresa_id and lower(email) = v_email and aceite_em is null and revogado_em is null;
  insert into public.convites(empresa_id, email, nome, criado_por) values (m.empresa_id, v_email, trim(p_nome), m.user_id)
  returning token into v_token;
  return v_token;
end $$;

create or replace function public.revogar_convite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.membros;
begin
  m := public._exigir('chefe');
  update public.convites set revogado_em = now()
   where id = p_id and empresa_id = m.empresa_id and aceite_em is null and revogado_em is null;
  if not found then raise exception 'Convite não encontrado ou já utilizado.'; end if;
end $$;

create or replace function public.aceitar_convite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.convites; v_email text;
begin
  if auth.uid() is null then raise exception 'Sessão inválida. Entre novamente.'; end if;
  if exists (select 1 from public.membros where user_id = auth.uid()) then
    raise exception 'Este utilizador já está associado a uma empresa.';
  end if;
  select * into c from public.convites where token = trim(p_token) for update;
  if not found or c.revogado_em is not null or c.aceite_em is not null or c.expira_em < now() then
    raise exception 'Convite inválido, já utilizado ou expirado. Peça um novo convite ao chefe.';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email <> lower(c.email) then
    raise exception 'Este convite foi enviado para %. Entre com esse e-mail para o aceitar.', c.email;
  end if;
  insert into public.membros(user_id, empresa_id, perfil, nome, email) values (auth.uid(), c.empresa_id, 'gerente', c.nome, v_email);
  update public.convites set aceite_em = now(), aceite_por = auth.uid() where id = c.id;
  return c.empresa_id;
end $$;

create or replace function public.definir_gerente_ativo(p_user uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.membros;
begin
  m := public._exigir('chefe');
  update public.membros set ativo = p_ativo where user_id = p_user and empresa_id = m.empresa_id and perfil = 'gerente';
  if not found then raise exception 'Gerente não encontrado nesta empresa.'; end if;
end $$;

-- ============================================================ trabalhadores
create or replace function public._limite_ok(p_emp uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_lim int; v_act int;
begin
  select limite_trabalhadores into v_lim from public.empresas where id = p_emp;
  select count(*) into v_act from public.trabalhadores where empresa_id = p_emp and ativo;
  if v_act >= v_lim then
    raise exception 'O plano permite até % trabalhadores activos. Desactive um trabalhador ou mude de plano.', v_lim;
  end if;
end $$;

create or replace function public.adicionar_trabalhador(p_nome text, p_funcao text)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.membros; v_id uuid; v_nome text := regexp_replace(trim(coalesce(p_nome,'')), '\s+', ' ', 'g');
begin
  m := public._exigir('chefe');
  if v_nome !~ '\S+\s+\S+' then raise exception 'Escreva o nome completo (nome e apelido).'; end if;
  if char_length(trim(coalesce(p_funcao,''))) < 2 then raise exception 'Indique a função do trabalhador.'; end if;
  perform public._limite_ok(m.empresa_id);
  if exists (select 1 from public.trabalhadores where empresa_id = m.empresa_id and ativo and lower(nome) = lower(v_nome)) then
    raise exception 'Já existe um trabalhador activo com este nome. Acrescente um apelido para distinguir.';
  end if;
  insert into public.trabalhadores(empresa_id, nome, funcao) values (m.empresa_id, v_nome, trim(p_funcao)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.editar_trabalhador(p_id uuid, p_nome text, p_funcao text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.membros; v_nome text := regexp_replace(trim(coalesce(p_nome,'')), '\s+', ' ', 'g');
begin
  m := public._exigir('chefe');
  if v_nome !~ '\S+\s+\S+' then raise exception 'Escreva o nome completo (nome e apelido).'; end if;
  if char_length(trim(coalesce(p_funcao,''))) < 2 then raise exception 'Indique a função do trabalhador.'; end if;
  if exists (select 1 from public.trabalhadores where empresa_id = m.empresa_id and ativo and id <> p_id and lower(nome) = lower(v_nome)) then
    raise exception 'Já existe um trabalhador activo com este nome.';
  end if;
  update public.trabalhadores set nome = v_nome, funcao = trim(p_funcao) where id = p_id and empresa_id = m.empresa_id;
  if not found then raise exception 'Trabalhador não encontrado.'; end if;
end $$;

create or replace function public.definir_trabalhador_ativo(p_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.membros; t public.trabalhadores;
begin
  m := public._exigir('chefe');
  select * into t from public.trabalhadores where id = p_id and empresa_id = m.empresa_id for update;
  if not found then raise exception 'Trabalhador não encontrado.'; end if;
  if t.ativo = p_ativo then return; end if;
  if p_ativo then perform public._limite_ok(m.empresa_id); end if;
  update public.trabalhadores set ativo = p_ativo, desativado_em = case when p_ativo then null else now() end where id = p_id;
end $$;

-- ============================================================ marcações (gerente)
create or replace function public.registar_marcacao(
  p_id uuid, p_trabalhador uuid, p_tipo text, p_hora_aparelho timestamptz,
  p_lat double precision, p_lng double precision, p_precisao real, p_nota text, p_offline boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.membros; e public.empresas; t public.trabalhadores; r public.registos; ex public.marcacoes;
  v_data date; v_hora time; v_dist int; v_geo text; v_ult time; v_ok boolean;
begin
  m := public._exigir('gerente');
  if p_id is null then raise exception 'Operação sem identificador.'; end if;
  -- idempotência: a mesma operação enviada duas vezes devolve o resultado já gravado
  select * into ex from public.marcacoes where id = p_id;
  if found then
    if ex.empresa_id <> m.empresa_id then raise exception 'Operação inválida.'; end if;
    select * into r from public.registos where empresa_id = ex.empresa_id and data = ex.data and trabalhador_id = ex.trabalhador_id;
    return jsonb_build_object('duplicada', true, 'registo', to_jsonb(r));
  end if;
  if p_tipo not in ('entrada','almoco_saida','almoco_regresso','saida','falta') then raise exception 'Tipo de marcação desconhecido.'; end if;
  select * into e from public.empresas where id = m.empresa_id;
  if e.subscricao_estado = 'suspensa' then raise exception 'A subscrição da empresa está suspensa. Contacte a YFX.'; end if;
  select * into t from public.trabalhadores where id = p_trabalhador and empresa_id = m.empresa_id;
  if not found or not t.ativo then raise exception 'Trabalhador não encontrado ou desactivado.'; end if;

  if p_hora_aparelho > now() + interval '5 minutes' then
    raise exception 'A hora do telemóvel está adiantada em relação ao servidor. Acerte o relógio do aparelho.';
  end if;
  if p_hora_aparelho < now() - interval '48 hours' then
    raise exception 'Esta marcação tem mais de 48 horas e já não pode ser aceite. Peça ao chefe para corrigir o registo.';
  end if;
  if not coalesce(p_offline,false) and p_hora_aparelho < now() - interval '10 minutes' then
    raise exception 'A hora do telemóvel está atrasada em relação ao servidor. Acerte o relógio do aparelho.';
  end if;
  v_data := (p_hora_aparelho at time zone 'Africa/Maputo')::date;
  v_hora := date_trunc('minute', p_hora_aparelho at time zone 'Africa/Maputo')::time;

  insert into public.dias(empresa_id, data) values (m.empresa_id, v_data) on conflict do nothing;
  if exists (select 1 from public.dias where empresa_id = m.empresa_id and data = v_data and aprovado_em is not null) then
    raise exception 'O dia % já foi aprovado pelo chefe. Peça ao chefe para registar a correcção.', to_char(v_data,'DD/MM/YYYY');
  end if;

  -- localização: estimativa validada no servidor; nunca marcada como verificada sem coordenadas
  if p_lat is null or p_lng is null then
    if e.exigir_gps then raise exception 'Esta empresa exige localização. Active o GPS do telemóvel e tente novamente.'; end if;
    v_geo := 'nao_verificada';
  elsif e.lat is null then
    v_geo := 'nao_verificada';
  else
    v_dist := public._distancia(p_lat, p_lng, e.lat, e.lng);
    if p_precisao is not null and p_precisao > e.raio then
      raise exception 'A precisão do GPS (±% m) é insuficiente para o raio de % m. Vá para um local aberto e tente novamente.', round(p_precisao), e.raio;
    end if;
    if v_dist > e.raio then
      raise exception 'Está a cerca de % m do local da empresa (limite % m). Aproxime-se e tente novamente.', v_dist, e.raio;
    end if;
    v_geo := 'verificada';
  end if;

  insert into public.registos(empresa_id, data, trabalhador_id) values (m.empresa_id, v_data, t.id) on conflict do nothing;
  select * into r from public.registos where empresa_id = m.empresa_id and data = v_data and trabalhador_id = t.id for update;

  v_ok := case p_tipo
    when 'entrada' then r.entrada is null and not r.falta
    when 'falta' then r.entrada is null and not r.falta
    when 'almoco_saida' then e.almoco and r.entrada is not null and r.almoco_saida is null and r.saida is null and not r.falta
    when 'almoco_regresso' then r.almoco_saida is not null and r.almoco_regresso is null and r.saida is null
    when 'saida' then r.entrada is not null and r.saida is null and not r.falta and (r.almoco_saida is null or r.almoco_regresso is not null)
  end;
  if not v_ok then
    raise exception 'Esta marcação não é permitida no estado actual do trabalhador. Actualize a lista e tente novamente.';
  end if;
  v_ult := greatest(r.entrada, r.almoco_saida, r.almoco_regresso, r.saida);
  if p_tipo <> 'falta' and v_ult is not null and v_hora <= v_ult then
    raise exception 'A hora desta marcação (%) é anterior ou igual à última marcação (%). Verifique o relógio do aparelho.', to_char(v_hora,'HH24:MI'), to_char(v_ult,'HH24:MI');
  end if;

  insert into public.marcacoes(id, empresa_id, trabalhador_id, data, tipo, hora_aparelho, lat, lng, precisao, distancia, geo_estado, nota, offline, registado_por)
  values (p_id, m.empresa_id, t.id, v_data, p_tipo, p_hora_aparelho, p_lat, p_lng, p_precisao, v_dist, v_geo,
          case when p_tipo = 'falta' then nullif(left(trim(coalesce(p_nota,'')),200),'') end, coalesce(p_offline,false), m.user_id);

  update public.registos set
    entrada = case when p_tipo = 'entrada' then v_hora else entrada end,
    almoco_saida = case when p_tipo = 'almoco_saida' then v_hora else almoco_saida end,
    almoco_regresso = case when p_tipo = 'almoco_regresso' then v_hora else almoco_regresso end,
    saida = case when p_tipo = 'saida' then v_hora else saida end,
    falta = falta or p_tipo = 'falta',
    nota = case when p_tipo = 'falta' then nullif(left(trim(coalesce(p_nota,'')),200),'') else nota end,
    geo = geo || jsonb_build_object(p_tipo, v_geo),
    versao = versao + 1, atualizado_em = now()
  where empresa_id = m.empresa_id and data = v_data and trabalhador_id = t.id
  returning * into r;
  return jsonb_build_object('duplicada', false, 'registo', to_jsonb(r), 'geo', v_geo, 'distancia', v_dist);
end $$;

create or replace function public._resumo(p_emp uuid, p_data date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'presentes', count(*) filter (where r.entrada is not null and r.entrada <= e.hora_inicio + make_interval(mins => e.tolerancia)),
    'atrasados', count(*) filter (where r.entrada is not null and r.entrada > e.hora_inicio + make_interval(mins => e.tolerancia)),
    'faltas', count(*) filter (where r.falta),
    'por_marcar', count(*) filter (where r.trabalhador_id is null or (r.entrada is null and not r.falta)))
  from public.trabalhadores t
  join public.empresas e on e.id = t.empresa_id
  left join public.registos r on r.empresa_id = t.empresa_id and r.trabalhador_id = t.id and r.data = p_data
  where t.empresa_id = p_emp and (t.ativo or r.trabalhador_id is not null)
$$;

create or replace function public.fechar_entrada(p_fecho_id uuid, p_data date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.membros; d public.dias; v_res jsonb;
begin
  m := public._exigir('gerente');
  if p_data not in (public._hoje(), public._hoje() - 1) then raise exception 'Só pode fechar a entrada de hoje ou de ontem.'; end if;
  insert into public.dias(empresa_id, data) values (m.empresa_id, p_data) on conflict do nothing;
  select * into d from public.dias where empresa_id = m.empresa_id and data = p_data for update;
  if d.fechado_em is not null then return to_jsonb(d); end if; -- idempotente
  v_res := public._resumo(m.empresa_id, p_data);
  update public.dias set fecho_id = p_fecho_id, fechado_em = now(), fechado_por = m.user_id, resumo_fecho = v_res
   where empresa_id = m.empresa_id and data = p_data returning * into d;
  perform public._notificar(m.empresa_id, 'chefe', null, 'fecho', 'Entrada fechada',
    format('Entrada fechada — %s presentes, %s atrasados, %s faltas e %s por marcar.', v_res->>'presentes', v_res->>'atrasados', v_res->>'faltas', v_res->>'por_marcar'),
    'hoje', 'fecho:' || p_data);
  perform public._notificar(m.empresa_id, 'chefe', null, 'pronto', 'Dia pronto para aprovação',
    format('Reveja os registos de %s e aprove quando estiverem completos.', to_char(p_data,'DD/MM/YYYY')), 'visao', 'pronto:' || p_data);
  return to_jsonb(d);
end $$;

-- ============================================================ chefe: aprovar e corrigir
create or replace function public.aprovar_dia(p_data date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.membros; d public.dias;
begin
  m := public._exigir('chefe');
  select * into d from public.dias where empresa_id = m.empresa_id and data = p_data for update;
  if not found or d.fechado_em is null then raise exception 'O gerente ainda não fechou a entrada deste dia.'; end if;
  if d.aprovado_em is not null then return to_jsonb(d); end if; -- sem aprovações duplicadas
  update public.dias set aprovado_em = now(), aprovado_por = m.user_id, aprovado_por_nome = m.nome
   where empresa_id = m.empresa_id and data = p_data returning * into d;
  perform public._notificar(m.empresa_id, null, null, 'aprovado', format('Dia %s aprovado', to_char(p_data,'DD/MM/YYYY')),
    format('Aprovado por %s. Incluído no relatório mensal.', m.nome), 'relatorios', 'aprovado:' || p_data);
  update public.notificacoes set lida_em = now() where destinatario = m.user_id and chave = 'aprovado:' || p_data and lida_em is null;
  return to_jsonb(d);
end $$;

create or replace function public.corrigir_registo(p_trabalhador uuid, p_data date, p_estado text, p_entrada time, p_saida time, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.membros; t public.trabalhadores; r public.registos; d public.dias; v_mot text := trim(coalesce(p_motivo,''));
  v_aprov boolean; v_ant text; v_ch text[] := '{}'; v_desc text := '';
begin
  m := public._exigir('chefe');
  if char_length(v_mot) < 5 then raise exception 'Escreva o motivo da correcção (pelo menos 5 caracteres).'; end if;
  if p_estado not in ('presente','falta') then raise exception 'Situação inválida.'; end if;
  if p_data > public._hoje() then raise exception 'Não é possível corrigir dias futuros.'; end if;
  select * into t from public.trabalhadores where id = p_trabalhador and empresa_id = m.empresa_id;
  if not found then raise exception 'Trabalhador não encontrado.'; end if;
  insert into public.dias(empresa_id, data) values (m.empresa_id, p_data) on conflict do nothing;
  select * into d from public.dias where empresa_id = m.empresa_id and data = p_data for update;
  v_aprov := d.aprovado_em is not null;
  insert into public.registos(empresa_id, data, trabalhador_id) values (m.empresa_id, p_data, t.id) on conflict do nothing;
  select * into r from public.registos where empresa_id = m.empresa_id and data = p_data and trabalhador_id = t.id for update;
  v_ant := case when r.falta then 'Falta' when r.entrada is not null then 'Presente' else 'Por marcar' end;

  if p_estado = 'falta' then
    if r.falta then raise exception 'Os valores novos são iguais aos actuais. Não há nada para corrigir.'; end if;
    insert into public.auditoria(empresa_id, user_id, user_nome, trabalhador_id, data, campo, valor_anterior, valor_novo, motivo, registo_ref, apos_aprovacao)
    values (m.empresa_id, m.user_id, m.nome, t.id, p_data, 'Estado',
      v_ant || coalesce(' (entrada ' || to_char(r.entrada,'HH24:MI') || ')',''), 'Falta', v_mot, p_data || ':' || t.id, v_aprov);
    update public.registos set original = coalesce(original, to_jsonb(r) - 'original'), falta = true, nota = v_mot,
      entrada = null, almoco_saida = null, almoco_regresso = null, saida = null,
      campos_corrigidos = array(select distinct unnest(campos_corrigidos || array['Estado'])),
      corrigido_apos_aprovacao = corrigido_apos_aprovacao or v_aprov, versao = versao + 1, atualizado_em = now()
    where empresa_id = m.empresa_id and data = p_data and trabalhador_id = t.id returning * into r;
    v_desc := format('situação %s → Falta', v_ant);
  else
    if p_entrada is null then raise exception 'Indique a hora de entrada.'; end if;
    if p_saida is not null and p_saida <= p_entrada then raise exception 'A saída tem de ser depois da entrada.'; end if;
    if not r.falta and r.almoco_saida is not null and p_entrada >= r.almoco_saida then
      raise exception 'A entrada tem de ser antes da saída para almoço (%).', to_char(r.almoco_saida,'HH24:MI');
    end if;
    if not r.falta and p_saida is not null and r.almoco_regresso is not null and p_saida <= r.almoco_regresso then
      raise exception 'A saída tem de ser depois do regresso do almoço (%).', to_char(r.almoco_regresso,'HH24:MI');
    end if;
    if not r.falta and p_saida is null and r.almoco_saida is not null and r.saida is not null then
      raise exception 'Não é possível remover a saída por correcção. Indique a hora de saída correcta.';
    end if;
    if r.falta then v_ch := v_ch || array['Estado']; end if;
    if r.entrada is distinct from p_entrada then v_ch := v_ch || array['Entrada']; end if;
    if r.saida is distinct from p_saida then v_ch := v_ch || array['Saída']; end if;
    if cardinality(v_ch) = 0 then raise exception 'Os valores novos são iguais aos actuais. Não há nada para corrigir.'; end if;
    if 'Estado' = any(v_ch) then
      insert into public.auditoria(empresa_id, user_id, user_nome, trabalhador_id, data, campo, valor_anterior, valor_novo, motivo, registo_ref, apos_aprovacao)
      values (m.empresa_id, m.user_id, m.nome, t.id, p_data, 'Estado', 'Falta', 'Presente', v_mot, p_data || ':' || t.id, v_aprov);
      v_desc := 'situação Falta → Presente; ';
    end if;
    if 'Entrada' = any(v_ch) then
      insert into public.auditoria(empresa_id, user_id, user_nome, trabalhador_id, data, campo, valor_anterior, valor_novo, motivo, registo_ref, apos_aprovacao)
      values (m.empresa_id, m.user_id, m.nome, t.id, p_data, 'Entrada', coalesce(to_char(r.entrada,'HH24:MI'),'—'), to_char(p_entrada,'HH24:MI'), v_mot, p_data || ':' || t.id, v_aprov);
      v_desc := v_desc || format('entrada %s → %s; ', coalesce(to_char(r.entrada,'HH24:MI'),'—'), to_char(p_entrada,'HH24:MI'));
    end if;
    if 'Saída' = any(v_ch) then
      insert into public.auditoria(empresa_id, user_id, user_nome, trabalhador_id, data, campo, valor_anterior, valor_novo, motivo, registo_ref, apos_aprovacao)
      values (m.empresa_id, m.user_id, m.nome, t.id, p_data, 'Saída', coalesce(to_char(r.saida,'HH24:MI'),'—'), coalesce(to_char(p_saida,'HH24:MI'),'—'), v_mot, p_data || ':' || t.id, v_aprov);
      v_desc := v_desc || format('saída %s → %s; ', coalesce(to_char(r.saida,'HH24:MI'),'—'), coalesce(to_char(p_saida,'HH24:MI'),'—'));
    end if;
    update public.registos set original = coalesce(original, to_jsonb(r) - 'original'),
      falta = false, nota = case when r.falta then null else nota end,
      almoco_saida = case when r.falta then null else almoco_saida end,
      almoco_regresso = case when r.falta then null else almoco_regresso end,
      entrada = p_entrada, saida = p_saida,
      campos_corrigidos = array(select distinct unnest(campos_corrigidos || v_ch)),
      corrigido_apos_aprovacao = corrigido_apos_aprovacao or v_aprov, versao = versao + 1, atualizado_em = now()
    where empresa_id = m.empresa_id and data = p_data and trabalhador_id = t.id returning * into r;
    v_desc := rtrim(v_desc, '; ');
  end if;
  if v_aprov then update public.dias set corrigido_apos_aprovacao = true where empresa_id = m.empresa_id and data = p_data; end if;
  perform public._notificar(m.empresa_id, null, null, 'correcao', case when v_aprov then 'Correcção após aprovação' else 'Correcção efectuada' end,
    format('%s em %s: %s.', t.nome, to_char(p_data,'DD/MM/YYYY'), v_desc), 'alteracoes', null);
  update public.notificacoes set lida_em = now() where destinatario = m.user_id and tipo = 'correcao' and lida_em is null and criado_em > now() - interval '5 seconds';
  return to_jsonb(r);
end $$;

-- ============================================================ notificações
create or replace function public.marcar_notificacao_lida(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._membro();
  update public.notificacoes set lida_em = now() where id = p_id and destinatario = auth.uid() and lida_em is null;
end $$;
create or replace function public.marcar_todas_lidas()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._membro();
  update public.notificacoes set lida_em = now() where destinatario = auth.uid() and lida_em is null;
end $$;

-- ============================================================ permissões de execução
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.minha_empresa(), public.meu_perfil(), public.agora_servidor(),
  public.ativar_empresa(text,text,text),
  public.configurar_empresa(text,text,time,time,int,int,boolean,time,time,double precision,double precision,int,boolean,boolean),
  public.convidar_gerente(text,text), public.revogar_convite(uuid), public.aceitar_convite(text), public.definir_gerente_ativo(uuid,boolean),
  public.adicionar_trabalhador(text,text), public.editar_trabalhador(uuid,text,text), public.definir_trabalhador_ativo(uuid,boolean),
  public.registar_marcacao(uuid,uuid,text,timestamptz,double precision,double precision,real,text,boolean),
  public.fechar_entrada(uuid,date), public.aprovar_dia(date),
  public.corrigir_registo(uuid,date,text,time,time,text),
  public.marcar_notificacao_lida(uuid), public.marcar_todas_lidas()
to authenticated;
