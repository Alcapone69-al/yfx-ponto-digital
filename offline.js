/* YFX Ponto Digital — armazenamento local (IndexedDB), fila de operações e localização */
"use strict";
(function(){
const DB_NOME="yfx-ponto",DB_VER=1;
let dbp=null;
function abrirDB(){
  if(dbp)return dbp;
  dbp=new Promise((res,rej)=>{
    if(!("indexedDB" in window))return rej(new Error("Este navegador não suporta armazenamento local (IndexedDB)."));
    const rq=indexedDB.open(DB_NOME,DB_VER);
    rq.onupgradeneeded=()=>{const db=rq.result;
      if(!db.objectStoreNames.contains("fila")){const s=db.createObjectStore("fila",{keyPath:"id"});s.createIndex("utilizador_seq",["utilizador","seq"])}
      if(!db.objectStoreNames.contains("cache"))db.createObjectStore("cache",{keyPath:"k"});
      if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"k"});
    };
    rq.onsuccess=()=>{const db=rq.result;db.onversionchange=()=>db.close();res(db)};
    rq.onerror=()=>rej(rq.error);rq.onblocked=()=>rej(new Error("A base de dados local está bloqueada por outro separador. Feche os outros separadores da app."));
  });
  return dbp;
}
function tx(stores,modo,fn){return abrirDB().then(db=>new Promise((res,rej)=>{const t=db.transaction(stores,modo);let out;t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error("Operação local cancelada"));out=fn(t)}))}
const req=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});

/* ---------------- fila persistente ---------------- */
// Cada operação recebe um id (uuid) ANTES do envio. O servidor usa esse id como chave primária:
// reenviar a mesma operação nunca cria duplicados. A ordem é dada por "seq", atribuído na criação.
const Fila={
  async actualizar(op){return tx(["fila"],"readwrite",t=>{t.objectStore("fila").put(op)})},
  async remover(id){return tx(["fila"],"readwrite",t=>{t.objectStore("fila").delete(id)})},
};
/* listar devolve uma promessa dentro da transacção; resolver depois do oncomplete */
Fila.listar=async utilizador=>{const db=await abrirDB();return new Promise((res,rej)=>{const t=db.transaction("fila","readonly");const r=t.objectStore("fila").index("utilizador_seq").getAll(IDBKeyRange.bound([utilizador,0],[utilizador,Number.MAX_SAFE_INTEGER]));r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})};
Fila.adicionar=async op=>{const db=await abrirDB();return new Promise((res,rej)=>{const t=db.transaction(["fila","meta"],"readwrite");const m=t.objectStore("meta");const g=m.get("seq");
  g.onsuccess=()=>{const v=(g.result?.v||0)+1;m.put({k:"seq",v});op.seq=v;op.estado="pendente";op.tentativas=0;op.criado=new Date().toISOString();t.objectStore("fila").add(op)};
  t.oncomplete=()=>res(op);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error("Não foi possível guardar a operação neste telemóvel."))})};

/* ---------------- cache de leitura (arranque sem internet) ---------------- */
const Cache={
  async guardar(k,v){const db=await abrirDB();return new Promise((res,rej)=>{const t=db.transaction("cache","readwrite");t.objectStore("cache").put({k,v,em:new Date().toISOString()});t.oncomplete=res;t.onerror=()=>rej(t.error)})},
  async ler(k){const db=await abrirDB();return new Promise((res,rej)=>{const t=db.transaction("cache","readonly");const r=t.objectStore("cache").get(k);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})},
};

/* ---------------- sincronização ordenada ---------------- */
// Classificação das falhas:
//  rede      -> a operação fica pendente e volta a ser tentada (backoff); a ordem mantém-se.
//  conflito  -> o registo mudou no servidor (outra marcação, correcção ou dia aprovado). Nunca se substitui nada:
//               a operação fica parada até o gerente a descartar, com o estado actual do servidor à vista.
//  recusada  -> regra do servidor (GPS, relógio, permissões). Fica parada com o motivo.
function classificar(e){
  const m=(e&&e.message)||"";
  if(!navigator.onLine||/fetch|network|Load failed|timeout|NetworkError|aborted/i.test(m)||(e&&[0,408,502,503,504].includes(e.status)))return"rede";
  if(/JWT|jwt expired|Sessão inválida/i.test(m)||(e&&e.status===401))return"sessao";
  if(/já não é permitida|já foi aprovado|já fechou/i.test(m))return"conflito";
  return"recusada";
}
let aEnviar=false;
async function sincronizar(utilizador,enviar,aoMudar){
  if(aEnviar)return{ocupado:true};
  const corpo=async()=>{
    aEnviar=true;
    try{
      const ops=(await Fila.listar(utilizador)).filter(o=>o.estado==="pendente"||o.estado==="a_enviar");
      let enviadas=0,paradas=0;
      for(const o of ops){
        if(o.proximaTentativa&&Date.now()<o.proximaTentativa)break; // respeita o backoff e mantém a ordem
        o.estado="a_enviar";o.tentativas=(o.tentativas||0)+1;o.ultimaTentativa=new Date().toISOString();await Fila.actualizar(o);aoMudar&&aoMudar();
        try{
          const r=await enviar(o);
          await Fila.remover(o.id);enviadas++;
          o.resposta=r;aoMudar&&aoMudar(o,"enviada");
        }catch(e){
          const tipo=classificar(e);
          if(tipo==="rede"||tipo==="sessao"){o.estado="pendente";o.erro=tipo==="sessao"?"Sessão expirada. Entre novamente para enviar.":"Sem ligação ao servidor.";
            o.proximaTentativa=Date.now()+Math.min(60000,2000*2**Math.min(o.tentativas,5));await Fila.actualizar(o);aoMudar&&aoMudar(o,tipo);break}
          o.estado=tipo;o.erro=e.message||"Recusada pelo servidor.";o.proximaTentativa=null;await Fila.actualizar(o);paradas++;aoMudar&&aoMudar(o,tipo);
        }
      }
      return{enviadas,paradas};
    }finally{aEnviar=false}
  };
  // impede envios em paralelo de vários separadores da mesma app
  if(navigator.locks&&navigator.locks.request)return navigator.locks.request("yfx-ponto-sync",{ifAvailable:true},lock=>lock?corpo():{ocupado:true});
  return corpo();
}

/* ---------------- localização ---------------- */
// Devolve sempre um objecto com "estado". Nunca inventa coordenadas.
//  ok           -> coordenadas, precisão e (se a empresa tiver local definido) distância
//  negada       -> o utilizador recusou a permissão
//  indisponivel -> o aparelho não conseguiu obter posição
//  demorada     -> passou o tempo limite
//  sem_suporte  -> o navegador não tem geolocalização
function distancia(a,b,c,d){const R=6371000,t=x=>x*Math.PI/180,dl=t(c-a),dn=t(d-b),h=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dn/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(h)))}
function obterLocalizacao(empresa,{tempo=10000}={}){
  if(!("geolocation" in navigator))return Promise.resolve({estado:"sem_suporte"});
  return new Promise(res=>{
    let fim=false;const acabar=v=>{if(!fim){fim=true;res(v)}};
    setTimeout(()=>acabar({estado:"demorada"}),tempo+1500);
    try{navigator.geolocation.getCurrentPosition(p=>{
        const g={estado:"ok",lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy),em:new Date(p.timestamp||Date.now()).toISOString()};
        if(empresa&&empresa.lat!=null&&empresa.lng!=null){g.dist=distancia(g.lat,g.lng,empresa.lat,empresa.lng);g.imprecisa=g.acc>empresa.raio;g.fora=!g.imprecisa&&g.dist>empresa.raio}
        acabar(g)},
      e=>acabar({estado:e.code===1?"negada":e.code===3?"demorada":"indisponivel"}),
      {enableHighAccuracy:true,timeout:tempo,maximumAge:0});
    }catch(e){acabar({estado:"indisponivel"})}
  });
}
const MENSAGEM_GPS={
  negada:"A permissão de localização foi recusada. Abra as definições do navegador, permita a localização para este site e tente novamente.",
  indisponivel:"O telemóvel não conseguiu obter a localização. Ligue o GPS (localização) e tente novamente, de preferência perto de uma janela ou ao ar livre.",
  demorada:"A localização demorou demasiado. Verifique se o GPS está ligado e tente novamente.",
  sem_suporte:"Este navegador não fornece localização. Use o Chrome actualizado no telemóvel."
};

window.PontoOffline={abrirDB,Fila,Cache,sincronizar,classificar,obterLocalizacao,distancia,MENSAGEM_GPS};
})();
