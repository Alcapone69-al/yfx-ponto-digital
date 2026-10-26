/* YFX Ponto Digital — aplicação ligada ao Supabase */
"use strict";
const CONF=window.PONTO_CONFIG;
const sb=supabase.createClient(CONF.url,CONF.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

/* ============================== utilidades ============================== */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const toMin=t=>{if(!t)return null;const[h,m]=t.split(":").map(Number);return h*60+m};
const hm=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const hhmm=t=>t?t.slice(0,5):undefined;
const dur=m=>m==null?"—":`${Math.floor(m/60)}h${pad(m%60)}`;
const uuid=()=>crypto.randomUUID?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
const ic=n=>`<i data-lucide="${n}"></i>`;
const icons=()=>{try{window.lucide&&lucide.createIcons({attrs:{"stroke-width":1.9}})}catch(e){}};
const pl=(n,s,p)=>`${n} ${n===1?s:p}`;
const DOW=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const fmtD=k=>{const[y,m,d]=k.split("-");return `${d}/${m}/${y}`};
const dowOf=k=>new Date(k+"T12:00:00Z").getUTCDay();
const longD=k=>`${DOW[dowOf(k)]}, ${fmtD(k)}`;
const ini=n=>String(n||"?").split(" ").filter(Boolean).map(p=>p[0]).slice(0,2).join("").toUpperCase();
const FMT=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Maputo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const local=d=>{const p=FMT.formatToParts(d),g=t=>p.find(x=>x.type===t).value;return{k:`${g("year")}-${g("month")}-${g("day")}`,hm:`${g("hour")}:${g("minute")}`}};
const HOJE=()=>local(new Date()).k;
const AGORA=()=>local(new Date()).hm;
const quando=ts=>{const l=local(new Date(ts));return{k:l.k,hm:l.hm,txt:`${fmtD(l.k)} ${l.hm}`}};
const addDias=(k,n)=>{const d=new Date(k+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const fimMes=m=>{const[y,mm]=m.split("-").map(Number);return `${m}-${pad(new Date(Date.UTC(y,mm,0)).getUTCDate())}`};
const LOGO=`<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="ga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E3A8A"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient><linearGradient id="gb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0891B2"/><stop offset="1" stop-color="#22D3EE"/></linearGradient><linearGradient id="gc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D4ED8"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs><polygon points="4,6 30,6 32,30 20,34" fill="url(#ga)"/><polygon points="34,6 60,6 44,34 32,30" fill="url(#gb)"/><polygon points="20,34 32,30 44,34 38,58 26,58" fill="url(#gc)"/></svg>`;
const msgErro=e=>{const m=e&&(e.message||e.msg)||"";if(/fetch|network|Load failed/i.test(m))return"Sem ligação ao servidor. Verifique a internet e tente novamente.";return m||"Ocorreu um erro inesperado. Tente novamente."};
async function rpc(fn,args){let r;try{r=await sb.rpc(fn,args)}catch(e){e.status=0;throw e}const{data,error,status}=r;if(error){error.status=status;throw error}return data}

/* ============================== tema ============================== */
let TEMA="sistema";try{TEMA=localStorage.getItem("yfx-ponto-tema")||"sistema"}catch(e){}
function aplicarTema(){const r=document.documentElement;if(TEMA==="claro")r.setAttribute("data-theme","light");else if(TEMA==="escuro")r.setAttribute("data-theme","dark");else r.removeAttribute("data-theme")}
aplicarTema();

/* ============================== estado ============================== */
const PLANOS={pequeno:"Pequeno",medio:"Médio",grande:"Grande"};
const MAP_T={entrada:"entrada",almoco_saida:"almS",almoco_regresso:"almR",saida:"saida",falta:"falta"};
const MAP_DB={entrada:"entrada",almS:"almoco_saida",almR:"almoco_regresso",saida:"saida",falta:"falta"};
let S=novoEstado();
function novoEstado(){return{srv:{},marc:{},user:null,membro:null,cfg:null,ws:[],days:{},carregado:{},audit:[],notifs:[],membros:[],convites:[],view:null,q:{},f:{hoje:"todos",alt:"tudo",altW:""},rep:{mes:null,w:"",estado:""},lastSync:null,syncing:false,offsetMin:0,filaErro:null}}
function mapCfg(e){return{id:e.id,nome:e.nome,morada:e.morada||"",lat:e.lat,lng:e.lng,raio:e.raio,exigirGps:e.exigir_gps,ini:hhmm(e.hora_inicio),fim:hhmm(e.hora_fim),tol:e.tolerancia,almoco:e.almoco,almIni:hhmm(e.almoco_inicio),almFim:hhmm(e.almoco_fim),previsto:e.minutos_previstos,plano:{nome:PLANOS[e.plano],limite:e.limite_trabalhadores},configurada:e.configurada,subscricao:e.subscricao_estado,criado:quando(e.criado_em).k}}
function mapRec(r){
  const o={entrada:hhmm(r.entrada),almS:hhmm(r.almoco_saida),almR:hhmm(r.almoco_regresso),saida:hhmm(r.saida),falta:r.falta,nota:r.nota||"",geo:{},corr:{},corrApos:r.corrigido_apos_aprovacao};
  for(const t in r.geo||{})o.geo[MAP_T[t]]=r.geo[t]==="verificada"?"ok":"nv";
  for(const c of r.campos_corrigidos||[])o.corr[c]=true;
  if(r.original){const x=r.original;o.orig={entrada:hhmm(x.entrada),saida:hhmm(x.saida),falta:x.falta}}
  for(const k in o)if(o[k]===undefined)delete o[k];
  return o;
}
function mapDia(d){const day=S.days[d.data]||(S.days[d.data]={recs:{}});
  day.fecho=d.fechado_em?{hora:quando(d.fechado_em).hm,sync:true}:null;
  day.aprovado=d.aprovado_em?{hora:quando(d.aprovado_em).hm,por:d.aprovado_por_nome}:null;
  day.corrApos=d.corrigido_apos_aprovacao;day.resumo=d.resumo_fecho;}
const mapAudit=a=>{const q=quando(a.criado_em);return{id:a.id,quando:q.txt,quandoK:q.k,por:a.user_nome,wid:a.trabalhador_id,data:a.data,campo:a.campo,antes:a.valor_anterior,depois:a.valor_novo,motivo:a.motivo,registo:a.registo_ref,apos:a.apos_aprovacao}};
const mapNotif=n=>({id:n.id,tipo:n.tipo,titulo:n.titulo,desc:n.descricao,quando:quando(n.criado_em).txt,lida:!!n.lida_em,link:n.link?{v:n.link}:null});
const dia=k=>S.days[k]||(S.days[k]={recs:{},fecho:null,aprovado:null});

/* ============================== carregamento ============================== */
async function buscarTudo(build){const out=[];for(let i=0;;i+=1000){const{data,error}=await build().range(i,i+999);if(error)throw error;out.push(...data);if(data.length<1000)break}return out}
async function carregarBase(){
  const uid=S.user.id;
  const{data:m,error}=await sb.from("membros").select("*").eq("user_id",uid).maybeSingle();if(error)throw error;
  S.membro=m;if(!m||!m.ativo)return;
  S.role=m.perfil;
  const{data:e,error:e2}=await sb.from("empresas").select("*").eq("id",m.empresa_id).single();if(e2)throw e2;
  S.cfg=mapCfg(e);
  await carregarTrabalhadores();
  if(S.role==="chefe")await carregarEquipa();
  try{const t=await rpc("agora_servidor");S.offsetMin=Math.round((Date.now()-new Date(t).getTime())/60000)}catch(e){}
}
async function carregarTrabalhadores(){const{data,error}=await sb.from("trabalhadores").select("*").order("nome");if(error)throw error;
  S.ws=data.map(w=>({id:w.id,nome:w.nome,funcao:w.funcao,ativo:w.ativo,criado:quando(w.criado_em).k}))}
async function carregarEquipa(){
  const[a,b]=await Promise.all([sb.from("membros").select("*").order("criado_em"),sb.from("convites").select("*").is("aceite_em",null).is("revogado_em",null).gt("expira_em",new Date().toISOString()).order("criado_em",{ascending:false})]);
  if(a.error)throw a.error;if(b.error)throw b.error;S.membros=a.data;S.convites=b.data;
}
// S.srv guarda o estado confirmado pelo servidor; S.days[k].recs = servidor + operações ainda não enviadas deste aparelho
async function carregarPeriodo(de,ate,comMarcacoes){
  const pedidos=[buscarTudo(()=>sb.from("dias").select("*").gte("data",de).lte("data",ate).order("data")),
    buscarTudo(()=>sb.from("registos").select("*").gte("data",de).lte("data",ate).order("data"))];
  if(comMarcacoes)pedidos.push(buscarTudo(()=>sb.from("marcacoes").select("id,trabalhador_id,data,tipo,hora_aparelho,hora_servidor,geo_estado,distancia,precisao,offline").gte("data",de).lte("data",ate).order("hora_aparelho")));
  const[ds,rs,ms]=await Promise.all(pedidos);
  for(let k=de;k<=ate;k=addDias(k,1)){S.srv[k]={};if(comMarcacoes)S.marc[k]={}}
  for(const d of ds)mapDia(d);
  for(const r of rs)S.srv[r.data][r.trabalhador_id]=mapRec(r);
  if(ms)for(const m of ms)(S.marc[m.data][m.trabalhador_id]||(S.marc[m.data][m.trabalhador_id]=[])).push(m);
  for(let k=de;k<=ate;k=addDias(k,1))dia(k);
  aplicarFila();
}
async function garantirMes(m){if(S.carregado[m])return;await carregarPeriodo(`${m}-01`,fimMes(m)<HOJE()?fimMes(m):HOJE());S.carregado[m]=true}
async function carregarAuditoria(){const{data,error}=await sb.from("auditoria").select("*").order("criado_em",{ascending:false}).limit(300);if(error)throw error;S.audit=data.map(mapAudit)}
async function carregarNotifs(){if(S.role!=="chefe"){S.notifs=[];return}const{data,error}=await sb.from("notificacoes").select("*").order("criado_em",{ascending:false}).limit(100);if(error)throw error;S.notifs=data.map(mapNotif)}
async function guardarCopiaLocal(){
  if(!S.user||!S.cfg)return;const k=HOJE();
  try{await PontoOffline.Cache.guardar(`copia:${S.user.id}`,{membro:S.membro,cfg:S.cfg,ws:S.ws,k,dia:{fecho:S.days[k]?.fecho||null,aprovado:S.days[k]?.aprovado||null},srv:S.srv[k]||{},marc:S.marc[k]||{},audit:S.audit.slice(0,20),lastSync:S.lastSync,offsetMin:S.offsetMin})}catch(e){}
}
async function actualizar(silencioso){
  if(!S.membro||S.syncing)return;
  if(!navigator.onLine){aplicarFila();renderAll();return}
  S.syncing=true;if(!silencioso)renderChrome();
  try{
    await sincronizarFila();
    const k=HOJE();
    await Promise.all([carregarPeriodo(addDias(k,-1),k,true),carregarAuditoria(),carregarNotifs(),carregarTrabalhadores()]);
    S.lastSync=AGORA();S.erroSync=null;S.copiaLocal=null;
    guardarCopiaLocal();
  }catch(e){S.erroSync=msgErro(e)}
  finally{S.syncing=false;await recarregarFila();aplicarFila();renderAll()}
}

/* ============================== fila offline (IndexedDB) ============================== */
let FILA=[];const RESP={};
const filaActiva=()=>FILA.filter(o=>o.estado==="pendente"||o.estado==="a_enviar");
const filaParada=()=>FILA.filter(o=>o.estado==="conflito"||o.estado==="recusada");
async function recarregarFila(){try{FILA=S.user?await PontoOffline.Fila.listar(S.user.id):[]}catch(e){FILA=[];S.erroLocal=msgErro(e)}}
function aplicarFila(){
  // reconstrói a vista: servidor primeiro, depois as operações deste aparelho ainda não aceites (marcadas como "pend")
  for(const k in S.srv){const d=dia(k);d.recs={};for(const w in S.srv[k])d.recs[w]=JSON.parse(JSON.stringify(S.srv[k][w]))}
  for(const o of filaActiva()){
    if(o.tipo==="fecho"){const d=dia(o.data);if(!d.fecho)d.fecho={hora:o.hora_local,sync:false};continue}
    const d=dia(o.data),r=d.recs[o.wid]||(d.recs[o.wid]={geo:{},corr:{}});
    const t=MAP_T[o.args.p_tipo];
    if(t==="falta"){r.falta=true;r.nota=o.args.p_nota||""}else if(!r[t])r[t]=o.hora_local;
    r.pend=r.pend||{};r.pend[t]=o.id;r.geo=r.geo||{};r.geo[t]=o.args.p_lat==null?"nv":"local";
  }
}
async function enviarOperacao(o){
  if(o.tipo==="fecho")return rpc("fechar_entrada",{p_fecho_id:o.id,p_data:o.data});
  const a={...o.args};
  // marcações enviadas mais de 1 minuto depois de feitas são tratadas como "feitas sem ligação"
  a.p_offline=o.criadoOffline||Date.now()-Date.parse(a.p_hora_aparelho)>60000;
  return rpc("registar_marcacao",a);
}
async function sincronizarFila(){
  if(!S.user||S.role!=="gerente")return;
  await recarregarFila();if(!filaActiva().length)return;
  for(let i=0;i<10;i++){
    const r=await PontoOffline.sincronizar(S.user.id,async o=>{const x=await enviarOperacao(o);RESP[o.id]=x;return x},async(o,ev)=>{await recarregarFila();
      if(ev==="conflito"||ev==="recusada")toast(`${o.tipo==="fecho"?"O fecho da entrada":"Uma marcação"} foi recusado pelo servidor. Veja em Registos.`,"bad");
      renderChrome()});
    if(!r||!r.ocupado)break;await new Promise(z=>setTimeout(z,400));
  }
  await recarregarFila();
}
setInterval(()=>{if(S.user&&S.role==="gerente"&&navigator.onLine&&filaActiva().length&&!S.syncing)sincronizarFila().then(()=>actualizar(true))},15000);
addEventListener("online",()=>{renderAll();if(S.copiaLocal)arrancar(true);else actualizar()});
addEventListener("offline",()=>renderAll());
document.addEventListener("visibilitychange",()=>{if(!document.hidden)actualizar(true)});
setInterval(()=>{if(!document.hidden&&S.membro&&!S.copiaLocal)actualizar(true)},25000);

/* ============================== regras de apresentação ============================== */
const W=id=>S.ws.find(w=>w.id===id)||{id,nome:"Trabalhador removido",funcao:"",ativo:false,criado:HOJE()};
const isLate=r=>!!(r&&r.entrada&&toMin(r.entrada)>toMin(S.cfg.ini)+S.cfg.tol);
function verRec(k,wid){return S.days[k]?.recs[wid]||null}
function estado(r){if(!r||(!r.entrada&&!r.falta))return"pend";if(r.falta)return"falta";if(r.saida)return"saiu";return isLate(r)?"atrasado":"presente"}
const EST={pend:["Por marcar","c-idle"],presente:["Presente","c-ok"],atrasado:["Atrasado","c-warn"],falta:["Falta","c-bad"],saiu:["Saiu","c-info"]};
function trabalhadoresDo(k){const d=S.days[k];if(k<HOJE())return S.ws.filter(w=>d&&d.recs[w.id]&&(d.recs[w.id].entrada||d.recs[w.id].falta));return S.ws.filter(w=>w.ativo||(d&&d.recs[w.id]))}
function contar(k){
  const c={presentes:0,atrasados:0,faltas:0,pend:0,sairam:0,total:0};
  for(const w of trabalhadoresDo(k)){c.total++;const r=verRec(k,w.id);
    if(!r||(!r.entrada&&!r.falta))c.pend++;else if(r.falta)c.faltas++;else{isLate(r)?c.atrasados++:c.presentes++;if(r.saida)c.sairam++}}
  return c;
}
function calc(r){
  if(!r||(!r.entrada&&!r.falta))return{tipo:"sem"};
  if(r.falta)return{tipo:"falta"};
  const late=isLate(r);
  if(!r.saida)return{tipo:"incompleto",late,motivo:"Sem saída"};
  let alm=0;
  if(S.cfg.almoco&&r.almS){if(!r.almR)return{tipo:"incompleto",late,motivo:"Almoço sem regresso"};alm=toMin(r.almR)-toMin(r.almS)}
  const t=toMin(r.saida)-toMin(r.entrada)-alm;
  if(t<0)return{tipo:"incompleto",late,motivo:"Horas inconsistentes"};
  return{tipo:"ok",late,trab:t,extra:Math.max(0,t-S.cfg.previsto)};
}
function accoesPermitidas(r){
  if(!r||(!r.entrada&&!r.falta))return["entrada","falta"];
  if(r.falta||r.saida)return[];
  const a=[];
  if(S.cfg.almoco&&!r.almS)a.push("almS");
  if(r.almS&&!r.almR)return["almR"];
  a.push("saida");return a;
}
const ACC={entrada:["Marcar entrada","log-in"],almS:["Saída para almoço","utensils"],almR:["Regresso do almoço","utensils-crossed"],saida:["Marcar saída","log-out"],falta:["Marcar falta","user-x"]};
const geoTxt=g=>g==="ok"?"Localização verificada":g==="ok?"?"Localização a validar no envio":"Localização não verificada";

/* ============================== acções ============================== */
// Cada marcação é gravada primeiro no IndexedDB (com id único) e só depois enviada.
// Se a resposta se perder, o reenvio com o mesmo id não duplica nada no servidor.
async function marcar(wid,tipo,nota,opts={}){
  const k=HOJE(),r=verRec(k,wid);
  if(dia(k).aprovado)throw{message:"O dia já foi aprovado pelo chefe. Só o chefe pode corrigir registos."};
  if(!accoesPermitidas(r).includes(tipo))throw{message:"Esta acção já não está disponível para este trabalhador."};
  let g;
  if(opts.semGps)g={estado:"dispensada"};
  else{
    g=await PontoOffline.obterLocalizacao(S.cfg.lat!=null?{lat:S.cfg.lat,lng:S.cfg.lng,raio:S.cfg.raio}:null);
    if(tipo==="falta"&&!(g.estado==="ok"&&!g.imprecisa&&!g.fora)){ // a falta não depende do sítio onde o gerente está
      if(S.cfg.exigirGps)throw{message:g.estado==="ok"?"Esta empresa exige localização verificada no local da empresa.":PontoOffline.MENSAGEM_GPS[g.estado]};
      g={estado:"dispensada"};
    }
    if(g.estado==="ok"&&g.imprecisa)throw{gps:"imprecisa",g,message:`A precisão do GPS (±${g.acc} m) é insuficiente para o raio de ${S.cfg.raio} m. Vá para um local aberto, espere uns segundos e tente novamente.`};
    if(g.estado==="ok"&&g.fora)throw{gps:"fora",g,message:`Está a cerca de ${g.dist} m do local da empresa (limite ${S.cfg.raio} m, precisão ±${g.acc} m). Aproxime-se e tente novamente.`};
    if(g.estado!=="ok")throw{gps:g.estado,g,message:PontoOffline.MENSAGEM_GPS[g.estado]};
  }
  const usar=g.estado==="ok",agora=new Date(),id=uuid();
  const op={id,utilizador:S.user.id,empresa:S.cfg.id,tipo:"marcacao",data:k,wid,hora_local:local(agora).hm,criadoOffline:!navigator.onLine,
    geo:{estado:g.estado,acc:g.acc,dist:g.dist},
    args:{p_id:id,p_trabalhador:wid,p_tipo:MAP_DB[tipo],p_hora_aparelho:agora.toISOString(),p_lat:usar?g.lat:null,p_lng:usar?g.lng:null,p_precisao:usar?g.acc:null,p_nota:nota||null,p_offline:false}};
  await PontoOffline.Fila.adicionar(op);
  await recarregarFila();aplicarFila();
  if(!navigator.onLine)return{fila:true,g};
  return enviarAgora(op,g);
}
async function enviarAgora(op,g){
  await sincronizarFila();
  const ainda=FILA.find(x=>x.id===op.id);
  if(!ainda){const res=RESP[op.id];delete RESP[op.id];await actualizar(true);return{fila:false,g,srv:res&&res.geo,dup:res&&res.duplicada}}
  if(ainda.estado==="conflito"||ainda.estado==="recusada"){ // o gerente está a ver o painel: mostra o motivo e não deixa a operação parada
    await PontoOffline.Fila.remover(op.id);await recarregarFila();aplicarFila();throw{message:ainda.erro}}
  return{fila:true,g};
}
async function fecharEntrada(){
  const k=HOJE(),d=dia(k);if(d.fecho)return"ja";
  const id=uuid();
  await PontoOffline.Fila.adicionar({id,utilizador:S.user.id,empresa:S.cfg.id,tipo:"fecho",data:k,hora_local:AGORA(),criadoOffline:!navigator.onLine});
  await recarregarFila();aplicarFila();
  if(!navigator.onLine)return"fila";
  await sincronizarFila();
  const ainda=FILA.find(x=>x.id===id);
  if(!ainda){await actualizar(true);return"ok"}
  if(ainda.estado==="conflito"||ainda.estado==="recusada"){await PontoOffline.Fila.remover(id);await recarregarFila();aplicarFila();throw{message:ainda.erro}}
  return"fila";
}

/* ============================== UI base ============================== */
function toast(msg,kind){const t=document.createElement("div");t.className="toast"+(kind==="bad"?" bad":"");t.innerHTML=`${ic(kind==="bad"?"circle-alert":"circle-check")}<span>${esc(msg)}</span>`;$("#toasts").appendChild(t);icons();setTimeout(()=>t.remove(),kind==="bad"?6000:3200)}
let lastFocus=null;
function abrir(title,body,sub){
  lastFocus=document.activeElement;
  $("#layer").innerHTML=`<div class="scrim" data-a="fecharp-scrim"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="ptitle"><div class="grab"></div>
  <div class="panel-h">${sub||""}<h2 id="ptitle" tabindex="-1">${title}</h2><button class="x" data-a="fecharp" aria-label="Fechar">${ic("x")}</button></div>
  <div class="panel-b" id="pbody">${body}</div></div></div>`;
  icons();setTimeout(()=>$("#ptitle")?.focus(),20);
}
function fecharPainel(){$("#layer").innerHTML="";lastFocus?.focus?.()}
async function carregar(btn,fn){btn.classList.add("loading");btn.disabled=true;try{return await fn()}finally{if(btn.isConnected){btn.classList.remove("loading");btn.disabled=false}}}
const empty=(icon,t,d,extra="")=>`<div class="empty"><span class="ei">${ic(icon)}</span><b>${t}</b><span>${d}</span>${extra}</div>`;
const chip=(t,c,i)=>`<span class="chip ${c}">${i?ic(i):""}${t}</span>`;
const avatar=w=>`<span class="av">${ini(w.nome)}</span>`;
const erroHTML=m=>`<p class="err">${ic("circle-alert")}${esc(m)}</p>`;
function mostrarErro(sel,e){const el=$(sel);if(el){el.innerHTML=erroHTML(msgErro(e));icons()}else toast(msgErro(e),"bad")}
async function copiar(txt,inp){try{await navigator.clipboard.writeText(txt);toast("Ligação copiada")}catch(e){if(inp){inp.select();toast("Seleccionado. Copie com Ctrl+C ou mantenha premido.")}}}

/* ============================== autenticação ============================== */
function ecraAuth(modo,msg){
  const m=modo||"entrar";
  const conv=pendConvite();
  const topo=`<div class="brandmark">${LOGO}<div><b>YFX Ponto Digital</b><small>O seu gerente marca, você controla de onde estiver.</small></div></div>`;
  let corpo="";
  if(m==="entrar")corpo=`<div><h1>Entrar</h1>${conv?`<p style="color:var(--muted);margin:6px 0 0;font-size:14px">Tem um convite pendente. Entre ou crie conta com o e-mail que recebeu o convite.</p>`:""}</div>
    <form id="f-entrar" class="sec" novalidate><div class="fld"><label for="a-email">E-mail</label><input class="inp" id="a-email" type="email" autocomplete="email" required></div>
    <div class="fld"><label for="a-pass">Palavra-passe</label><input class="inp" id="a-pass" type="password" autocomplete="current-password" required></div>
    <div id="a-err">${msg?`<div class="ban ok">${ic("info")}<div>${esc(msg)}</div></div>`:""}</div><button class="btn pri" type="submit">${ic("log-in")}Entrar</button></form>
    <div class="auth-links"><button class="link" data-a="auth" data-m="registar">Criar conta</button><button class="link" data-a="auth" data-m="recuperar">Esqueci-me da palavra-passe</button></div>`;
  if(m==="registar")corpo=`<div><h1>Criar conta</h1><p style="color:var(--muted);margin:6px 0 0;font-size:14px">Depois de criar a conta, active a empresa com o código da YFX ou aceite o convite do seu chefe.</p></div>
    <form id="f-registar" class="sec" novalidate><div class="fld"><label for="r-nome">O seu nome</label><input class="inp" id="r-nome" autocomplete="name" required></div>
    <div class="fld"><label for="r-email">E-mail</label><input class="inp" id="r-email" type="email" autocomplete="email" required></div>
    <div class="fld"><label for="r-pass">Palavra-passe</label><input class="inp" id="r-pass" type="password" autocomplete="new-password" minlength="8" required><small>Pelo menos 8 caracteres.</small></div>
    <div id="a-err"></div><button class="btn pri" type="submit">${ic("user-plus")}Criar conta</button></form>
    <button class="link" data-a="auth" data-m="entrar">Já tenho conta</button>`;
  if(m==="recuperar")corpo=`<div><h1>Recuperar acesso</h1><p style="color:var(--muted);margin:6px 0 0;font-size:14px">Enviamos uma ligação para definir uma nova palavra-passe.</p></div>
    <form id="f-recuperar" class="sec" novalidate><div class="fld"><label for="p-email">E-mail</label><input class="inp" id="p-email" type="email" autocomplete="email" required></div>
    <div id="a-err"></div><button class="btn pri" type="submit">${ic("mail")}Enviar ligação</button></form><button class="link" data-a="auth" data-m="entrar">Voltar a entrar</button>`;
  if(m==="nova")corpo=`<div><h1>Nova palavra-passe</h1></div><form id="f-nova" class="sec" novalidate><div class="fld"><label for="n-pass">Nova palavra-passe</label><input class="inp" id="n-pass" type="password" autocomplete="new-password" minlength="8" required><small>Pelo menos 8 caracteres.</small></div>
    <div id="a-err"></div><button class="btn pri" type="submit">${ic("save")}Guardar palavra-passe</button></form>`;
  $("#app").innerHTML=`<div class="login gut"><div class="login-card">${topo}${corpo}</div></div>`;icons();
}
function pendConvite(){try{return localStorage.getItem("yfx-ponto-convite")}catch(e){return null}}
(function guardarConviteDaURL(){const p=new URLSearchParams(location.search);const t=p.get("convite");if(t){try{localStorage.setItem("yfx-ponto-convite",t)}catch(e){}history.replaceState(null,"",location.pathname)}})();
const URL_SITE=()=>location.origin+location.pathname;

function ecraAssociar(){
  const conv=pendConvite();
  $("#app").innerHTML=`<div class="login gut"><div class="login-card">
   <div class="brandmark">${LOGO}<div><b>YFX Ponto Digital</b><small>${esc(S.user.email)}</small></div></div>
   <div><h1>Associar a uma empresa</h1><p style="color:var(--muted);margin:6px 0 0;font-size:14px">A sua conta ainda não pertence a nenhuma empresa.</p></div>
   <form id="f-convite" class="card pad sec" novalidate><b>Sou gerente e recebi um convite</b>
    <div class="fld"><label for="c-token">Código do convite</label><input class="inp" id="c-token" value="${esc(conv||"")}" autocomplete="off"><small>Vem na ligação enviada pelo seu chefe.</small></div>
    <div id="c-err"></div><button class="btn pri" type="submit">${ic("user-check")}Aceitar convite</button></form>
   <form id="f-ativar" class="card pad sec" novalidate><b>Sou o dono e tenho um código da YFX</b>
    <div class="fld"><label for="v-cod">Código de activação</label><input class="inp" id="v-cod" autocomplete="off" style="text-transform:uppercase"></div>
    <div class="fld"><label for="v-emp">Nome da empresa</label><input class="inp" id="v-emp" autocomplete="organization"></div>
    <div class="fld"><label for="v-nome">O seu nome</label><input class="inp" id="v-nome" autocomplete="name" value="${esc(S.user.user_metadata?.nome||"")}"></div>
    <div id="v-err"></div><button class="btn sec" type="submit">${ic("key-round")}Activar empresa</button></form>
   <p style="margin:0;color:var(--muted);font-size:12.5px">Para obter um código de activação, contacte a YFX pelo WhatsApp +258 86 174 2006.</p>
   <button class="btn ghost" data-a="sair">${ic("log-out")}Terminar sessão</button></div></div>`;icons();
}

/* ============================== assistente de configuração ============================== */
let WZ=null;
function ecraAssistente(){
  if(!WZ){const c=S.cfg;WZ={p:1,nome:c.nome,morada:c.morada,ini:c.ini,fim:c.fim,tol:c.tol,prev:hm(c.previsto),alm:c.almoco,ai:c.almIni,af:c.almFim,lat:c.lat??"",lng:c.lng??"",raio:c.raio,gps:c.exigirGps}}
  const P=["Dados da empresa","Horário de trabalho","Intervalo de almoço","Localização","Trabalhadores","Gerente"];
  let b="";
  if(WZ.p===1)b=`<div class="fld"><label for="z-nome">Nome da empresa</label><input class="inp" id="z-nome" value="${esc(WZ.nome)}"></div><div class="fld"><label for="z-mor">Morada</label><input class="inp" id="z-mor" value="${esc(WZ.morada)}" placeholder="Ex.: Av. Eduardo Mondlane, 1234, Maputo"></div>`;
  if(WZ.p===2)b=`<div class="grid2"><div class="fld"><label for="z-ini">Início</label><input class="inp" type="time" id="z-ini" value="${WZ.ini}"></div><div class="fld"><label for="z-fim">Fim</label><input class="inp" type="time" id="z-fim" value="${WZ.fim}"></div></div>
    <div class="grid2"><div class="fld"><label for="z-tol">Tolerância de atraso</label><select class="inp" id="z-tol">${[5,10,15,20].map(v=>`<option value="${v}" ${v==WZ.tol?"selected":""}>${v} minutos</option>`).join("")}</select></div><div class="fld"><label for="z-prev">Horas diárias previstas</label><input class="inp" type="time" id="z-prev" value="${WZ.prev}"><small>Base das horas extra</small></div></div>`;
  if(WZ.p===3)b=`<div class="setrow card" style="border-radius:var(--r-2)"><span class="who"><b>Registar intervalo de almoço</b><small style="white-space:normal">Se desligar, o gerente não vê as acções de almoço e nada é descontado.</small></span><input type="checkbox" class="switch" id="z-alm" ${WZ.alm?"checked":""}></div>
    <div class="grid2" id="z-almh" ${WZ.alm?"":"hidden"}><div class="fld"><label for="z-ai">Início previsto</label><input class="inp" type="time" id="z-ai" value="${WZ.ai}"></div><div class="fld"><label for="z-af">Fim previsto</label><input class="inp" type="time" id="z-af" value="${WZ.af}"></div></div>`;
  if(WZ.p===4)b=`<p style="margin:0;color:var(--muted);font-size:13.5px">Use o telemóvel no local da empresa para obter as coordenadas, ou escreva-as.</p>
    <button type="button" class="btn ghost sm" data-a="minhaloc">${ic("locate-fixed")}Usar a localização deste aparelho</button><div id="d-locmsg"></div>
    <div class="grid2"><div class="fld"><label for="d-lat">Latitude</label><input class="inp num" id="d-lat" inputmode="decimal" value="${WZ.lat}"></div><div class="fld"><label for="d-lng">Longitude</label><input class="inp num" id="d-lng" inputmode="decimal" value="${WZ.lng}"></div></div>
    <div class="fld"><label for="z-raio">Raio de validação (metros)</label><input class="inp num" id="z-raio" type="number" min="20" max="1000" step="10" value="${WZ.raio}"></div>
    <label class="check"><input type="checkbox" id="z-gps" ${WZ.gps?"checked":""}>Recusar marcações sem GPS disponível</label>`;
  if(WZ.p===5)b=`<p style="margin:0;color:var(--muted);font-size:13.5px">Plano ${S.cfg.plano.nome}: até ${S.cfg.plano.limite} trabalhadores activos. Pode adicionar mais depois.</p>
    <form id="fz-w" class="grid2" novalidate style="align-items:end"><div class="fld"><label for="zw-nome">Nome completo</label><input class="inp" id="zw-nome"></div><div class="fld"><label for="zw-fun">Função</label><input class="inp" id="zw-fun"></div><button class="btn sec" type="submit" style="grid-column:1/-1">${ic("plus")}Adicionar trabalhador</button></form><div id="zw-err"></div>
    ${S.ws.length?`<div class="list">${S.ws.map(w=>`<div class="row">${avatar(w)}<span class="who"><b>${esc(w.nome)}</b><small>${esc(w.funcao)}</small></span></div>`).join("")}</div>`:empty("users","Ainda sem trabalhadores","Adicione pelo menos um para o gerente poder marcar.")}`;
  if(WZ.p===6)b=gerentesHTML(true);
  $("#app").innerHTML=`<div class="login gut" style="align-items:start"><div class="login-card" style="max-width:560px">
    <div class="brandmark">${LOGO}<div><b>Configuração inicial</b><small>${esc(S.cfg.nome)}</small></div></div>
    <div class="steps">${P.map((_,i)=>`<i class="${i<WZ.p?"on":""}"></i>`).join("")}</div>
    <div><div class="eyebrow">Passo ${WZ.p} de 6</div><h1 style="font-size:22px">${P[WZ.p-1]}</h1></div>
    <div class="sec" id="wz">${b}</div><div id="wz-err"></div>
    <div class="btn-row">${WZ.p>1?`<button class="btn sec" data-a="wz" data-d="-1">Voltar</button>`:""}<button class="btn pri" data-a="wz" data-d="1">${WZ.p===6?`${ic("check")}Concluir`:"Continuar"}</button></div>
    <button class="btn ghost sm" data-a="sair">${ic("log-out")}Terminar sessão</button></div></div>`;icons();
  const alm=$("#z-alm");if(alm)alm.onchange=()=>{$("#z-almh").hidden=!alm.checked};
}
function lerPasso(){
  const g=id=>$("#"+id)?.value?.trim();
  if(WZ.p===1){WZ.nome=g("z-nome");WZ.morada=g("z-mor")}
  if(WZ.p===2){WZ.ini=g("z-ini");WZ.fim=g("z-fim");WZ.tol=+g("z-tol");WZ.prev=g("z-prev")}
  if(WZ.p===3){WZ.alm=$("#z-alm").checked;WZ.ai=g("z-ai");WZ.af=g("z-af")}
  if(WZ.p===4){WZ.lat=g("d-lat");WZ.lng=g("d-lng");WZ.raio=+g("z-raio");WZ.gps=$("#z-gps").checked}
}
const num=v=>v===""||v==null?null:parseFloat(String(v).replace(",","."));
async function gravarConfig(o,configurada){
  await rpc("configurar_empresa",{p_nome:o.nome,p_morada:o.morada||"",p_hora_inicio:o.ini,p_hora_fim:o.fim,p_tolerancia:+o.tol,p_minutos_previstos:toMin(o.prev),
    p_almoco:o.alm,p_almoco_inicio:o.ai,p_almoco_fim:o.af,p_lat:num(o.lat),p_lng:num(o.lng),p_raio:+o.raio,p_exigir_gps:!!o.gps,p_configurada:configurada});
  const{data,error}=await sb.from("empresas").select("*").eq("id",S.cfg.id).single();if(error)throw error;S.cfg=mapCfg(data);
}

/* ============================== navegação ============================== */
const NAV={gerente:[["hoje","Hoje","calendar-check"],["registos","Registos","list-checks"],["perfil","Perfil","user-round"]],
  chefe:[["visao","Visão geral","layout-grid"],["hoje","Hoje","calendar-check"],["trabalhadores","Trabalhadores","users"],["relatorios","Relatórios","table-2"],["alteracoes","Alterações","history"],["notificacoes","Notificações","bell"],["definicoes","Definições","settings"]]};
const MOBILE_CHEFE=["visao","hoje","trabalhadores","relatorios"];
const naoLidas=()=>S.notifs.filter(n=>!n.lida).length;
function renderAll(){if(!S.membro||!S.cfg||!S.cfg.configurada&&S.role==="chefe")return;if(!$("#shell"))renderShell();renderChrome();renderView()}
function renderShell(){
  const me=S.membro.nome;
  $("#app").innerHTML=`<div class="shell" id="shell">
   <aside class="side" aria-label="Navegação"><div class="brandmark">${LOGO}<div><b>Ponto Digital</b><small>YFX</small></div></div><nav id="sidenav"></nav>
    <div class="me"><span class="av">${ini(me)}</span><span class="who"><b>${esc(me)}</b><small>${S.role==="chefe"?"Chefe":"Gerente"}</small></span></div></aside>
   <div class="main"><header class="bar"><div class="in gut" id="bar"></div></header><main class="view gut" id="view"></main></div>
  </div><nav class="bnav" id="bnav" aria-label="Navegação principal"></nav>`;
}
function renderChrome(){
  if(!$("#shell"))return;
  const c=S.cfg,n=naoLidas(),pend=S.role==="gerente"?filaActiva().length:0,parada=S.role==="gerente"?filaParada().length:0,on=navigator.onLine;
  const items=NAV[S.role];
  $("#sidenav").innerHTML=items.map(([k,l,i])=>`<button data-a="go" data-v="${k}" ${S.view===k?'aria-current="page"':""}>${ic(i)}${l}${k==="notificacoes"&&n?`<span class="cnt">${n}</span>`:""}</button>`).join("");
  const mob=S.role==="chefe"?items.filter(x=>MOBILE_CHEFE.includes(x[0])).concat([["mais","Mais","ellipsis"]]):items;
  const maisAtivo=S.role==="chefe"&&!MOBILE_CHEFE.includes(S.view);
  $("#bnav").innerHTML=mob.map(([k,l,i])=>`<button data-a="${k==="mais"?"mais":"go"}" data-v="${k}" ${(S.view===k||(k==="mais"&&maisAtivo))?'aria-current="page"':""}>${ic(i)}<span>${l}</span>${k==="mais"&&n?`<span class="cnt">${n}</span>`:""}</button>`).join("");
  let sync;
  if(S.syncing)sync=`<span class="pill pend"><i data-lucide="refresh-cw" class="spin"></i>A actualizar…</span>`;
  else if(S.copiaLocal)sync=`<span class="pill off">${ic("database")}Dados guardados às ${S.copiaLocal}</span>`;
  else if(pend)sync=`<span class="pill pend">${ic("cloud-upload")}${pend} por enviar</span>`;
  else if(parada)sync=`<span class="pill off">${ic("circle-alert")}${parada} por resolver</span>`;
  else if(S.erroSync)sync=`<span class="pill off">${ic("cloud-off")}Falha ao actualizar</span>`;
  else sync=`<span class="pill">${ic("circle-check")}Actualizado ${S.lastSync||"—"}</span>`;
  $("#bar").innerHTML=`<div class="bar-top"><div class="co"><span class="co-mark">${ini(c.nome)}</span><div class="co-txt"><b>${esc(c.nome)}</b><small>${S.role==="chefe"?"Chefe":"Gerente"} · ${fmtD(HOJE())}</small></div></div>
    <div style="display:flex;gap:8px"><button class="iconbtn" data-a="refresh" aria-label="Actualizar agora">${ic("refresh-cw")}</button>${S.role==="chefe"?`<button class="iconbtn" data-a="go" data-v="notificacoes" aria-label="Notificações, ${n} por ler">${ic("bell")}${n?`<i class="cnt">${n}</i>`:""}</button>`:""}</div></div>
    <div class="pills">${on?`<span class="pill"><span class="dot"></span>Online</span>`:`<span class="pill off">${ic("wifi-off")}Sem internet</span>`}${sync}<span class="pill">${ic("clock-3")}${c.ini}–${c.fim}</span></div>`;
  icons();
}
let skTimer=null;
async function go(v){
  S.view=v;fecharPainel();renderChrome();
  $("#view").innerHTML=`<div class="sk" style="height:34px;width:55%"></div><div class="kpis">${'<div class="sk" style="height:74px"></div>'.repeat(4)}</div>${'<div class="sk" style="height:60px"></div>'.repeat(4)}`;
  try{if(v==="relatorios"||v==="visao")await garantirMes(S.rep.mes)}catch(e){toast(msgErro(e),"bad")}
  clearTimeout(skTimer);skTimer=setTimeout(()=>{if(S.view===v){renderView();scrollTo(0,0)}},120);
}
function renderView(){if(!$("#view"))return;const V=(S.role==="chefe"?CHEFE_V:GER_V)[S.view];$("#view").innerHTML=V();icons()}
function renderList(){const el=$("#lst");if(!el)return;const V=(S.role==="chefe"?CHEFE_V:GER_V)[S.view];if(V.list){el.innerHTML=V.list();icons()}}

/* ============================== ecrãs comuns ============================== */
function kpis(c,withSaiu){
  const k=[["Presentes",c.presentes,"var(--ok)"],["Atrasados",c.atrasados,"var(--warn)"],["Faltas",c.faltas,"var(--bad)"],["Por marcar",c.pend,"var(--idle)"]];
  if(withSaiu)k.push(["Já saíram",c.sairam,"var(--primary)"]);
  return `<div class="kpis ${withSaiu?"k5":""}">${k.map(([l,v,col])=>`<div class="kpi"><b>${v}</b><span><i class="sw" style="background:${col}"></i>${l}</span></div>`).join("")}</div>`;
}
function linhaTrab(w,r){
  const st=estado(r),[lbl,cls]=EST[st];
  let sub=esc(w.funcao);
  if(r&&r.falta)sub+=" · "+esc(r.nota||"sem motivo");
  else if(r&&r.entrada){
    if(S.role==="chefe"){sub+=` · E ${r.entrada}`;if(r.almS)sub+=` · A ${r.almS}–${r.almR||"…"}`;if(r.saida)sub+=` · S ${r.saida}`}
    else{if(r.almS&&!r.almR)sub+=` · em almoço desde ${r.almS}`;else if(r.saida)sub+=` · saiu ${r.saida}`}
  }
  const pend=r&&r.pend&&Object.keys(r.pend).length?`<span title="Por enviar" style="color:var(--warn)">${ic("cloud-upload")}</span>`:"";
  const corr=r&&r.corr&&Object.keys(r.corr).length?`<span class="tagc">CORRIGIDO</span>`:"";
  const tm=r&&r.entrada?`<span class="tm">${r.entrada}</span>`:"";
  return `<button class="row" data-a="trab" data-w="${w.id}"><span class="av">${ini(w.nome)}</span><span class="who"><b>${esc(w.nome)}${corr}</b><small>${sub}</small></span>
   <span class="right">${tm}<span style="display:flex;gap:4px;align-items:center">${pend}${chip(lbl,cls)}</span></span></button>`;
}
function filtroHoje(){
  const k=HOJE(),q=(S.q.hoje||"").toLowerCase(),f=S.f.hoje;
  const ws=trabalhadoresDo(k).filter(w=>!q||w.nome.toLowerCase().includes(q)||w.funcao.toLowerCase().includes(q));
  return ws.filter(w=>{const r=verRec(k,w.id),st=estado(r);
    if(f==="presentes")return st==="presente"||(st==="saiu"&&!isLate(r));if(f==="atrasados")return isLate(r)&&!r.falta;if(f==="faltas")return st==="falta";if(f==="sairam")return st==="saiu";return true});
}
function listaHoje(){
  const k=HOJE();
  if(!S.ws.length)return empty("users","Ainda sem trabalhadores",S.role==="chefe"?"Adicione trabalhadores para o gerente poder marcar.":"O chefe ainda não adicionou trabalhadores.",S.role==="chefe"?`<button class="btn sec sm" data-a="addw">${ic("plus")}Adicionar trabalhador</button>`:"");
  const ws=filtroHoje();
  if(!ws.length)return empty("search-x","Nenhum trabalhador encontrado","Mude a pesquisa ou o filtro para ver mais resultados.",`<button class="btn sec sm" data-a="limparfiltro">Limpar filtros</button>`);
  const pend=ws.filter(w=>estado(verRec(k,w.id))==="pend"),marc=ws.filter(w=>!pend.includes(w));
  let h="";
  if(pend.length)h+=`<div class="sec"><div class="sec-h"><h2>Por marcar</h2><small>${pend.length}</small></div><div class="list">${pend.map(w=>linhaTrab(w,verRec(k,w.id))).join("")}</div></div>`;
  if(marc.length)h+=`<div class="sec"><div class="sec-h"><h2>Marcados</h2><small>${marc.length}</small></div><div class="list">${marc.map(w=>linhaTrab(w,verRec(k,w.id))).join("")}</div></div>`;
  return h;
}
function ferramentasHoje(){
  const F=[["todos","Todos"],["presentes","Presentes"],["atrasados","Atrasados"],["faltas","Faltas"],["sairam","Saíram"]];
  return `<div class="tools"><label class="search"><span class="sr">Pesquisar trabalhador</span>${ic("search")}<input data-search="hoje" placeholder="Pesquisar por nome ou função" value="${esc(S.q.hoje||"")}" autocomplete="off"></label>
  <div class="filters" role="group" aria-label="Filtrar">${F.map(([k,l])=>`<button class="fchip" data-a="filtro" data-f="${k}" aria-pressed="${S.f.hoje===k}">${l}</button>`).join("")}</div></div>`;
}
function temaSeg(){return `<div class="seg" role="group" aria-label="Tema">${[["claro","Claro","sun"],["escuro","Escuro","moon"],["sistema","Sistema","monitor"]].map(([k,l,i])=>`<button data-a="tema" data-t="${k}" aria-pressed="${TEMA===k}">${ic(i)}${l}</button>`).join("")}</div>`}
function bannerRelogio(){return Math.abs(S.offsetMin)>=3?`<div class="ban warn">${ic("clock-alert")}<div><b>O relógio deste aparelho difere ${Math.abs(S.offsetMin)} min do servidor.</b>Acerte a data e a hora do telemóvel. Marcações com hora errada são recusadas.</div></div>`:""}

/* ============================== ecrãs do gerente ============================== */
const GER_V={
  hoje(){
    const k=HOJE(),d=dia(k),c=contar(k);
    let ban="";
    if(!navigator.onLine)ban=`<div class="ban warn">${ic("wifi-off")}<div><b>Sem internet.</b>Pode continuar a marcar. As operações ficam guardadas neste telemóvel, por ordem, e são enviadas quando a ligação voltar. Só contam depois de aceites pelo servidor.</div></div>`;
    else if(d.fecho)ban=`<div class="ban ok">${ic("circle-check")}<div><b>Entrada fechada às ${d.fecho.hora}${d.fecho.sync?"":" (por enviar)"}.</b>Continue a marcar almoços e saídas ao longo do dia.</div></div>`;
    else ban=`<div class="ban">${ic("info")}<div><b>Marque cada trabalhador à chegada.</b>A hora e a localização são registadas automaticamente e validadas pelo servidor.</div></div>`;
    const rec=filaParada().length,pend=filaActiva().length;
    const recB=(rec?`<button class="ban bad" data-a="go" data-v="registos" style="border:0;text-align:left;width:100%">${ic("circle-alert")}<div><b>${pl(rec,"operação foi recusada","operações foram recusadas")} pelo servidor.</b>Nada foi alterado no servidor. Toque para ver o motivo e decidir.</div></button>`:"")
      +(pend&&navigator.onLine?`<div class="ban warn">${ic("cloud-upload")}<div><b>${pl(pend,"operação por enviar","operações por enviar")}.</b>Estão guardadas neste telemóvel e são enviadas por ordem. Só contam depois de aceites pelo servidor.</div></div>`:"")
      +(S.copiaLocal?`<div class="ban warn">${ic("database")}<div><b>A mostrar a cópia guardada às ${S.copiaLocal}.</b>O servidor não respondeu. As marcações continuam a ser guardadas neste telemóvel.</div></div>`:"");
    const btn=d.aprovado?`<button class="btn okb" disabled>${ic("badge-check")}Dia aprovado pelo chefe</button>`:d.fecho?`<button class="btn sec" disabled>${ic("lock")}Entrada fechada às ${d.fecho.hora}</button>`:`<button class="btn pri" data-a="fechar">${ic("send")}Fechar entrada${c.pend?` · ${c.pend} por marcar`:""}</button>`;
    return `<div class="ph"><div><div class="eyebrow">Hoje</div><h1>${longD(k)}</h1><p>Horário ${S.cfg.ini}–${S.cfg.fim} · tolerância ${S.cfg.tol} min${S.cfg.almoco?` · almoço ${S.cfg.almIni}–${S.cfg.almFim}`:""}</p></div></div>
      ${kpis(c)}${bannerRelogio()}${recB}${ban}${ferramentasHoje()}<div id="lst" class="sec" style="gap:16px">${listaHoje()}</div>
      <div class="cta gut">${btn}</div>`;
  },
  registos(){
    const lab={entrada:"Entrada",almoco_saida:"Saída para almoço",almoco_regresso:"Regresso do almoço",saida:"Saída",falta:"Falta"};
    const estadoChip=o=>o.estado==="a_enviar"?chip("A enviar","c-info","refresh-cw"):o.estado==="pendente"?chip("Por enviar","c-warn","cloud-upload"):o.estado==="conflito"?chip("Conflito","c-bad","git-compare"):chip("Recusada","c-bad","circle-x");
    const servidorAgora=o=>{if(o.tipo==="fecho"){const d=S.days[o.data];return d&&d.fecho&&d.fecho.sync?`No servidor: entrada já fechada às ${d.fecho.hora}.`:""}
      const r=S.srv[o.data]&&S.srv[o.data][o.wid];if(!r)return"No servidor: sem marcações para este trabalhador.";
      return `No servidor agora: ${r.falta?"Falta":[r.entrada&&"entrada "+r.entrada,r.almS&&"almoço "+r.almS+"–"+(r.almR||"…"),r.saida&&"saída "+r.saida].filter(Boolean).join(" · ")}${r.corr&&Object.keys(r.corr).length?" (corrigido pelo chefe)":""}.`};
    const filaH=FILA.length?`<div class="list">${FILA.map(o=>`<div class="row" style="align-items:flex-start;flex-wrap:wrap"><span class="tm" style="width:48px">${o.hora_local}</span>
      <span class="who" style="min-width:180px"><b>${o.tipo==="fecho"?"Fecho da entrada":esc(W(o.wid).nome)+" · "+lab[o.args.p_tipo]}</b>
       <small style="white-space:normal">Hora do aparelho ${o.hora_local} · ${o.tipo==="fecho"?"":o.args.p_lat==null?"sem localização":`localização ±${o.geo.acc} m${o.geo.dist!=null?`, a ${o.geo.dist} m do local`:""}`}${o.tentativas?` · ${pl(o.tentativas,"tentativa","tentativas")}`:""}</small>
       ${o.estado==="pendente"||o.estado==="a_enviar"?`<small style="white-space:normal">Só neste telemóvel. Ainda não foi recebida pelo servidor${o.erro&&o.tentativas?` (${esc(o.erro)})`:""}.</small>`:`<small style="white-space:normal;color:var(--bad)">${esc(o.erro)}</small><small style="white-space:normal">${esc(servidorAgora(o))}</small>`}</span>
      <span class="right">${estadoChip(o)}${o.estado==="conflito"||o.estado==="recusada"?`<button class="btn ghost sm" data-a="descartar" data-id="${o.id}">Descartar</button>`:o.estado==="pendente"&&navigator.onLine?`<button class="btn ghost sm" data-a="enviaragora">Enviar agora</button>`:""}</span></div>`).join("")}</div>`
      :empty("circle-check","Nada por enviar","Todas as operações deste telemóvel já foram aceites pelo servidor.");
    const k=HOJE(),d=dia(k);
    const recs=Object.entries(d.recs).filter(([,r])=>r.entrada||r.falta).sort((a,b)=>(a[1].entrada||"99").localeCompare(b[1].entrada||"99"));
    const hojeH=recs.length?`<div class="list">${recs.map(([wid,r])=>`<button class="row" data-a="trab" data-w="${wid}"><span class="who"><b>${esc(W(wid).nome)}</b><small>${r.falta?"Falta":`E ${r.entrada}${r.almS?` · A ${r.almS}–${r.almR||"…"}`:""}${r.saida?` · S ${r.saida}`:""}`}</small></span>${r.pend&&Object.keys(r.pend).length?chip("Por enviar","c-warn","cloud-upload"):chip("No servidor","c-ok","circle-check")}</button>`).join("")}</div>`
      :empty("list-checks","Ainda sem marcações hoje","As marcações que fizer aparecem aqui.");
    const aud=S.audit.slice(0,10);
    const audH=aud.length?`<div class="list">${aud.map(a=>`<div class="row" style="align-items:flex-start"><span class="who"><b>${esc(W(a.wid).nome)} · ${a.campo}</b><small style="white-space:normal">${fmtD(a.data)}: <s>${esc(a.antes)}</s> → ${esc(a.depois)} · “${esc(a.motivo)}”</small></span><span class="tagc">CORRIGIDO</span></div>`).join("")}</div>`
      :empty("history","Sem correcções","Quando o chefe corrigir um registo, verá aqui o que mudou e porquê.");
    return `<div class="ph"><div><div class="eyebrow">Registos</div><h1>O que foi marcado</h1><p>Consulta apenas. Os registos não podem ser alterados pelo gerente.</p></div></div>
     <div class="sec"><div class="sec-h"><h2>Fila deste telemóvel</h2><small>${FILA.length}</small></div>${filaH}
      <p style="margin:0;font-size:12.5px;color:var(--muted)">As operações são enviadas pela ordem em que foram feitas. Uma operação recusada nunca substitui o que está no servidor: descarte-a e, se for preciso, peça ao chefe uma correcção.</p></div>
     <div class="sec"><div class="sec-h"><h2>Hoje</h2><small>${recs.length}</small></div>${hojeH}</div>
     <div class="sec"><div class="sec-h"><h2>Correcções do chefe</h2><small>${S.audit.length}</small></div>${audH}</div>`;
  },
  perfil(){return perfilHTML()}
};
GER_V.hoje.list=listaHoje;
function perfilHTML(){
  const perm=S.role==="chefe"?"Acompanhar registos, corrigir com motivo, aprovar o dia, gerir trabalhadores, gerentes e definições.":"Marcar entradas, faltas, almoços e saídas, e fechar a entrada. Não pode alterar registos já feitos.";
  return `<div class="ph"><div><div class="eyebrow">Perfil</div><h1>${esc(S.membro.nome)}</h1><p>${S.role==="chefe"?"Chefe":"Gerente"} · ${esc(S.cfg.nome)}</p></div></div>
   <div class="card"><div class="setrow"><span class="who"><b>Permissões</b><small>${perm}</small></span>${ic("shield-check")}</div>
   <div class="setrow"><span class="who"><b>Conta</b><small>${esc(S.user.email)}</small></span></div></div>
   <div class="sec"><div class="sec-h"><h2>Aparência</h2></div><div class="card pad">${temaSeg()}</div></div>
   <button class="btn sec" data-a="sair">${ic("log-out")}Terminar sessão</button>`;
}

/* ============================== ecrãs do chefe ============================== */
const CHEFE_V={
  visao(){
    const k=HOJE(),d=dia(k),c=contar(k),h=toMin(AGORA());
    const saud=h<12*60?"Bom dia":h<18*60?"Boa tarde":"Boa noite";
    const entrada=d.fecho?chip(`Fechada às ${d.fecho.hora}`,"c-ok","lock"):chip("Aberta","c-idle","lock-open");
    const aprov=d.aprovado?chip(`Aprovado às ${d.aprovado.hora}`,"c-ok","badge-check"):chip("Por aprovar","c-warn","hourglass");
    const alertas=alertasHoje();
    const alH=alertas.length?`<div class="list">${alertas.map(a=>`<button class="row" data-a="trab" data-w="${a.w}"><span style="color:var(--${a.cor})">${ic(a.i)}</span><span class="who"><b>${esc(a.t)}</b><small style="white-space:normal">${esc(a.d)}</small></span>${ic("chevron-right")}</button>`).join("")}</div>`
      :empty("circle-check","Sem pendentes","Não há registos incompletos nem inconsistências por agora.");
    const aud=S.audit.slice(0,3);const mes=k.slice(0,7);
    return `<div class="ph"><div><div class="eyebrow">${longD(k)}</div><h1>${saud}, ${esc(S.membro.nome.split(" ")[0])}</h1><p>${esc(S.cfg.nome)} · ${pl(S.ws.filter(w=>w.ativo).length,"trabalhador activo","trabalhadores activos")}</p></div></div>
     <div class="st2"><div class="stc"><small>Entrada de hoje</small>${entrada}</div><div class="stc"><small>Aprovação do dia</small>${aprov}</div></div>
     ${kpis(c,true)}
     <div class="btn-row">${botaoAprovar()}<button class="btn sec" data-a="go" data-v="hoje">${ic("calendar-check")}Ver registos de hoje</button></div>
     <div class="split"><div class="sec"><div class="sec-h"><h2>Assiduidade em ${MESES[+mes.slice(5)-1]}</h2><small>dias aprovados</small></div><div class="card pad chart">${graficoMes(mes)}</div></div>
      <div class="sec"><div class="sec-h"><h2>Precisa de atenção</h2><small>${alertas.length}</small></div>${alH}</div></div>
     <div class="sec"><div class="sec-h"><h2>Últimas alterações</h2><button class="link" data-a="go" data-v="alteracoes">Ver todas ${ic("chevron-right")}</button></div>
      ${aud.length?`<div class="list">${aud.map(a=>`<div class="row" style="align-items:flex-start"><span class="who"><b>${esc(W(a.wid).nome)} · ${a.campo}</b><small style="white-space:normal">${fmtD(a.data)}: ${esc(a.antes)} → ${esc(a.depois)}</small></span><small class="num" style="color:var(--muted)">${a.quando.slice(0,5)}</small></div>`).join("")}</div>`:empty("history","Sem alterações","As correcções que fizer aparecem aqui.")}</div>`;
  },
  hoje(){
    const k=HOJE(),d=dia(k),c=contar(k);
    let ban;
    if(d.aprovado)ban=`<div class="ban ok">${ic("badge-check")}<div><b>Dia aprovado às ${d.aprovado.hora}.</b>${d.corrApos?"Houve correcções depois da aprovação; estão registadas em Alterações.":"Os registos de hoje entram no relatório mensal."}</div></div>`;
    else if(d.fecho)ban=`<div class="ban">${ic("info")}<div><b>Entrada fechada pelo gerente às ${d.fecho.hora}.</b>Reveja os registos e aprove o dia quando estiverem completos.</div></div>`;
    else ban=`<div class="ban">${ic("hourglass")}<div><b>Entrada ainda aberta.</b>Recebe uma notificação quando o gerente fechar a entrada.</div></div>`;
    return `<div class="ph"><div><div class="eyebrow">Hoje</div><h1>${longD(k)}</h1><p>Dados recebidos pelo servidor até às ${S.lastSync||"—"}. Marcações feitas sem internet só aparecem depois de enviadas.</p></div></div>
     ${kpis(c,true)}${ban}${ferramentasHoje()}<div id="lst" class="sec" style="gap:16px">${listaHoje()}</div>
     <div class="cta gut">${botaoAprovar()}</div>`;
  },
  trabalhadores(){
    const act=S.ws.filter(w=>w.ativo).length,lim=S.cfg.plano.limite,pct=Math.round(act/lim*100);
    const aviso=act>=lim?`<div class="ban bad">${ic("circle-alert")}<div><b>Limite do plano atingido.</b>Desactive um trabalhador ou contacte a YFX para mudar de plano.</div></div>`
      :pct>=80?`<div class="ban warn">${ic("triangle-alert")}<div><b>Está perto do limite do plano.</b>Restam ${lim-act} lugares no plano ${S.cfg.plano.nome}.</div></div>`:"";
    return `<div class="ph"><div><div class="eyebrow">Equipa</div><h1>Trabalhadores</h1><p>${act} activos de ${lim} no plano ${S.cfg.plano.nome}</p></div>
      <button class="btn pri sm" data-a="addw" ${act>=lim?"disabled":""}>${ic("plus")}Adicionar</button></div>
     <div class="card pad" style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>Utilização do plano</span><b class="num">${act}/${lim}</b></div><div class="meter ${pct>=80?"warn":""}"><i style="width:${Math.min(100,pct)}%"></i></div></div>
     ${aviso}
     <label class="search"><span class="sr">Pesquisar</span>${ic("search")}<input data-search="trabalhadores" placeholder="Pesquisar por nome ou função" value="${esc(S.q.trabalhadores||"")}" autocomplete="off"></label>
     <div id="lst" class="sec" style="gap:16px">${CHEFE_V.trabalhadores.list()}</div>`;
  },
  relatorios(){
    const R=S.rep;
    const meses=[];for(let m=S.cfg.criado.slice(0,7);m<=HOJE().slice(0,7);m=addDias(fimMes(m),1).slice(0,7))meses.push(m);
    return `<div class="ph"><div><div class="eyebrow">Relatórios</div><h1>Relatório mensal</h1><p>Só os dias aprovados entram nos totais oficiais.</p></div></div>
     <div class="card pad" style="display:flex;flex-direction:column;gap:12px">
      <div class="grid2"><div class="fld"><label for="r-mes">Mês</label><select class="inp" id="r-mes" data-rep="mes">${meses.reverse().map(m=>`<option value="${m}" ${R.mes===m?"selected":""}>${MESES[+m.slice(5)-1][0].toUpperCase()+MESES[+m.slice(5)-1].slice(1)} ${m.slice(0,4)}</option>`).join("")}</select></div>
       <div class="fld"><label for="r-ano">Ano</label><select class="inp" id="r-ano" data-rep="ano">${[...new Set(meses.map(m=>m.slice(0,4)))].map(y=>`<option ${R.mes.startsWith(y)?"selected":""}>${y}</option>`).join("")}</select></div></div>
      <div class="grid2"><div class="fld"><label for="r-w">Trabalhador</label><select class="inp" id="r-w" data-rep="w"><option value="">Todos</option>${S.ws.map(w=>`<option value="${w.id}" ${R.w===w.id?"selected":""}>${esc(w.nome)}${w.ativo?"":" (desactivado)"}</option>`).join("")}</select></div>
       <div class="fld"><label for="r-e">Situação</label><select class="inp" id="r-e" data-rep="estado">${[["","Todas"],["faltas","Com faltas"],["atrasos","Com atrasos"],["incompletos","Com registos incompletos"]].map(([k,l])=>`<option value="${k}" ${R.estado===k?"selected":""}>${l}</option>`).join("")}</select></div></div>
      <div class="btn-row"><button class="btn sec sm" data-a="exp" data-fmt="xlsx">${ic("file-spreadsheet")}Exportar Excel</button><button class="btn sec sm" data-a="exp" data-fmt="pdf">${ic("file-text")}Exportar PDF</button></div></div>
     <div id="lst" class="sec" style="gap:16px">${CHEFE_V.relatorios.list()}</div>`;
  },
  alteracoes(){
    const P=[["hoje","Hoje"],["7d","Últimos 7 dias"],["mes","Este mês"],["tudo","Tudo"]];
    return `<div class="ph"><div><div class="eyebrow">Auditoria</div><h1>Alterações</h1><p>Histórico permanente das correcções. Não pode ser apagado nem editado.</p></div></div>
     <div class="tools"><label class="search"><span class="sr">Pesquisar</span>${ic("search")}<input data-search="alteracoes" placeholder="Pesquisar no motivo ou no trabalhador" value="${esc(S.q.alteracoes||"")}" autocomplete="off"></label>
      <div class="filters">${P.map(([k,l])=>`<button class="fchip" data-a="altp" data-f="${k}" aria-pressed="${S.f.alt===k}">${l}</button>`).join("")}</div>
      <select class="inp" data-altw aria-label="Filtrar por trabalhador"><option value="">Todos os trabalhadores</option>${S.ws.map(w=>`<option value="${w.id}" ${S.f.altW===w.id?"selected":""}>${esc(w.nome)}</option>`).join("")}</select></div>
     <div id="lst">${CHEFE_V.alteracoes.list()}</div>`;
  },
  notificacoes(){
    const n=naoLidas();
    return `<div class="ph"><div><div class="eyebrow">Centro</div><h1>Notificações</h1><p>${n?pl(n,"notificação por ler","notificações por ler"):"Está tudo lido."}</p></div>
      ${n?`<button class="btn sec sm" data-a="lertodas">${ic("check-check")}Marcar todas como lidas</button>`:""}</div>
     <div id="lst">${CHEFE_V.notificacoes.list()}</div>`;
  },
  definicoes(){
    const c=S.cfg;
    return `<div class="ph"><div><div class="eyebrow">Empresa</div><h1>Definições</h1><p>Só o chefe pode alterar estas definições. As regras são validadas pelo servidor.</p></div></div>
    <form id="fdef" class="card" novalidate>
     <div class="setsec"><h2 style="font-size:16px">Empresa</h2><div class="fld"><label for="d-nome">Nome</label><input class="inp" id="d-nome" value="${esc(c.nome)}"></div></div>
     <div class="setsec"><h2 style="font-size:16px">Horário de trabalho</h2>
      <div class="grid2"><div class="fld"><label for="d-ini">Início</label><input class="inp" type="time" id="d-ini" value="${c.ini}"></div><div class="fld"><label for="d-fim">Fim</label><input class="inp" type="time" id="d-fim" value="${c.fim}"></div></div>
      <div class="grid2"><div class="fld"><label for="d-tol">Tolerância de atraso</label><select class="inp" id="d-tol">${[5,10,15,20].map(v=>`<option value="${v}" ${v===c.tol?"selected":""}>${v} minutos</option>`).join("")}</select></div>
       <div class="fld"><label for="d-prev">Horas diárias previstas</label><input class="inp" type="time" id="d-prev" value="${hm(c.previsto)}"><small>Base do cálculo das horas extra</small></div></div></div>
     <div class="setsec"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h2 style="font-size:16px">Intervalo de almoço</h2><small style="color:var(--muted)">Quando desligado, o gerente não vê as acções de almoço e nada é descontado.</small></div><input type="checkbox" class="switch" id="d-alm" ${c.almoco?"checked":""} aria-label="Intervalo de almoço"></div>
      <div class="grid2" id="d-almh" ${c.almoco?"":"hidden"}><div class="fld"><label for="d-ai">Início previsto</label><input class="inp" type="time" id="d-ai" value="${c.almIni}"></div><div class="fld"><label for="d-af">Fim previsto</label><input class="inp" type="time" id="d-af" value="${c.almFim}"></div></div></div>
     <div class="setsec"><h2 style="font-size:16px">Localização</h2>
      <div class="fld"><label for="d-mor">Morada</label><input class="inp" id="d-mor" value="${esc(c.morada)}"></div>
      <div class="grid2"><div class="fld"><label for="d-lat">Latitude</label><input class="inp num" id="d-lat" inputmode="decimal" value="${c.lat??""}"></div><div class="fld"><label for="d-lng">Longitude</label><input class="inp num" id="d-lng" inputmode="decimal" value="${c.lng??""}"></div></div>
      <div class="fld"><label for="d-raio">Raio de validação (metros)</label><input class="inp num" id="d-raio" type="number" min="20" max="1000" step="10" value="${c.raio}"><small>A localização do telemóvel é uma estimativa. Raios muito pequenos causam recusas.</small></div>
      <label class="check"><input type="checkbox" id="d-gps" ${c.exigirGps?"checked":""}>Recusar marcações sem GPS disponível</label>
      <button type="button" class="btn ghost sm" data-a="minhaloc">${ic("locate-fixed")}Usar a localização deste aparelho</button><div id="d-locmsg"></div></div>
     <div class="setsec"><div id="d-err"></div><button class="btn pri" type="submit" id="d-save">${ic("save")}Guardar definições</button></div>
    </form>
    <div class="sec"><div class="sec-h"><h2>Gerentes</h2></div><div class="card pad sec">${gerentesHTML()}</div></div>
    <div class="sec"><div class="sec-h"><h2>Plano</h2></div><div class="card"><div class="setrow"><span class="who"><b>Plano ${c.plano.nome}</b><small>Até ${c.plano.limite} trabalhadores · subscrição ${c.subscricao}. Pagamentos tratados com a YFX (M-Pesa, e-Mola ou transferência).</small></span></div></div></div>
    <div class="sec"><div class="sec-h"><h2>Preferências</h2></div><div class="card pad" style="display:flex;flex-direction:column;gap:10px"><span style="font-size:13px;font-weight:600">Tema</span>${temaSeg()}</div></div>
    <button class="btn sec" data-a="sair">${ic("log-out")}Terminar sessão</button>`;
  }
};
CHEFE_V.hoje.list=listaHoje;
CHEFE_V.trabalhadores.list=()=>{
  const q=(S.q.trabalhadores||"").toLowerCase(),f=w=>!q||w.nome.toLowerCase().includes(q)||w.funcao.toLowerCase().includes(q);
  const a=S.ws.filter(w=>w.ativo&&f(w)),i=S.ws.filter(w=>!w.ativo&&f(w));
  if(!S.ws.length)return empty("users","Ainda sem trabalhadores","Adicione os trabalhadores que o gerente vai marcar.",`<button class="btn pri sm" data-a="addw">${ic("plus")}Adicionar</button>`);
  if(!a.length&&!i.length)return empty("search-x","Nenhum trabalhador encontrado","Verifique o nome ou adicione um novo trabalhador.");
  const row=w=>`<button class="row" data-a="wdet" data-w="${w.id}">${avatar(w)}<span class="who"><b>${esc(w.nome)}</b><small>${esc(w.funcao)} · desde ${fmtD(w.criado)}</small></span>${w.ativo?chip("Activo","c-ok"):chip("Desactivado","c-idle")}${ic("chevron-right")}</button>`;
  return (a.length?`<div class="sec"><div class="sec-h"><h2>Activos</h2><small>${a.length}</small></div><div class="list">${a.map(row).join("")}</div></div>`:"")+
         (i.length?`<div class="sec"><div class="sec-h"><h2>Desactivados</h2><small>${i.length}</small></div><div class="list">${i.map(row).join("")}</div></div>`:"");
};
CHEFE_V.relatorios.list=()=>{
  if(!S.carregado[S.rep.mes])return `<div class="sk" style="height:60px"></div><div class="sk" style="height:240px"></div>`;
  const d=dadosRelatorio();
  const labelMes=`${MESES[+S.rep.mes.slice(5)-1]} de ${S.rep.mes.slice(0,4)}`;
  if(!d.oficiais.length&&!d.pendentes.length)return empty("calendar-x","Sem dias registados neste período",`Não existem registos em ${labelMes}.`);
  let h=`<div class="ban">${ic("calendar-range")}<div><b>${labelMes[0].toUpperCase()+labelMes.slice(1)} · ${pl(d.oficiais.length,"dia aprovado","dias aprovados")}</b>${d.tot.faltas} faltas, ${d.tot.atrasos} atrasos e ${dur(d.tot.extra)} de horas extra${d.tot.incompletos?`. ${pl(d.tot.incompletos,"registo incompleto","registos incompletos")} sem horas contadas`:""}.</div></div>`;
  if(!d.oficiais.length)h+=empty("calendar-clock","Ainda sem dias aprovados","Os totais oficiais aparecem quando aprovar os dias deste mês.");
  else if(!d.linhas.length)h+=empty("filter-x","Nenhum trabalhador com estes filtros","Mude a situação ou o trabalhador seleccionado.");
  else h+=`<div class="tw"><table class="sticky1"><thead><tr><th>Trabalhador</th><th>Dias</th><th>Faltas</th><th>Atrasos</th><th>Horas</th><th>Extra</th><th>Incompl.</th></tr></thead><tbody>
    ${d.linhas.map(l=>`<tr class="clk" data-a="repdet" data-w="${l.w.id}" tabindex="0"><td><b>${esc(l.w.nome)}</b>${l.w.ativo?"":` <small style="color:var(--muted)">(desact.)</small>`}</td><td>${l.dias}</td><td class="${l.faltas?"t-bad":""}">${l.faltas}</td><td class="${l.atrasos>2?"t-warn":""}">${l.atrasos}</td><td>${dur(l.trab)}</td><td>${l.extra?dur(l.extra):"—"}</td><td class="${l.incompletos?"t-warn":""}">${l.incompletos||"—"}</td></tr>`).join("")}
    </tbody><tfoot><tr><td>Total</td><td>${d.tot.dias}</td><td>${d.tot.faltas}</td><td>${d.tot.atrasos}</td><td>${dur(d.tot.trab)}</td><td>${dur(d.tot.extra)}</td><td>${d.tot.incompletos||"—"}</td></tr></tfoot></table></div>
    <p style="margin:0;color:var(--muted);font-size:12.5px">Toque num trabalhador para ver o detalhe diário. Registos sem saída ou com almoço sem regresso não contam horas até serem corrigidos.</p>`;
  if(d.pendentes.length)h+=`<div class="sec"><div class="sec-h"><h2>Dias por aprovar</h2><small>fora dos totais</small></div><div class="list">${d.pendentes.map(k=>{const c=contar(k);return `<div class="row"><span class="who"><b>${longD(k)}</b><small>${c.presentes+c.atrasados} presentes · ${c.faltas} faltas${S.days[k].fecho?"":" · entrada não fechada"}</small></span>${k===HOJE()&&S.days[k].fecho?`<button class="btn sec sm" data-a="aprovar">Aprovar</button>`:chip("Por aprovar","c-warn")}</div>`}).join("")}</div></div>`;
  return h;
};
CHEFE_V.alteracoes.list=()=>{
  const q=(S.q.alteracoes||"").toLowerCase(),p=S.f.alt,ww=S.f.altW,k=HOJE();
  const lim={hoje:k,"7d":addDias(k,-6),mes:k.slice(0,7)+"-01",tudo:"0000"}[p];
  const L=S.audit.filter(a=>a.quandoK>=lim&&(!ww||a.wid===ww)&&(!q||(W(a.wid).nome+" "+a.motivo+" "+a.campo).toLowerCase().includes(q)));
  if(!L.length)return empty("history","Sem alterações neste período","Quando corrigir um registo, a alteração fica aqui de forma permanente.");
  return `<div class="list">${L.map(a=>`<div class="row" style="align-items:flex-start;flex-wrap:wrap"><span class="who" style="min-width:200px"><b>${esc(W(a.wid).nome)} · ${a.campo}</b>
   <small style="white-space:normal">Registo de ${fmtD(a.data)}: <s>${esc(a.antes)}</s> → <b style="font-weight:700;color:var(--ink)">${esc(a.depois)}</b></small>
   <small style="white-space:normal">Motivo: “${esc(a.motivo)}”</small></span>
   <span class="right"><small class="num" style="color:var(--muted)">${a.quando}</small><small style="color:var(--muted)">${esc(a.por)}</small>${a.apos?chip("Após aprovação","c-warn"):""}</span></div>`).join("")}</div>`;
};
CHEFE_V.notificacoes.list=()=>{
  if(!S.notifs.length)return empty("bell","Sem notificações","Recebe aqui o fecho da entrada, correcções e avisos.");
  const I={fecho:"lock",pronto:"hourglass",aprovado:"badge-check",correcao:"pencil",sync:"cloud-off",atencao:"triangle-alert"};
  return `<div class="list">${S.notifs.map(n=>`<div class="row" style="align-items:flex-start;${n.lida?"":"background:var(--info-bg)"}"><span class="av" style="width:34px;height:34px">${ic(I[n.tipo]||"bell")}</span>
   <button class="who" data-a="abrirnotif" data-id="${n.id}" style="border:0;background:none;text-align:left;padding:0"><b>${esc(n.titulo)}</b><small style="white-space:normal">${esc(n.desc)}</small><small>${n.quando}${n.link?" · abrir":""}</small></button>
   ${n.lida?`<span class="chip c-idle">Lida</span>`:`<button class="btn ghost sm" data-a="ler" data-id="${n.id}" aria-label="Marcar como lida">${ic("check")}</button>`}</div>`).join("")}</div>`;
};
function gerentesHTML(wizard){
  const g=S.membros.filter(m=>m.perfil==="gerente");
  const lista=g.length?`<div class="list">${g.map(m=>`<div class="row">${avatar(m)}<span class="who"><b>${esc(m.nome)}</b><small>${esc(m.email||"")}</small></span>${m.ativo?`<button class="btn ghost sm" data-a="gerente-ativo" data-u="${m.user_id}" data-v="0">Retirar acesso</button>`:`<button class="btn ghost sm" data-a="gerente-ativo" data-u="${m.user_id}" data-v="1">Repor acesso</button>`}</div>`).join("")}</div>`:"";
  const conv=S.convites.length?`<div class="sec"><span class="eyebrow">Convites por aceitar</span>${S.convites.map(c=>{const link=`${URL_SITE()}?convite=${c.token}`;return `<div class="card pad sec"><b>${esc(c.nome)} · ${esc(c.email)}</b><div class="copybox"><input class="inp" readonly value="${esc(link)}" id="lk-${c.id}"><button class="btn sec sm" data-a="copiar" data-t="lk-${c.id}">${ic("copy")}Copiar</button></div><div class="btn-row"><button class="btn ghost sm" data-a="revogar" data-id="${c.id}">Cancelar convite</button></div></div>`}).join("")}</div>`:"";
  return `${wizard?`<p style="margin:0;color:var(--muted);font-size:13.5px">O gerente cria conta com o e-mail indicado e abre a ligação do convite. Pode fazer este passo mais tarde em Definições.</p>`:""}${lista}${conv}
   <form id="f-gerente" class="sec" novalidate><div class="grid2"><div class="fld"><label for="g-nome">Nome do gerente</label><input class="inp" id="g-nome"></div><div class="fld"><label for="g-email">E-mail do gerente</label><input class="inp" id="g-email" type="email"></div></div>
   <div id="g-err"></div><button class="btn sec" type="submit">${ic("user-plus")}Criar convite</button></form>`;
}
function botaoAprovar(){
  const d=dia(HOJE());
  if(d.aprovado)return `<button class="btn okb" disabled>${ic("badge-check")}Dia aprovado às ${d.aprovado.hora}</button>`;
  if(!d.fecho)return `<button class="btn pri" disabled>${ic("badge-check")}Aprovar dia · aguarda fecho da entrada</button>`;
  return `<button class="btn pri" data-a="aprovar">${ic("badge-check")}Aprovar dia</button>`;
}
function alertasHoje(){
  const A=[],k=HOJE(),d=dia(k),agora=toMin(AGORA());let geo=false;
  for(const w of trabalhadoresDo(k)){const r=verRec(k,w.id);
    if(d.fecho&&(!r||(!r.entrada&&!r.falta)))A.push({w:w.id,i:"user-round-x",cor:"warn",t:`${w.nome} por marcar`,d:"A entrada foi fechada sem marcação para este trabalhador."});
    else if(r&&r.almS&&!r.almR&&agora>toMin(S.cfg.almFim)+30)A.push({w:w.id,i:"utensils",cor:"warn",t:`${w.nome} sem regresso do almoço`,d:`Saiu para almoço às ${r.almS}.`});
    else if(r&&r.entrada&&!r.saida&&agora>toMin(S.cfg.fim)+60)A.push({w:w.id,i:"log-out",cor:"warn",t:`${w.nome} sem saída`,d:`Entrou às ${r.entrada}. Sem saída, as horas não contam.`});
    else if(r&&r.geo&&Object.values(r.geo).includes("nv")&&!geo){geo=true;A.push({w:w.id,i:"map-pin-off",cor:"faint",t:"Marcações sem localização verificada",d:"Algumas marcações de hoje foram feitas sem GPS disponível. Ficam identificadas em cada registo."})}
  }
  return A;
}
function graficoMes(mes){
  const ks=Object.keys(S.days).filter(k=>k.startsWith(mes)&&S.days[k].aprovado).sort();
  if(!ks.length)return empty("calendar","Sem dias aprovados","O gráfico aparece quando houver dias aprovados neste mês.");
  const vals=ks.map(k=>{const r=S.days[k].resumo,c=contar(k);const tot=r?(+r.presentes+ +r.atrasados+ +r.faltas+ +r.por_marcar):c.total;const pres=c.presentes+c.atrasados;return{k,v:tot?Math.round(pres/tot*100):0}});
  const lo=Math.max(0,Math.floor(Math.min(...vals.map(v=>v.v))/10)*10-10);
  const W0=640,H0=210,L=36,B=26,T=12,R=8,iw=W0-L-R,ih=H0-T-B,bw=iw/Math.max(vals.length,8);
  const y=v=>T+ih-(v-lo)/(100-lo)*ih;
  const ticks=[];for(let v=lo;v<=100;v+=lo>=60?10:20)ticks.push(v);
  const grid=ticks.map(v=>`<line x1="${L}" x2="${W0-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join("");
  const min=Math.min(...vals.map(v=>v.v));
  const bars=vals.map((o,i)=>{const x=L+i*bw+bw*.18,w=bw*.64,yy=y(o.v);return `<rect x="${x}" y="${yy}" width="${w}" height="${T+ih-yy}" rx="3" fill="${o.v===min?"var(--warn)":"var(--primary)"}"><title>${fmtD(o.k)}: ${o.v}% presentes</title></rect><text x="${x+w/2}" y="${H0-8}" text-anchor="middle">${o.k.slice(8)}</text>`}).join("");
  const avg=Math.round(vals.reduce((s,o)=>s+o.v,0)/vals.length);
  return `<svg viewBox="0 0 ${W0} ${H0}" role="img" aria-label="Presença por dia aprovado, média ${avg}%">${grid}${bars}</svg><p style="margin:8px 0 0;font-size:12.5px;color:var(--muted)">Média de presença: <b style="color:var(--ink)">${avg}%</b>. Em laranja, o dia com menor presença (${min}%).</p>`;
}
function dadosRelatorio(semFiltros){
  const R=semFiltros?{mes:S.rep.mes}:S.rep,ks=Object.keys(S.days).filter(k=>k.startsWith(R.mes)&&(S.days[k].fecho||Object.keys(S.days[k].recs).length)).sort();
  const oficiais=ks.filter(k=>S.days[k].aprovado),pendentes=ks.filter(k=>!S.days[k].aprovado);
  const tot={dias:0,faltas:0,atrasos:0,trab:0,extra:0,incompletos:0};
  let linhas=S.ws.map(w=>{const l={w,dias:0,faltas:0,atrasos:0,trab:0,extra:0,incompletos:0,detalhe:[]};
    for(const k of oficiais){const r=S.days[k].recs[w.id];if(!r||(!r.entrada&&!r.falta))continue;const c=calc(r);l.detalhe.push({k,r,c});
      if(c.tipo==="falta")l.faltas++;else{l.dias++;if(c.late)l.atrasos++;if(c.tipo==="ok"){l.trab+=c.trab;l.extra+=c.extra}else l.incompletos++}}
    return l}).filter(l=>l.detalhe.length);
  if(R.w)linhas=linhas.filter(l=>l.w.id===R.w);
  if(R.estado==="faltas")linhas=linhas.filter(l=>l.faltas);if(R.estado==="atrasos")linhas=linhas.filter(l=>l.atrasos);if(R.estado==="incompletos")linhas=linhas.filter(l=>l.incompletos);
  for(const l of linhas)for(const f in tot)tot[f]+=l[f];
  return{oficiais,pendentes,linhas,tot};
}

/* ============================== painéis ============================== */
function timeline(r,k,wid){
  if(!r||(!r.entrada&&!r.falta))return `<div class="card pad" style="color:var(--muted);font-size:13.5px">Sem marcações neste dia.</div>`;
  const ms=(k&&wid&&S.marc[k]&&S.marc[k][wid])||[];
  const info=t=>{const m=ms.filter(x=>MAP_T[x.tipo]===t).pop();if(!m)return null;
    const ap=quando(m.hora_aparelho).hm,sv=quando(m.hora_servidor).hm,dif=Math.round((Date.parse(m.hora_servidor)-Date.parse(m.hora_aparelho))/60000);
    const geo=m.geo_estado==="verificada"?`localização verificada${m.distancia!=null?` a ${m.distancia} m`:""}${m.precisao!=null?` (±${Math.round(m.precisao)} m)`:""}`:"localização não verificada";
    return `Hora do aparelho ${ap} · recebida pelo servidor às ${sv}${dif>=2?` (${m.offline?"enviada sem internet, ":""}${dif} min depois)`:""} · ${geo}`};
  if(r.falta){const i=info("falta");return `<div class="card pad"><div class="tl"><div class="tl-i"><span class="tm" style="color:var(--bad)">Falta</span><span>${esc(r.nota||"Sem motivo indicado")}${r.pend&&r.pend.falta?`<small>Só neste telemóvel. Ainda não foi recebida pelo servidor.</small>`:i?`<small>${i}</small>`:""}</span></div></div></div>`}
  const it=[["entrada","Entrada"]];if(S.cfg.almoco||r.almS)it.push(["almS","Saída para almoço"],["almR","Regresso do almoço"]);it.push(["saida","Saída"]);
  return `<div class="card pad"><div class="tl">${it.map(([f,l])=>{const v=r[f],p=r.pend&&r.pend[f];
    const x=[];if(f==="entrada"&&v&&isLate(r))x.push(`<span style="color:var(--warn);font-weight:700">Atrasado</span>`);
    if(v&&p)x.push(`<span style="color:var(--warn);font-weight:600">Só neste telemóvel</span> · hora do aparelho ${v} · ainda não recebida pelo servidor`);
    else if(v){const i=info(f);if(i)x.push(i);else if(r.geo&&r.geo[f])x.push(geoTxt(r.geo[f]))}
    if(r.corr&&r.corr[f==="entrada"?"Entrada":f==="saida"?"Saída":"-"])x.push("valor corrigido pelo chefe");
    return `<div class="tl-i ${v?"":"none"}"><span class="tm">${v||"—"}</span><span>${l}${x.length?`<small>${x.join(" · ")}</small>`:""}</span></div>`}).join("")}</div></div>`;
}
function painelGerente(wid,erro,gps){
  const w=W(wid),k=HOJE(),r=verRec(k,wid),st=estado(r),[lbl,cls]=EST[st],acc=dia(k).aprovado?[]:accoesPermitidas(r);
  let b=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${chip(lbl,cls)}<span style="color:var(--muted);font-size:13px">${esc(w.funcao)}</span></div>`+timeline(r,k,wid);
  if(r&&r.corr&&Object.keys(r.corr).length)b+=`<div class="ban">${ic("pencil")}<div><b>Registo corrigido pelo chefe.</b>Pode ver o que mudou e porquê em Registos.</div></div>`;
  if(erro&&gps)b+=`<div class="ban ${gps.tipo==="negada"?"bad":"warn"}">${ic(gps.tipo==="negada"?"map-pin-off":"locate-off")}<div><b>${{negada:"Localização bloqueada",imprecisa:"Localização imprecisa",fora:"Fora do local da empresa",indisponivel:"Sem localização",demorada:"Localização demorada",sem_suporte:"Sem localização"}[gps.tipo]||"Localização"}.</b>${esc(erro)}</div></div>
    <div class="btn-row"><button class="btn sec" data-a="marcar" data-t="${gps.acao}" data-w="${wid}">${ic("locate-fixed")}Tentar novamente</button>${!S.cfg.exigirGps&&gps.tipo!=="fora"?`<button class="btn ghost" data-a="marcar" data-t="${gps.acao}" data-w="${wid}" data-semgps="1">Marcar sem localização</button>`:""}</div>
    ${!S.cfg.exigirGps&&gps.tipo!=="fora"?`<p style="margin:0;font-size:12.5px;color:var(--muted)">Se marcar sem localização, o chefe vê a marcação como não verificada.</p>`:S.cfg.exigirGps?`<p style="margin:0;font-size:12.5px;color:var(--muted)">Esta empresa só aceita marcações com localização verificada.</p>`:""}`;
  else if(erro)b+=`<div class="ban bad">${ic("circle-alert")}<div><b>Não foi possível marcar.</b>${esc(erro)}</div></div>`;
  if(acc.length){
    const late=toMin(AGORA())>toMin(S.cfg.ini)+S.cfg.tol;
    b+=`<p style="margin:0;font-size:13.5px;color:var(--muted)">Hora do telemóvel: <b class="num" style="color:var(--ink)">${AGORA()}</b>${acc.includes("entrada")?(late?` · será registado como <b style="color:var(--warn)">atrasado</b>`:" · dentro do horário"):""}</p>`;
    b+=`<div class="btns">${acc.map((a,i)=>`<button class="btn ${a==="falta"?"dan":i===0?"pri":"sec"}" data-a="${a==="falta"?"faltaform":"marcar"}" data-t="${a}" data-w="${wid}">${ic(ACC[a][1])}${ACC[a][0]}</button>`).join("")}</div>`;
    if(acc.length===1&&acc[0]==="almR")b+=`<p style="margin:0;font-size:12.5px;color:var(--muted)">A saída só pode ser marcada depois do regresso do almoço.</p>`;
    b+=`<p style="margin:0;font-size:12px;color:var(--muted);display:flex;gap:6px">${ic("map-pin")}A localização é pedida a cada marcação e validada pelo servidor.${S.cfg.exigirGps?" Esta empresa não aceita marcações sem GPS.":" Sem GPS, a marcação fica identificada como não verificada."}</p>`;
  }else if(dia(k).aprovado)b+=`<p style="margin:0;color:var(--muted);font-size:13.5px">O dia já foi aprovado pelo chefe. Só o chefe pode corrigir registos.</p>`;
  else if(r&&r.falta)b+=`<p style="margin:0;color:var(--muted);font-size:13.5px">Falta registada. Só o chefe pode alterar uma falta.</p>`;
  else b+=`<p style="margin:0;color:var(--muted);font-size:13.5px">Dia terminado para este trabalhador. Os registos não podem ser alterados pelo gerente.</p>`;
  abrir(esc(w.nome),b,avatar(w));
}
function painelFalta(wid){
  const w=W(wid);
  abrir(`Falta · ${esc(w.nome)}`,`<p style="margin:0;color:var(--muted);font-size:13.5px">A falta não conta como entrada. Depois de registada, só o chefe a pode alterar.</p>
   <div class="fld"><label for="f-nota">Motivo (opcional)</label><textarea class="inp" id="f-nota" maxlength="200" placeholder="Ex.: doente, avisou por telefone"></textarea></div>
   <div id="f-err"></div><div class="btns"><button class="btn dan" data-a="marcar" data-t="falta" data-w="${wid}">${ic("user-x")}Confirmar falta</button><button class="btn sec" data-a="trab" data-w="${wid}">Cancelar</button></div>`);
}
function painelFechar(){
  const k=HOJE(),c=contar(k);
  const pendW=trabalhadoresDo(k).filter(w=>estado(verRec(k,w.id))==="pend");
  abrir("Fechar entrada",`<p style="margin:0;color:var(--muted);font-size:13.5px">O chefe recebe o resumo calculado pelo servidor. Depois do fecho continua a poder marcar almoços e saídas.</p>
   ${kpis(c)}
   ${c.pend?`<div class="ban warn">${ic("triangle-alert")}<div><b>${pl(c.pend,"trabalhador ainda está","trabalhadores ainda estão")} por marcar.</b>${pendW.map(w=>esc(w.nome)).join(", ")}. O chefe vai ver que ficaram por marcar.</div></div>
    <label class="check"><input type="checkbox" id="fc-ok">Confirmo que quero fechar a entrada com ${pl(c.pend,"trabalhador","trabalhadores")} por marcar.</label>`:""}
   ${!navigator.onLine?`<div class="ban">${ic("wifi-off")}<div><b>Sem internet.</b>O fecho fica guardado e é enviado ao chefe quando a ligação voltar.</div></div>`:""}
   <div id="fc-err"></div>
   <div class="btns"><button class="btn pri" data-a="confirmfechar">${ic("send")}Confirmar fecho</button><button class="btn sec" data-a="fecharp">Voltar à lista</button></div>`);
}
function painelChefe(wid,k){
  k=k||HOJE();
  const w=W(wid),r=verRec(k,wid),st=estado(r),[lbl,cls]=EST[st];
  let b=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${chip(lbl,cls)}<span style="color:var(--muted);font-size:13px">${esc(w.funcao)} · ${fmtD(k)}</span>${r&&r.corrApos?chip("Corrigido após aprovação","c-warn"):""}</div>`;
  b+=timeline(r,k,wid);
  if(r&&r.orig){const o=r.orig;b+=`<div class="card pad" style="font-size:13px;color:var(--muted)"><b style="color:var(--ink)">Registo original do gerente</b><br>${o.falta?"Falta":`Entrada ${o.entrada||"—"} · saída ${o.saida||"—"}`}. O original e cada marcação ficam guardados; a correcção é uma nova versão.</div>`}
  const aud=S.audit.filter(a=>a.registo===`${k}:${wid}`);
  if(aud.length)b+=`<div class="sec"><div class="sec-h"><h2>Histórico deste registo</h2></div><div class="list">${aud.map(a=>`<div class="row" style="align-items:flex-start"><span class="who"><b>${a.campo}: ${esc(a.antes)} → ${esc(a.depois)}</b><small style="white-space:normal">${a.quando} · ${esc(a.motivo)}</small></span></div>`).join("")}</div></div>`;
  b+=`<button class="btn sec" data-a="corrform" data-w="${wid}" data-k="${k}">${ic("pencil")}Corrigir registo</button>`;
  abrir(esc(w.nome),b,avatar(w));
}
function painelCorrigir(wid,k){
  const w=W(wid),r=verRec(k,wid)||{},isF=!!r.falta;
  abrir(`Correcção · ${esc(w.nome)}`,`
   <div class="ban warn">${ic("shield-alert")}<div><b>Correcção administrativa de ${fmtD(k)}.</b>Fica registada para sempre em Alterações, com o seu nome e o motivo. O gerente também a vê.</div></div>
   <div class="cmp"><span></span><span class="h">Valor actual</span><span class="h">Novo valor</span>
    <span style="font-weight:600;font-size:13px">Situação</span><span class="cur">${isF?"Falta":r.entrada?"Presente":"Por marcar"}</span>
     <select class="inp" id="c-st"><option value="presente" ${!isF?"selected":""}>Presente</option><option value="falta" ${isF?"selected":""}>Falta</option></select>
    <span style="font-weight:600;font-size:13px">Entrada</span><span class="cur">${r.entrada||"—"}</span><input class="inp num" type="time" id="c-en" value="${r.entrada||""}" aria-label="Nova hora de entrada">
    <span style="font-weight:600;font-size:13px">Saída</span><span class="cur">${r.saida||"—"}</span><input class="inp num" type="time" id="c-sa" value="${r.saida||""}" aria-label="Nova hora de saída">
   </div>
   <div class="fld"><label for="c-mot">Motivo da correcção (obrigatório)</label><textarea class="inp" id="c-mot" maxlength="300" placeholder="Ex.: chegou às 07:55, o gerente marcou mais tarde"></textarea></div>
   <div id="c-err"></div><div id="c-conf"></div>
   <div class="btns" id="c-btns"><button class="btn pri" data-a="corrprev" data-w="${wid}" data-k="${k}">${ic("check")}Guardar correcção</button><button class="btn sec" data-a="corrhist" data-w="${wid}" data-k="${k}">Cancelar</button></div>`);
  const sync=()=>{const f=$("#c-st").value==="falta";$("#c-en").disabled=f;$("#c-sa").disabled=f};$("#c-st").onchange=sync;sync();
}
function painelAprovar(){
  const k=HOJE(),c=contar(k);
  const semSaida=trabalhadoresDo(k).filter(w=>{const r=verRec(k,w.id);return r&&r.entrada&&!r.saida});
  const pendW=trabalhadoresDo(k).filter(w=>estado(verRec(k,w.id))==="pend");
  abrir(`Aprovar ${fmtD(k)}`,`<p style="margin:0;color:var(--muted);font-size:13.5px">${longD(k)}. Depois de aprovado, o dia entra no relatório mensal e o gerente deixa de poder marcar. Correcções posteriores ficam identificadas.</p>
   ${kpis(c,true)}
   ${pendW.length?`<div class="ban warn">${ic("user-round-x")}<div><b>${pl(pendW.length,"trabalhador sem marcação","trabalhadores sem marcação")}.</b>${pendW.map(w=>`<button class="link" data-a="trab" data-w="${w.id}">${esc(w.nome)}</button>`).join(", ")}</div></div>`:""}
   ${semSaida.length?`<div class="ban warn">${ic("log-out")}<div><b>${pl(semSaida.length,"trabalhador ainda sem saída","trabalhadores ainda sem saída")}.</b>Se aprovar agora, o gerente já não pode marcar as saídas e as horas ficam incompletas até as corrigir.</div></div>`:""}
   <div id="ap-err"></div>
   <div class="btns"><button class="btn pri" data-a="confirmaprovar">${ic("badge-check")}Aprovar ${fmtD(k)}</button><button class="btn sec" data-a="fecharp">Rever registos primeiro</button></div>`);
}
async function painelTrabalhador(wid){
  const w=W(wid),m=HOJE().slice(0,7);
  try{await garantirMes(m)}catch(e){}
  const ks=Object.keys(S.days).filter(k=>k.startsWith(m)&&S.days[k].recs[wid]).sort().reverse();
  const rows=ks.map(k=>{const r=S.days[k].recs[wid],c=calc(r);return `<tr class="clk" data-a="corrhist" data-w="${wid}" data-k="${k}" tabindex="0"><td>${fmtD(k).slice(0,5)}</td><td>${r.falta?`<span style="color:var(--bad);font-weight:700">Falta</span>`:r.entrada||"—"}</td><td>${r.saida||"—"}</td><td>${c.tipo==="ok"?dur(c.trab):c.tipo==="incompleto"?`<span style="color:var(--warn)">incompl.</span>`:"—"}</td><td>${S.days[k].aprovado?"Sim":"Não"}</td></tr>`}).join("");
  abrir(esc(w.nome),`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${w.ativo?chip("Activo","c-ok"):chip("Desactivado","c-idle")}<span style="color:var(--muted);font-size:13px">${esc(w.funcao)} · criado em ${fmtD(w.criado)}</span></div>
   <div class="btn-row"><button class="btn sec sm" data-a="editw" data-w="${wid}">${ic("pencil")}Editar</button>${w.ativo?`<button class="btn dan sm" data-a="desw" data-w="${wid}">${ic("user-minus")}Desactivar</button>`:`<button class="btn sec sm" data-a="reaw" data-w="${wid}">${ic("user-plus")}Reactivar</button>`}</div>
   <div class="sec"><div class="sec-h"><h2>Assiduidade de ${MESES[+m.slice(5)-1]}</h2><small>toque para corrigir</small></div>
   ${ks.length?`<div class="tw"><table><thead><tr><th>Dia</th><th>Entrada</th><th>Saída</th><th>Horas</th><th>Aprov.</th></tr></thead><tbody>${rows}</tbody></table></div>`:empty("calendar","Sem registos este mês","Os registos aparecem aqui assim que o gerente marcar.")}</div>`,avatar(w));
}
function painelFormW(wid){
  const w=wid?W(wid):{nome:"",funcao:""};
  abrir(wid?"Editar trabalhador":"Adicionar trabalhador",`<form id="fw" novalidate class="sec" data-w="${wid||""}">
   <div class="fld"><label for="w-nome">Nome completo</label><input class="inp" id="w-nome" value="${esc(w.nome)}" maxlength="80" autocomplete="off"></div>
   <div class="fld"><label for="w-fun">Função</label><input class="inp" id="w-fun" value="${esc(w.funcao)}" maxlength="40" list="funcoes"><datalist id="funcoes">${[...new Set(S.ws.map(x=>x.funcao))].map(f=>`<option value="${esc(f)}">`).join("")}</datalist></div>
   <div id="w-err"></div>
   <div class="btns"><button class="btn pri" type="submit">${ic("save")}${wid?"Guardar alterações":"Adicionar trabalhador"}</button><button type="button" class="btn sec" data-a="fecharp">Cancelar</button></div></form>`);
  setTimeout(()=>$("#w-nome")?.focus(),50);
}
function painelRepDet(wid){
  const l=dadosRelatorio(true).linhas.find(x=>x.w.id===wid),w=W(wid);
  if(!l){abrir(esc(w.nome),empty("calendar-x","Sem dias aprovados","Não há registos aprovados para este trabalhador no período."));return}
  const rows=l.detalhe.slice().reverse().map(({k,r,c})=>`<tr class="clk" data-a="corrhist" data-w="${wid}" data-k="${k}" tabindex="0"><td>${fmtD(k).slice(0,5)}</td><td>${r.falta?`<span style="color:var(--bad);font-weight:700">Falta</span>`:`${r.entrada||"—"}${c.late?` <span style="color:var(--warn)">•</span>`:""}`}</td><td>${r.almS?`${r.almS}–${r.almR||"?"}`:"—"}</td><td>${r.saida||"—"}</td><td>${c.tipo==="ok"?dur(c.trab):c.tipo==="incompleto"?`<span style="color:var(--warn)">${c.motivo}</span>`:"—"}</td><td>${c.extra?dur(c.extra):"—"}</td></tr>`).join("");
  abrir(esc(w.nome),`<p style="margin:0;color:var(--muted);font-size:13px">Detalhe diário dos dias aprovados. Ponto laranja = atraso. Toque num dia para corrigir.</p>
   <div class="kpis"><div class="kpi"><b>${l.dias}</b><span>Dias</span></div><div class="kpi"><b>${l.faltas}</b><span>Faltas</span></div><div class="kpi"><b>${l.atrasos}</b><span>Atrasos</span></div><div class="kpi"><b>${dur(l.trab)}</b><span>Horas</span></div></div>
   <div class="tw"><table><thead><tr><th>Dia</th><th>Entrada</th><th>Almoço</th><th>Saída</th><th>Horas</th><th>Extra</th></tr></thead><tbody>${rows}</tbody></table></div>`,avatar(w));
}
function painelMais(){
  const n=naoLidas();
  abrir("Mais",`<div class="list">${[["alteracoes","Alterações","history","Histórico de correcções"],["notificacoes","Notificações","bell",n?`${n} por ler`:"Tudo lido"],["definicoes","Definições","settings","Horário, almoço, localização, gerentes e tema"]].map(([k,l,i,s])=>`<button class="row" data-a="go" data-v="${k}"><span class="av">${ic(i)}</span><span class="who"><b>${l}</b><small>${s}</small></span>${ic("chevron-right")}</button>`).join("")}</div>`);
}

/* ============================== exportação ============================== */
const LIBS={xlsx:"https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",jspdf:"https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",at:"https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"};
const loaded={};
function loadScript(src){return loaded[src]||(loaded[src]=new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>{delete loaded[src];rej(new Error("Não foi possível carregar o gerador do ficheiro. Verifique a internet."))};document.head.appendChild(s)}))}
function descarregar(nome,blob){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
async function exportar(fmt){
  const d=dadosRelatorio(),mes=S.rep.mes,lm=`${MESES[+mes.slice(5)-1]} de ${mes.slice(0,4)}`;
  if(!d.linhas.length)throw{message:"Não há dados aprovados para exportar com estes filtros."};
  const gerado=`${fmtD(HOJE())} ${AGORA()}`;
  const head=["Trabalhador","Função","Dias trabalhados","Faltas","Atrasos","Horas trabalhadas","Horas extra","Registos incompletos"];
  const body=d.linhas.map(l=>[l.w.nome,l.w.funcao,l.dias,l.faltas,l.atrasos,dur(l.trab),dur(l.extra),l.incompletos]);
  const tot=["Total","",d.tot.dias,d.tot.faltas,d.tot.atrasos,dur(d.tot.trab),dur(d.tot.extra),d.tot.incompletos];
  const filtros=[S.rep.w?`Trabalhador: ${W(S.rep.w).nome}`:"Todos os trabalhadores",S.rep.estado?`Situação: ${{faltas:"com faltas",atrasos:"com atrasos",incompletos:"com registos incompletos"}[S.rep.estado]}`:""].filter(Boolean).join(" · ");
  if(fmt==="xlsx"){
    await loadScript(LIBS.xlsx);
    const aoa=[[S.cfg.nome],["Relatório de assiduidade (dias aprovados)"],[`Período: ${lm}`],[`Gerado em: ${gerado}`],[filtros],[],head,...body,tot];
    const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=[{wch:24},{wch:15},{wch:16},{wch:8},{wch:9},{wch:17},{wch:12},{wch:19}];
    const det=[["Data","Trabalhador","Entrada","Saída almoço","Regresso almoço","Saída","Situação","Horas","Extra"]];
    for(const l of d.linhas)for(const{k,r,c}of l.detalhe)det.push([fmtD(k),l.w.nome,r.entrada||"",r.almS||"",r.almR||"",r.saida||"",c.tipo==="falta"?"Falta":c.tipo==="incompleto"?`Incompleto: ${c.motivo}`:c.late?"Atrasado":"Presente",c.tipo==="ok"?dur(c.trab):"",c.extra?dur(c.extra):""]);
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Resumo");const ws2=XLSX.utils.aoa_to_sheet(det);ws2["!cols"]=[{wch:11},{wch:22},{wch:9},{wch:12},{wch:14},{wch:9},{wch:26},{wch:8},{wch:8}];XLSX.utils.book_append_sheet(wb,ws2,"Detalhe diário");
    descarregar(`Assiduidade_${mes}.xlsx`,new Blob([XLSX.write(wb,{bookType:"xlsx",type:"array"})],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  }else{
    await loadScript(LIBS.jspdf);await loadScript(LIBS.at);
    const{jsPDF}=window.jspdf;const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
    doc.setFillColor(30,58,138);doc.rect(0,0,297,24,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(15);doc.text("YFX Ponto Digital",14,11);
    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.text("Relatório de assiduidade (dias aprovados)",14,18);
    doc.setTextColor(14,20,40);doc.setFontSize(11);doc.setFont("helvetica","bold");doc.text(S.cfg.nome,14,33);doc.setFont("helvetica","normal");doc.setFontSize(9.5);
    doc.text(`Período: ${lm}  ·  ${pl(d.oficiais.length,"dia aprovado","dias aprovados")}  ·  ${filtros}`,14,39);doc.text(`Gerado em: ${gerado}`,283,33,{align:"right"});
    doc.autoTable({startY:45,head:[head],body,foot:[tot],theme:"grid",styles:{font:"helvetica",fontSize:9,cellPadding:2.2,lineColor:[226,232,242]},headStyles:{fillColor:[29,78,216],textColor:255},footStyles:{fillColor:[236,239,246],textColor:[14,20,40],fontStyle:"bold"},
      columnStyles:{2:{halign:"right"},3:{halign:"right"},4:{halign:"right"},5:{halign:"right"},6:{halign:"right"},7:{halign:"right"}},
      didDrawPage:()=>{doc.setFontSize(8);doc.setTextColor(91,103,130);doc.text("Registos sem saída ou com almoço sem regresso não contam horas até serem corrigidos.",14,203)}});
    descarregar(`Assiduidade_${mes}.pdf`,doc.output("blob"));
  }
}

/* ============================== eventos ============================== */
document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-a]");if(!el)return;
  const a=el.dataset.a,wid=el.dataset.w,k=el.dataset.k;
  if(a==="fecharp-scrim"){if(e.target===el)fecharPainel();return}
  try{switch(a){
    case"auth":ecraAuth(el.dataset.m);break;
    case"sair":fecharPainel();await sb.auth.signOut();break;
    case"wz":{
      lerPasso();const d=+el.dataset.d;
      if(d>0&&WZ.p<=4){
        if(WZ.p===1&&(!WZ.nome||WZ.nome.length<2))return mostrarErro("#wz-err",{message:"Indique o nome da empresa."});
        if(WZ.p===4){await carregar(el,()=>gravarConfig(WZ,false))} // valida no servidor
      }
      if(d>0&&WZ.p===5&&!S.ws.length)return mostrarErro("#wz-err",{message:"Adicione pelo menos um trabalhador."});
      if(d>0&&WZ.p===6){await carregar(el,()=>gravarConfig(WZ,true));WZ=null;S.view="visao";await arrancar(true);toast("Empresa configurada");break}
      WZ.p=Math.min(6,Math.max(1,WZ.p+d));ecraAssistente();break}
    case"refresh":if(S.copiaLocal&&navigator.onLine){await arrancar(true);break}await actualizar();break;
    case"recarregar":location.reload();break;
    case"go":go(el.dataset.v);break;
    case"mais":painelMais();break;
    case"fecharp":fecharPainel();break;
    case"filtro":S.f.hoje=el.dataset.f;document.querySelectorAll('[data-a="filtro"]').forEach(b=>b.setAttribute("aria-pressed",b===el));renderList();break;
    case"limparfiltro":S.f.hoje="todos";S.q.hoje="";renderView();break;
    case"trab":S.role==="chefe"?painelChefe(wid):painelGerente(wid);break;
    case"faltaform":painelFalta(wid);break;
    case"marcar":{
      const tipo=el.dataset.t,nota=tipo==="falta"?($("#f-nota")?.value||"").trim():"",semGps=el.dataset.semgps==="1";
      try{const res=await carregar(el,()=>marcar(wid,tipo,nota,{semGps}));
        const w=W(wid),nome=w.nome.split(" ")[0];
        const lab={entrada:`Entrada de ${nome}`,almS:`Saída para almoço de ${nome}`,almR:`Regresso do almoço de ${nome}`,saida:`Saída de ${nome}`,falta:`Falta de ${nome}`}[tipo];
        fecharPainel();renderChrome();renderView();
        toast(res.fila?`${lab} guardada neste telemóvel. Será enviada quando houver ligação.`:`${lab} recebida pelo servidor${res.srv==="nao_verificada"?" · localização não verificada":""}`);
      }catch(err){
        if(err&&err.gps){if(tipo==="falta"){$("#layer").innerHTML="";}painelGerente(wid,err.message,{tipo:err.gps,acao:tipo})}
        else if(tipo==="falta"&&$("#f-err"))mostrarErro("#f-err",err);else painelGerente(wid,msgErro(err));
      }
      break}
    case"enviaragora":await carregar(el,async()=>{await sincronizarFila();await actualizar(true)});break;
    case"fechar":painelFechar();break;
    case"confirmfechar":{
      const cb=$("#fc-ok");if(cb&&!cb.checked){$("#fc-err").innerHTML=erroHTML("Marque a confirmação acima para fechar com trabalhadores por marcar.");icons();cb.focus();break}
      try{const r=await carregar(el,fecharEntrada);fecharPainel();renderAll();toast(r==="ok"?"Entrada fechada. O chefe foi notificado.":r==="fila"?"Entrada fechada neste telemóvel. Será enviada quando houver internet.":"A entrada já estava fechada.")}
      catch(err){mostrarErro("#fc-err",err)}break}
    case"aprovar":painelAprovar();break;
    case"confirmaprovar":try{await carregar(el,()=>rpc("aprovar_dia",{p_data:HOJE()}).then(mapDia));await carregarNotifs();fecharPainel();renderAll();toast(`Dia ${fmtD(HOJE())} aprovado`)}catch(err){mostrarErro("#ap-err",err)}break;
    case"corrform":painelCorrigir(wid,k);break;
    case"corrhist":painelChefe(wid,k);break;
    case"corrprev":{
      const v={estado:$("#c-st").value,entrada:$("#c-en").value,saida:$("#c-sa").value,mot:$("#c-mot").value.trim()};
      const r=verRec(k,wid)||{};
      if(v.mot.length<5){mostrarErro("#c-err",{message:"Escreva o motivo da correcção (pelo menos 5 caracteres)."});$("#c-mot").focus();break}
      const ch=[];
      if(v.estado==="falta"){if(!r.falta)ch.push(`Situação: ${r.entrada?"Presente":"Por marcar"} → Falta`)}
      else{if(!v.entrada){mostrarErro("#c-err",{message:"Indique a hora de entrada."});break}
        if(v.saida&&toMin(v.saida)<=toMin(v.entrada)){mostrarErro("#c-err",{message:"A saída tem de ser depois da entrada."});break}
        if(r.falta)ch.push("Situação: Falta → Presente");if((r.entrada||"")!==v.entrada)ch.push(`Entrada: ${r.entrada||"—"} → ${v.entrada}`);if((r.saida||"")!==(v.saida||""))ch.push(`Saída: ${r.saida||"—"} → ${v.saida||"—"}`)}
      if(!ch.length){mostrarErro("#c-err",{message:"Os valores novos são iguais aos actuais. Não há nada para corrigir."});break}
      $("#c-err").innerHTML="";
      $("#c-conf").innerHTML=`<div class="ban warn">${ic("circle-help")}<div><b>Confirmar correcção${dia(k).aprovado?" de um dia já aprovado":""}?</b>${ch.map(esc).join("<br>")}</div></div>`;
      $("#c-btns").innerHTML=`<button class="btn pri" data-a="corrsave" data-w="${wid}" data-k="${k}">${ic("check")}Confirmar e guardar</button><button class="btn sec" data-a="corrform" data-w="${wid}" data-k="${k}">Voltar a editar</button>`;
      ["c-st","c-en","c-sa","c-mot"].forEach(id=>$("#"+id).disabled=true);icons();break}
    case"corrsave":{
      const v={estado:$("#c-st").value,entrada:$("#c-en").value||null,saida:$("#c-sa").value||null,mot:$("#c-mot").value.trim()};
      try{await carregar(el,async()=>{const row=await rpc("corrigir_registo",{p_trabalhador:wid,p_data:k,p_estado:v.estado,p_entrada:v.estado==="falta"?null:v.entrada,p_saida:v.estado==="falta"?null:v.saida,p_motivo:v.mot});
          dia(k).recs[wid]=mapRec(row);await Promise.all([carregarAuditoria(),carregarNotifs(),carregarPeriodo(k,k)])});
        fecharPainel();renderAll();toast("Correcção guardada e registada em Alterações")}
      catch(err){mostrarErro("#c-err",err)}break}
    case"addw":painelFormW();break;
    case"wdet":painelTrabalhador(wid);break;
    case"editw":painelFormW(wid);break;
    case"desw":{const w=W(wid);abrir("Desactivar trabalhador",`<p style="margin:0">Desactivar <b>${esc(w.nome)}</b>? Deixa de aparecer na lista do gerente. Os registos antigos ficam guardados e continuam nos relatórios.</p><div id="dw-err"></div>
      <div class="btns"><button class="btn dan" data-a="desconf" data-w="${wid}" data-v="0">${ic("user-minus")}Desactivar</button><button class="btn sec" data-a="wdet" data-w="${wid}">Cancelar</button></div>`);break}
    case"desconf":case"reaw":{const at=a==="reaw";try{await carregar(el,()=>rpc("definir_trabalhador_ativo",{p_id:wid,p_ativo:at}));await carregarTrabalhadores();fecharPainel();renderAll();toast(`${W(wid).nome} ${at?"reactivado":"desactivado"}`)}catch(err){if($("#dw-err"))mostrarErro("#dw-err",err);else toast(msgErro(err),"bad")}break}
    case"repdet":painelRepDet(wid);break;
    case"exp":try{await carregar(el,()=>exportar(el.dataset.fmt));toast("Ficheiro exportado")}catch(err){toast(msgErro(err),"bad")}break;
    case"altp":S.f.alt=el.dataset.f;document.querySelectorAll('[data-a="altp"]').forEach(b=>b.setAttribute("aria-pressed",b===el));renderList();break;
    case"ler":try{await rpc("marcar_notificacao_lida",{p_id:el.dataset.id});const n=S.notifs.find(x=>x.id===el.dataset.id);if(n)n.lida=true;renderChrome();renderView()}catch(err){toast(msgErro(err),"bad")}break;
    case"lertodas":try{await carregar(el,()=>rpc("marcar_todas_lidas"));S.notifs.forEach(n=>n.lida=true);renderChrome();renderView();toast("Todas as notificações marcadas como lidas")}catch(err){toast(msgErro(err),"bad")}break;
    case"abrirnotif":{const n=S.notifs.find(x=>x.id===el.dataset.id);if(!n)break;if(!n.lida){n.lida=true;rpc("marcar_notificacao_lida",{p_id:n.id}).catch(()=>{})}if(n.link)go(n.link.v);else{renderChrome();renderView()}break}
    case"tema":TEMA=el.dataset.t;try{localStorage.setItem("yfx-ponto-tema",TEMA)}catch(err){}aplicarTema();document.querySelectorAll('[data-a="tema"]').forEach(b=>b.setAttribute("aria-pressed",b.dataset.t===TEMA));toast(`Tema: ${{claro:"claro",escuro:"escuro",sistema:"seguir o sistema"}[TEMA]}`);break;
    case"descartar":await PontoOffline.Fila.remover(el.dataset.id);await recarregarFila();aplicarFila();renderAll();toast("Operação descartada. Nada foi alterado no servidor.");break;
    case"copiar":{const inp=$("#"+el.dataset.t);copiar(inp.value,inp);break}
    case"revogar":try{await carregar(el,()=>rpc("revogar_convite",{p_id:el.dataset.id}));await carregarEquipa();WZ?ecraAssistente():renderView();toast("Convite cancelado")}catch(err){toast(msgErro(err),"bad")}break;
    case"gerente-ativo":try{await carregar(el,()=>rpc("definir_gerente_ativo",{p_user:el.dataset.u,p_ativo:el.dataset.v==="1"}));await carregarEquipa();renderView();toast(el.dataset.v==="1"?"Acesso reposto":"Acesso do gerente retirado")}catch(err){toast(msgErro(err),"bad")}break;
    case"minhaloc":{
      const msg=$("#d-locmsg");
      if(!navigator.geolocation){msg.innerHTML=erroHTML("Este navegador não fornece localização. Introduza as coordenadas manualmente.");icons();break}
      await carregar(el,()=>new Promise(res=>{navigator.geolocation.getCurrentPosition(p=>{$("#d-lat").value=p.coords.latitude.toFixed(6);$("#d-lng").value=p.coords.longitude.toFixed(6);msg.innerHTML=`<p style="margin:0;color:var(--ok);font-size:12.5px;font-weight:600">Coordenadas preenchidas (precisão ±${Math.round(p.coords.accuracy)} m). Guarde para aplicar.</p>`;res()},
        ()=>{msg.innerHTML=erroHTML("Não foi possível obter a localização. Autorize a localização no navegador ou introduza as coordenadas manualmente.");icons();res()},{enableHighAccuracy:true,timeout:10000})}));
      break}
  }}catch(err){toast(msgErro(err),"bad")}
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&$("#layer").innerHTML)fecharPainel();
  if((e.key==="Enter"||e.key===" ")&&e.target.matches("tr[data-a]")){e.preventDefault();e.target.click()}
});
document.addEventListener("input",e=>{const s=e.target.dataset.search;if(s!==undefined){S.q[s]=e.target.value;renderList()}});
document.addEventListener("change",async e=>{
  const t=e.target;
  if(t.dataset.rep){
    if(t.dataset.rep==="ano"){const ms=[...$("#r-mes").options].map(o=>o.value).filter(m=>m.startsWith(t.value));if(ms.length)S.rep.mes=ms[0]}
    else S.rep[t.dataset.rep]=t.value;
    if(t.dataset.rep==="mes"||t.dataset.rep==="ano"){renderList();try{await garantirMes(S.rep.mes)}catch(err){toast(msgErro(err),"bad")}if(t.dataset.rep==="ano")renderView();else renderList()}else renderList();
  }
  if(t.hasAttribute("data-altw")){S.f.altW=t.value;renderList()}
  if(t.id==="d-alm")$("#d-almh").hidden=!t.checked;
});
document.addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target,btn=f.querySelector('[type="submit"]');
  const g=id=>($("#"+id)?.value||"").trim();
  try{
    if(f.id==="f-entrar"){const{error}=await carregar(btn,()=>sb.auth.signInWithPassword({email:g("a-email"),password:$("#a-pass").value}));
      if(error)$("#a-err").innerHTML=erroHTML(/invalid/i.test(error.message)?"E-mail ou palavra-passe incorrectos.":/confirm/i.test(error.message)?"Confirme primeiro o seu e-mail (veja a caixa de entrada).":error.message);icons()}
    if(f.id==="f-registar"){
      if(g("r-nome").length<2)return mostrarErro("#a-err",{message:"Indique o seu nome."});
      if($("#r-pass").value.length<8)return mostrarErro("#a-err",{message:"A palavra-passe tem de ter pelo menos 8 caracteres."});
      const{data,error}=await carregar(btn,()=>sb.auth.signUp({email:g("r-email"),password:$("#r-pass").value,options:{data:{nome:g("r-nome")},emailRedirectTo:URL_SITE()}}));
      if(error)return mostrarErro("#a-err",{message:/registered/i.test(error.message)?"Já existe uma conta com este e-mail. Entre ou recupere a palavra-passe.":error.message});
      if(!data.session)ecraAuth("entrar","Conta criada. Abra o e-mail de confirmação que enviámos e depois entre aqui.");
    }
    if(f.id==="f-recuperar"){const{error}=await carregar(btn,()=>sb.auth.resetPasswordForEmail(g("p-email"),{redirectTo:URL_SITE()}));if(error)return mostrarErro("#a-err",error);ecraAuth("entrar","Se o e-mail tiver conta, recebe uma ligação para definir uma nova palavra-passe.")}
    if(f.id==="f-nova"){if($("#n-pass").value.length<8)return mostrarErro("#a-err",{message:"A palavra-passe tem de ter pelo menos 8 caracteres."});const{error}=await carregar(btn,()=>sb.auth.updateUser({password:$("#n-pass").value}));if(error)return mostrarErro("#a-err",error);toast("Palavra-passe actualizada");arrancar()}
    if(f.id==="f-convite"){await carregar(btn,()=>rpc("aceitar_convite",{p_token:g("c-token")}));try{localStorage.removeItem("yfx-ponto-convite")}catch(err){}toast("Convite aceite");arrancar()}
    if(f.id==="f-ativar"){await carregar(btn,()=>rpc("ativar_empresa",{p_codigo:g("v-cod"),p_empresa:g("v-emp"),p_nome:g("v-nome")}));toast("Empresa activada");arrancar()}
    if(f.id==="fz-w"){await carregar(btn,()=>rpc("adicionar_trabalhador",{p_nome:g("zw-nome"),p_funcao:g("zw-fun")}));await carregarTrabalhadores();ecraAssistente();setTimeout(()=>$("#zw-nome")?.focus(),30)}
    if(f.id==="f-gerente"){await carregar(btn,()=>rpc("convidar_gerente",{p_email:g("g-email"),p_nome:g("g-nome")}));await carregarEquipa();WZ?ecraAssistente():renderView();toast("Convite criado. Copie a ligação e envie ao gerente.")}
    if(f.id==="fw"){const wid=f.dataset.w;
      await carregar(btn,()=>wid?rpc("editar_trabalhador",{p_id:wid,p_nome:g("w-nome"),p_funcao:g("w-fun")}):rpc("adicionar_trabalhador",{p_nome:g("w-nome"),p_funcao:g("w-fun")}));
      await carregarTrabalhadores();fecharPainel();renderAll();toast(wid?"Trabalhador actualizado":"Trabalhador adicionado")}
    if(f.id==="fdef"){
      const o={nome:g("d-nome"),morada:g("d-mor"),ini:g("d-ini"),fim:g("d-fim"),tol:g("d-tol"),prev:g("d-prev"),alm:$("#d-alm").checked,ai:g("d-ai"),af:g("d-af"),lat:g("d-lat"),lng:g("d-lng"),raio:g("d-raio"),gps:$("#d-gps").checked};
      if((o.lat&&isNaN(num(o.lat)))||(o.lng&&isNaN(num(o.lng))))return mostrarErro("#d-err",{message:"As coordenadas não são válidas. Use o formato -25.96530 e 32.58920."});
      await carregar($("#d-save"),()=>gravarConfig(o,true));$("#d-err").innerHTML="";renderChrome();toast("Definições guardadas. Os relatórios foram recalculados.");
    }
  }catch(err){
    const alvo={"f-convite":"#c-err","f-ativar":"#v-err","fz-w":"#zw-err","f-gerente":"#g-err",fw:"#w-err",fdef:"#d-err"}[f.id]||"#a-err";mostrarErro(alvo,err);
  }
});

/* ============================== arranque ============================== */
async function arrancar(manterVista){
  const{data:{session}}=await sb.auth.getSession();
  if(!session){S=novoEstado();ecraAuth("entrar");return}
  const vista=manterVista?S.view:null;
  S=novoEstado();S.user=session.user;
  $("#app").innerHTML=`<div class="boot"><div class="sk"></div></div>`;
  await recarregarFila();
  try{await carregarBase()}catch(e){
    // sem servidor: arranca com a última cópia guardada neste aparelho (só leitura + fila de marcações)
    let c=null;try{c=await PontoOffline.Cache.ler(`copia:${S.user.id}`)}catch(x){}
    if(!c){$("#app").innerHTML=`<div class="login gut"><div class="login-card"><h1>Sem ligação</h1>${erroHTML(msgErro(e))}<p style="margin:0;color:var(--muted);font-size:13.5px">Este aparelho ainda não tem uma cópia dos dados. Ligue-se à internet uma vez para a guardar.</p><button class="btn pri" data-a="recarregar">Tentar novamente</button></div></div>`;icons();return}
    const v=c.v;S.membro=v.membro;S.role=v.membro.perfil;S.cfg=v.cfg;S.ws=v.ws;S.audit=v.audit||[];S.offsetMin=v.offsetMin||0;S.lastSync=v.lastSync;
    S.copiaLocal=v.lastSync||quando(c.em).hm;
    if(v.k===HOJE()){S.srv[v.k]=v.srv;S.marc[v.k]=v.marc;Object.assign(dia(v.k),v.dia)}else{S.srv[HOJE()]={};dia(HOJE())}
    aplicarFila();S.rep.mes=HOJE().slice(0,7);S.view=S.role==="chefe"?"hoje":"hoje";S.carregado[S.rep.mes]=false;
    renderShell();renderChrome();renderView();return;
  }
  if(!S.membro){ecraAssociar();return}
  if(!S.membro.ativo){$("#app").innerHTML=`<div class="login gut"><div class="login-card"><h1>Acesso retirado</h1><p>O seu acesso a esta empresa foi retirado pelo chefe.</p><button class="btn sec" data-a="sair">Terminar sessão</button></div></div>`;return}
  if(S.role==="chefe"&&!S.cfg.configurada){ecraAssistente();return}
  S.rep.mes=HOJE().slice(0,7);
  S.view=vista||(S.role==="chefe"?"visao":"hoje");
  renderShell();renderChrome();$("#view").innerHTML=`<div class="sk" style="height:34px;width:55%"></div><div class="kpis">${'<div class="sk" style="height:74px"></div>'.repeat(4)}</div>`;
  try{await garantirMes(S.rep.mes)}catch(e){toast(msgErro(e),"bad")}
  await actualizar();
}
let ultimoUser=null;
sb.auth.onAuthStateChange((ev,session)=>{
  if(ev==="PASSWORD_RECOVERY"){ecraAuth("nova");return}
  const u=session?session.user.id:null;
  if(ev==="SIGNED_OUT"||(ev==="SIGNED_IN"&&u!==ultimoUser)||ev==="INITIAL_SESSION"){ultimoUser=u;setTimeout(()=>arrancar(),0)}
});
