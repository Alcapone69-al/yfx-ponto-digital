-- Testes das regras do servidor. Corre tudo dentro de uma transacção e termina com um erro
-- propositado que devolve o relatório e DESFAZ todos os dados de teste (nada fica gravado).
do $$
declare
  ca uuid := gen_random_uuid(); ga uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); gb uuid := gen_random_uuid(); intruso uuid := gen_random_uuid();
  ea uuid; eb uuid; w1 uuid; w2 uuid; w3 uuid; wb uuid; tok text; tokb text; op uuid := gen_random_uuid(); r jsonb; n int; n2 int;
  v_out text := ''; v_ok int := 0; v_fail int := 0; agora timestamptz := now(); lat0 double precision := -25.96530; lng0 double precision := 32.58920;
  procedure_name text;
begin
  -- utilitários dentro do bloco
  create temp table _res(nome text, ok boolean, info text) on commit drop;

  insert into auth.users(id, email, aud, role) values
    (ca,'chefe.a@teste.yfx','authenticated','authenticated'),(ga,'gerente.a@teste.yfx','authenticated','authenticated'),
    (cb,'chefe.b@teste.yfx','authenticated','authenticated'),(gb,'gerente.b@teste.yfx','authenticated','authenticated'),
    (intruso,'intruso@teste.yfx','authenticated','authenticated');
  insert into public.codigos_ativacao(codigo, plano, limite, notas) values ('TESTE-A','pequeno',3,'teste'),('TESTE-B','pequeno',15,'teste');

  -- ---------- empresa A ----------
  perform set_config('request.jwt.claims', json_build_object('sub',ca,'role','authenticated')::text, true);
  ea := public.ativar_empresa('teste-a','Empresa A','Chefe A');
  perform public.configurar_empresa('Empresa A','Maputo','07:00','20:00',10,480,true,'12:00','13:00',lat0,lng0,100,false,true);
  w1 := public.adicionar_trabalhador('Ana Cossa','Caixa');
  w2 := public.adicionar_trabalhador('Rui Tembe','Armazém');
  w3 := public.adicionar_trabalhador('Eva Bila','Limpeza');
  begin perform public.adicionar_trabalhador('Zé Quarto','Caixa'); insert into _res values('Limite do plano (3) é aplicado no servidor',false,'aceitou o 4.º');
  exception when others then insert into _res values('Limite do plano (3) é aplicado no servidor',sqlerrm like '%até 3 trabalhadores%',sqlerrm); end;
  tok := public.convidar_gerente('gerente.a@teste.yfx','Gerente A');

  -- convite aceite só pelo e-mail certo
  perform set_config('request.jwt.claims', json_build_object('sub',intruso,'role','authenticated')::text, true);
  begin perform public.aceitar_convite(tok); insert into _res values('Convite recusado para outro e-mail',false,'aceitou');
  exception when others then insert into _res values('Convite recusado para outro e-mail',sqlerrm like '%foi enviado para%',sqlerrm); end;
  begin perform public.ativar_empresa('TESTE-A','Outra','Intruso'); insert into _res values('Código de activação não pode ser reutilizado',false,'reutilizou');
  exception when others then insert into _res values('Código de activação não pode ser reutilizado',sqlerrm like '%inválido, já usado%',sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub',ga,'role','authenticated')::text, true);
  perform public.aceitar_convite(tok);
  insert into _res select 'Gerente associado à empresa pelo convite', perfil='gerente' and empresa_id=ea, perfil from public.membros where user_id=ga;

  -- ---------- empresa B ----------
  perform set_config('request.jwt.claims', json_build_object('sub',cb,'role','authenticated')::text, true);
  eb := public.ativar_empresa('TESTE-B','Empresa B','Chefe B');
  wb := public.adicionar_trabalhador('Bruno Langa','Caixa');
  tokb := public.convidar_gerente('gerente.b@teste.yfx','Gerente B');
  perform set_config('request.jwt.claims', json_build_object('sub',gb,'role','authenticated')::text, true);
  perform public.aceitar_convite(tokb);

  -- ---------- marcações (gerente A) ----------
  perform set_config('request.jwt.claims', json_build_object('sub',ga,'role','authenticated')::text, true);
  r := public.registar_marcacao(op, w1, 'entrada', agora - interval '9 minutes', lat0+0.0002, lng0, 12, null, false);
  insert into _res values('Entrada aceite e localização verificada', r->>'geo'='verificada' and (r->'registo'->>'entrada') is not null, r->>'geo');
  r := public.registar_marcacao(op, w1, 'entrada', agora - interval '9 minutes', lat0+0.0002, lng0, 12, null, false);
  select count(*) into n from public.marcacoes where id=op;
  insert into _res values('Mesmo id reenviado não duplica', (r->>'duplicada')::boolean and n=1, 'marcações com o id: '||n);

  begin perform public.registar_marcacao(gen_random_uuid(), w2, 'entrada', agora, lat0+0.01, lng0, 10, null, false); insert into _res values('Fora do raio é recusado',false,'aceitou');
  exception when others then insert into _res values('Fora do raio é recusado',sqlerrm like 'Está a cerca de % m do local%',sqlerrm); end;
  begin perform public.registar_marcacao(gen_random_uuid(), w2, 'entrada', agora, lat0, lng0, 400, null, false); insert into _res values('Precisão GPS insuficiente é recusada',false,'aceitou');
  exception when others then insert into _res values('Precisão GPS insuficiente é recusada',sqlerrm like 'A precisão do GPS%',sqlerrm); end;
  begin perform public.registar_marcacao(gen_random_uuid(), w2, 'entrada', agora + interval '20 minutes', lat0, lng0, 10, null, false); insert into _res values('Relógio adiantado é recusado',false,'aceitou');
  exception when others then insert into _res values('Relógio adiantado é recusado',sqlerrm like '%adiantada%',sqlerrm); end;
  begin perform public.registar_marcacao(gen_random_uuid(), w2, 'entrada', agora - interval '40 minutes', lat0, lng0, 10, null, false); insert into _res values('Hora antiga sem ser offline é recusada',false,'aceitou');
  exception when others then insert into _res values('Hora antiga sem ser offline é recusada',sqlerrm like '%atrasada%',sqlerrm); end;
  r := public.registar_marcacao(gen_random_uuid(), w2, 'entrada', agora - interval '40 minutes', null, null, null, null, true);
  select count(*) into n from public.marcacoes where trabalhador_id=w2 and offline and geo_estado='nao_verificada' and hora_servidor > hora_aparelho;
  insert into _res values('Marcação offline aceite, sem GPS fica não verificada, hora do servidor separada', n=1, r->>'geo');
  begin perform public.registar_marcacao(gen_random_uuid(), w2, 'entrada', agora - interval '3 minutes', lat0, lng0, 10, null, false); insert into _res values('Segunda entrada é conflito',false,'aceitou');
  exception when others then insert into _res values('Segunda entrada é conflito',sqlerrm like '%já não é permitida%',sqlerrm); end;
  begin perform public.registar_marcacao(gen_random_uuid(), w1, 'almoco_regresso', agora - interval '8 minutes', lat0, lng0, 10, null, false); insert into _res values('Regresso do almoço sem saída é recusado',false,'aceitou');
  exception when others then insert into _res values('Regresso do almoço sem saída é recusado',sqlerrm like '%já não é permitida%',sqlerrm); end;
  begin perform public.registar_marcacao(gen_random_uuid(), w1, 'almoco_saida', agora - interval '9 minutes', lat0, lng0, 10, null, false); insert into _res values('Hora igual ou anterior à última marcação é recusada',false,'aceitou');
  exception when others then insert into _res values('Hora igual ou anterior à última marcação é recusada',sqlerrm like '%anterior ou igual%',sqlerrm); end;
  perform public.registar_marcacao(gen_random_uuid(), w1, 'almoco_saida', agora - interval '6 minutes', lat0, lng0, 10, null, false);
  begin perform public.registar_marcacao(gen_random_uuid(), w1, 'saida', agora - interval '5 minutes', lat0, lng0, 10, null, false); insert into _res values('Saída durante o almoço é recusada',false,'aceitou');
  exception when others then insert into _res values('Saída durante o almoço é recusada',sqlerrm like '%já não é permitida%',sqlerrm); end;
  perform public.registar_marcacao(gen_random_uuid(), w1, 'almoco_regresso', agora - interval '3 minutes', lat0, lng0, 10, null, false);
  perform public.registar_marcacao(gen_random_uuid(), w1, 'saida', agora, lat0, lng0, 10, null, false);
  begin perform public.registar_marcacao(gen_random_uuid(), w1, 'saida', agora, lat0, lng0, 10, null, false); insert into _res values('Saída duplicada é recusada',false,'aceitou');
  exception when others then insert into _res values('Saída duplicada é recusada',sqlerrm like '%já não é permitida%',sqlerrm); end;
  r := public.registar_marcacao(gen_random_uuid(), w3, 'falta', agora, null, null, null, 'Doente, avisou por telefone', false);
  insert into _res values('Falta registada sem contar como entrada', (r->'registo'->>'falta')::boolean and (r->'registo'->>'entrada') is null, r->'registo'->>'nota');
  begin perform public.registar_marcacao(gen_random_uuid(), w3, 'entrada', agora, lat0, lng0, 10, null, false); insert into _res values('Entrada depois de falta é recusada ao gerente',false,'aceitou');
  exception when others then insert into _res values('Entrada depois de falta é recusada ao gerente',sqlerrm like '%já não é permitida%',sqlerrm); end;

  -- atraso: depende do horário (o servidor resume com a tolerância)
  update public.empresas set hora_inicio = (agora at time zone 'Africa/Maputo')::time - interval '2 hours', almoco_inicio='00:00', almoco_fim='23:58', hora_fim='23:59' where id=ea;
  r := public._resumo(ea, (agora at time zone 'Africa/Maputo')::date);
  insert into _res values('Entradas depois de início + tolerância contam como atraso', (r->>'atrasados')::int=2 and (r->>'presentes')::int=0 and (r->>'faltas')::int=1, r::text);
  update public.empresas set hora_inicio = (agora at time zone 'Africa/Maputo')::time - interval '20 minutes' where id=ea;
  r := public._resumo(ea, (agora at time zone 'Africa/Maputo')::date);
  insert into _res values('Entrada dentro da tolerância é pontual', (r->>'presentes')::int=1 and (r->>'atrasados')::int=1, r::text);

  -- gerente não pode fazer operações do chefe
  begin perform public.corrigir_registo(w1, (agora at time zone 'Africa/Maputo')::date, 'presente', '07:00', null, 'tentativa do gerente'); insert into _res values('Gerente não pode corrigir',false,'corrigiu');
  exception when others then insert into _res values('Gerente não pode corrigir',sqlerrm like 'Sem permissão%',sqlerrm); end;
  begin perform public.aprovar_dia((agora at time zone 'Africa/Maputo')::date); insert into _res values('Gerente não pode aprovar',false,'aprovou');
  exception when others then insert into _res values('Gerente não pode aprovar',sqlerrm like 'Sem permissão%',sqlerrm); end;
  begin perform public.adicionar_trabalhador('Gil Mabote','Caixa'); insert into _res values('Gerente não pode gerir trabalhadores',false,'adicionou');
  exception when others then insert into _res values('Gerente não pode gerir trabalhadores',sqlerrm like 'Sem permissão%',sqlerrm); end;
  -- isolamento: trabalhador de outra empresa
  begin perform public.registar_marcacao(gen_random_uuid(), wb, 'entrada', agora, lat0, lng0, 10, null, false); insert into _res values('Gerente A não marca trabalhador da empresa B',false,'marcou');
  exception when others then insert into _res values('Gerente A não marca trabalhador da empresa B',sqlerrm like 'Trabalhador não encontrado%',sqlerrm); end;

  -- aprovação antes do fecho
  perform set_config('request.jwt.claims', json_build_object('sub',ca,'role','authenticated')::text, true);
  begin perform public.aprovar_dia((agora at time zone 'Africa/Maputo')::date); insert into _res values('Aprovação bloqueada antes do fecho',false,'aprovou');
  exception when others then insert into _res values('Aprovação bloqueada antes do fecho',sqlerrm like '%ainda não fechou%',sqlerrm); end;
  -- fecho idempotente
  perform set_config('request.jwt.claims', json_build_object('sub',ga,'role','authenticated')::text, true);
  perform public.fechar_entrada(gen_random_uuid(), (agora at time zone 'Africa/Maputo')::date);
  perform public.fechar_entrada(gen_random_uuid(), (agora at time zone 'Africa/Maputo')::date);
  select count(*) into n from public.notificacoes where destinatario=ca and tipo in ('fecho','pronto');
  insert into _res values('Fechar a entrada duas vezes não duplica fecho nem notificações', n=2, 'notificações: '||n);

  -- correcções do chefe
  perform set_config('request.jwt.claims', json_build_object('sub',ca,'role','authenticated')::text, true);
  begin perform public.corrigir_registo(w2, (agora at time zone 'Africa/Maputo')::date, 'presente', '07:00', null, '   '); insert into _res values('Correcção sem motivo é recusada',false,'aceitou');
  exception when others then insert into _res values('Correcção sem motivo é recusada',sqlerrm like '%motivo%',sqlerrm); end;
  begin perform public.corrigir_registo(w1, (agora at time zone 'Africa/Maputo')::date, 'presente', '07:00', '06:00', 'saída antes da entrada'); insert into _res values('Correcção com saída antes da entrada é recusada',false,'aceitou');
  exception when others then insert into _res values('Correcção com saída antes da entrada é recusada',sqlerrm like '%depois da entrada%',sqlerrm); end;
  r := public.corrigir_registo(w3, (agora at time zone 'Africa/Maputo')::date, 'presente', '07:05', null, 'Afinal veio trabalhar, confirmado por telefone');
  select count(*) into n from public.auditoria where trabalhador_id=w3;
  insert into _res values('Correcção cria auditoria por campo e guarda o original', n=2 and (r->'original'->>'falta')::boolean and (r->>'campos_corrigidos') like '%Estado%', 'linhas de auditoria: '||n);
  select count(*) into n from public.marcacoes where trabalhador_id=w3;
  insert into _res values('Marcação original do gerente continua guardada', n=1, 'marcações: '||n);

  -- aprovação e alterações depois de aprovar
  r := public.aprovar_dia((agora at time zone 'Africa/Maputo')::date);
  r := public.aprovar_dia((agora at time zone 'Africa/Maputo')::date);
  select count(*) into n from public.notificacoes where empresa_id=ea and tipo='aprovado';
  insert into _res values('Aprovar duas vezes não duplica', n=2, 'notificações de aprovação (chefe+gerente): '||n);
  perform set_config('request.jwt.claims', json_build_object('sub',ga,'role','authenticated')::text, true);
  begin perform public.registar_marcacao(gen_random_uuid(), w2, 'almoco_saida', agora, lat0, lng0, 10, null, false); insert into _res values('Gerente não marca num dia aprovado',false,'marcou');
  exception when others then insert into _res values('Gerente não marca num dia aprovado',sqlerrm like '%já foi aprovado%',sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub',ca,'role','authenticated')::text, true);
  r := public.corrigir_registo(w2, (agora at time zone 'Africa/Maputo')::date, 'presente', '07:30', null, 'Correcção depois de aprovar');
  select count(*) into n from public.dias where empresa_id=ea and corrigido_apos_aprovacao;
  select count(*) into n2 from public.auditoria where trabalhador_id=w2 and apos_aprovacao;
  insert into _res values('Correcção após aprovação fica identificada', n=1 and n2=1 and (r->>'corrigido_apos_aprovacao')::boolean, n||'/'||n2);

  -- auditoria e marcações imutáveis (mesmo para o dono da base de dados)
  begin update public.auditoria set motivo='apagado' where trabalhador_id=w3; insert into _res values('Auditoria não pode ser alterada',false,'alterou');
  exception when others then insert into _res values('Auditoria não pode ser alterada',sqlerrm like 'Registo imutável%',sqlerrm); end;
  begin delete from public.marcacoes where trabalhador_id=w1; insert into _res values('Marcações não podem ser apagadas',false,'apagou');
  exception when others then insert into _res values('Marcações não podem ser apagadas',sqlerrm like 'Registo imutável%',sqlerrm); end;

  -- RLS: o que cada utilizador consegue ler e escrever directamente pela API (resultados guardados em variáveis)
  declare a1 int; a2 int; a3 int; a4 int; a5 int; a6 int; dir text := 'nada'; cod text := 'nada';
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub',ca,'role','authenticated')::text, true);
    select count(*) into a1 from public.trabalhadores; select count(*) into a2 from public.trabalhadores where empresa_id=eb;
    select count(*) into a3 from public.registos where empresa_id=eb; select count(*) into a4 from public.auditoria where empresa_id=eb;
    select count(*) into a5 from public.convites;
    begin insert into public.registos(empresa_id,data,trabalhador_id,entrada) values (ea,current_date,w1,'06:00'); dir:='inseriu';
    exception when others then dir:=sqlerrm; end;
    begin update public.registos set entrada='06:00' where trabalhador_id=w1; get diagnostics a6 = row_count; dir:=dir||' | update: '||a6||' linhas';
    exception when others then dir:=dir||' | update: '||sqlerrm; end;
    perform set_config('request.jwt.claims', json_build_object('sub',ga,'role','authenticated')::text, true);
    select count(*) into a6 from public.convites;
    begin perform 1 from public.codigos_ativacao limit 1; cod:='leu'; exception when others then cod:=sqlerrm; end;
    execute 'reset role';
    insert into _res values('Chefe A só vê os trabalhadores da empresa A', a1=3 and a2=0, a1||' vistos, '||a2||' da B');
    insert into _res values('Chefe A não lê registos nem auditoria da empresa B', a3=0 and a4=0, a3||'/'||a4);
    insert into _res values('Chefe vê os convites da sua empresa', a5=1, a5::text);
    insert into _res values('Gerente não vê convites', a6=0, a6::text);
    insert into _res values('Escrita directa nas tabelas é recusada (só pelas funções)', dir like '%permission denied%' and dir like '%update: permission denied%', dir);
    insert into _res values('Ninguém lê os códigos de activação pela API', cod like '%permission denied%', cod);
  end;

  select string_agg(case when ok then 'OK     ' else 'FALHOU ' end || nome || coalesce(' — '||left(info,140),''), E'\n' order by ctid), count(*) filter (where ok), count(*) filter (where not ok)
    into v_out, v_ok, v_fail from _res;
  raise exception E'RELATORIO % passaram, % falharam\n%', v_ok, v_fail, v_out;
end $$;
