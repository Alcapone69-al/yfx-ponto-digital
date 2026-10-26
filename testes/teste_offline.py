"""Testes de falha do YFX Ponto Digital (cliente) com um servidor Supabase simulado.

Cobre: GPS (permissão negada, imprecisão, fora do raio, sucesso), marcação sem internet com fila em IndexedDB,
persistência após recarregar sem internet (service worker), sincronização ordenada, resposta perdida (sem duplicados),
conflito com o servidor, dois separadores a sincronizar ao mesmo tempo, e distinção hora do aparelho / hora do servidor.
As regras do servidor (RLS, permissões, auditoria, isolamento) são testadas em supabase/testes.sql.
"""
import asyncio, json, re, sys, threading, time, uuid, os, functools
from datetime import datetime, timezone, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LIBS = os.environ.get("LIBS", "/tmp/claude-0/-home-claude/5485f709-f9f4-5736-b9f2-bc831fcf0e9d/scratchpad/libs")
SB = "https://qabuzctazvjphelesfql.supabase.co"
EMP = {"lat": -25.96530, "lng": 32.58920}
UID = "11111111-1111-4111-8111-111111111111"
EID = "22222222-2222-4222-8222-222222222222"
WS = [("33333333-3333-4333-8333-00000000000%d" % i, n, f) for i, (n, f) in enumerate([("Ana Cossa", "Caixa"), ("Rui Tembe", "Armazém"), ("Eva Bila", "Limpeza")], 1)]
MZ = timezone(timedelta(hours=2))

def hoje(): return datetime.now(MZ).strftime("%Y-%m-%d")

class Servidor:
    """Imita as funções do servidor que importam para a fila: idempotência, transições e conflitos."""
    def __init__(self):
        self.marcacoes = {}; self.registos = {}; self.dias = {}; self.chamadas = []
        self.offline = False; self.perder_resposta = 0
    def registar(self, a):
        self.chamadas.append(("registar_marcacao", a["p_id"], a["p_tipo"], a.get("p_offline")))
        if a["p_id"] in self.marcacoes:
            return 200, {"duplicada": True, "registo": self.reg_json(a["p_trabalhador"]), "geo": self.marcacoes[a["p_id"]]["geo_estado"]}
        r = self.registos.setdefault(a["p_trabalhador"], {"entrada": None, "almoco_saida": None, "almoco_regresso": None, "saida": None, "falta": False})
        t = a["p_tipo"]
        ok = {"entrada": r["entrada"] is None and not r["falta"], "falta": r["entrada"] is None and not r["falta"],
              "almoco_saida": r["entrada"] is not None and r["almoco_saida"] is None and r["saida"] is None,
              "almoco_regresso": r["almoco_saida"] is not None and r["almoco_regresso"] is None,
              "saida": r["entrada"] is not None and r["saida"] is None and (r["almoco_saida"] is None or r["almoco_regresso"] is not None)}[t]
        if not ok:
            return 400, {"code": "P0001", "message": "Esta marcação já não é permitida: o registo do trabalhador mudou entretanto (por exemplo, outra marcação ou uma correcção do chefe).", "details": None, "hint": None}
        hora = datetime.fromisoformat(a["p_hora_aparelho"].replace("Z", "+00:00")).astimezone(MZ).strftime("%H:%M:00")
        if t == "falta": r["falta"] = True
        else: r[t] = hora
        geo = "verificada" if a.get("p_lat") is not None else "nao_verificada"
        self.marcacoes[a["p_id"]] = {"id": a["p_id"], "trabalhador_id": a["p_trabalhador"], "data": hoje(), "tipo": t, "hora_aparelho": a["p_hora_aparelho"],
            "hora_servidor": datetime.now(timezone.utc).isoformat(), "geo_estado": geo, "distancia": 8 if geo == "verificada" else None, "precisao": a.get("p_precisao"), "offline": bool(a.get("p_offline"))}
        return 200, {"duplicada": False, "registo": self.reg_json(a["p_trabalhador"]), "geo": geo}
    def reg_json(self, wid):
        r = self.registos.get(wid, {})
        geo = {m["tipo"]: m["geo_estado"] for m in self.marcacoes.values() if m["trabalhador_id"] == wid}
        return {"empresa_id": EID, "data": hoje(), "trabalhador_id": wid, "entrada": r.get("entrada"), "almoco_saida": r.get("almoco_saida"), "almoco_regresso": r.get("almoco_regresso"),
                "saida": r.get("saida"), "falta": r.get("falta", False), "nota": None, "geo": geo, "original": None, "campos_corrigidos": [], "corrigido_apos_aprovacao": False}

SRV = Servidor()

def empresa():
    return {"id": EID, "nome": "Empresa Teste, Lda", "morada": "Maputo", "lat": EMP["lat"], "lng": EMP["lng"], "raio": 100, "exigir_gps": False,
            "hora_inicio": "08:00:00", "hora_fim": "17:00:00", "tolerancia": 10, "almoco": True, "almoco_inicio": "12:00:00", "almoco_fim": "13:00:00",
            "minutos_previstos": 480, "plano": "medio", "limite_trabalhadores": 30, "subscricao_estado": "activa", "configurada": True, "criado_em": "2026-10-01T08:00:00Z"}

async def responder_supabase(route):
    req = route.request; url = req.url; path = url.split("supabase.co", 1)[1]
    if SRV.offline: return await route.abort("internetdisconnected")
    tabela = re.match(r"/rest/v1/([a-z_/]+)", path)
    nome = tabela.group(1) if tabela else ""
    obj = "vnd.pgrst.object" in (req.headers.get("accept") or "")
    def ok(body, status=200): return route.fulfill(status=status, content_type="application/json", body=json.dumps(body), headers={"access-control-allow-origin": "*", "content-range": "0-0/*"})
    if nome == "rpc/agora_servidor": return await ok(datetime.now(timezone.utc).isoformat())
    if nome == "rpc/registar_marcacao":
        a = json.loads(req.post_data)
        st, body = SRV.registar(a)
        if SRV.perder_resposta > 0 and st == 200:
            SRV.perder_resposta -= 1
            return await route.abort("connectionreset")  # o servidor gravou, mas a resposta não chegou ao telemóvel
        return await ok(body, st)
    if nome == "rpc/fechar_entrada":
        a = json.loads(req.post_data); SRV.chamadas.append(("fechar_entrada", a["p_fecho_id"]))
        d = SRV.dias.setdefault(a["p_data"], {"empresa_id": EID, "data": a["p_data"], "fecho_id": a["p_fecho_id"], "fechado_em": datetime.now(timezone.utc).isoformat(), "aprovado_em": None, "resumo_fecho": None, "corrigido_apos_aprovacao": False, "aprovado_por_nome": None})
        return await ok(d)
    if nome == "membros":
        m = {"user_id": UID, "empresa_id": EID, "perfil": "gerente", "nome": "Gerente Teste", "email": "g@teste.local", "ativo": True}
        return await ok(m if obj else [m])
    if nome == "empresas": return await ok(empresa() if obj else [empresa()])
    if nome == "trabalhadores": return await ok([{"id": i, "nome": n, "funcao": f, "ativo": True, "criado_em": "2026-10-01T08:00:00Z", "empresa_id": EID} for i, n, f in WS])
    if nome == "registos": return await ok([SRV.reg_json(w) for w in SRV.registos])
    if nome == "marcacoes": return await ok(list(SRV.marcacoes.values()))
    if nome == "dias": return await ok(list(SRV.dias.values()))
    if nome in ("auditoria", "notificacoes", "convites"): return await ok([])
    return await ok({"message": "não simulado: " + path}, 404)

def servir():
    h = functools.partial(SimpleHTTPRequestHandler, directory=APP)
    h.log_message = lambda *a, **k: None
    s = ThreadingHTTPServer(("127.0.0.1", 8765), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s

def sessao():
    exp = int(time.time()) + 3600 * 24
    tok = "eyJhbGciOiJIUzI1NiJ9." + __import__("base64").urlsafe_b64encode(json.dumps({"sub": UID, "exp": exp, "role": "authenticated"}).encode()).decode().rstrip("=") + ".x"
    return json.dumps({"access_token": tok, "token_type": "bearer", "expires_in": 86400, "expires_at": exp, "refresh_token": "r",
                       "user": {"id": UID, "email": "g@teste.local", "aud": "authenticated", "role": "authenticated", "user_metadata": {}, "app_metadata": {}}})

RESULTADOS = []
def verificar(nome, cond, extra=""):
    RESULTADOS.append((nome, bool(cond), extra)); print(("OK   " if cond else "FALHA") + " " + nome + (f" — {extra}" if extra else ""))

async def preparar(ctx):
    async def cdn(route):
        u = route.request.url
        f = f"{LIBS}/supabase-supabase-js-2.45.4/package/dist/umd/supabase.js" if "supabase-js" in u else f"{LIBS}/lucide-0.453.0/package/dist/umd/lucide.min.js" if "lucide" in u else None
        if f: return await route.fulfill(path=f, content_type="application/javascript", headers={"access-control-allow-origin": "*"})
        return await route.abort()
    await ctx.route(re.compile(r"https://(unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)/.*"), cdn)
    await ctx.route(re.compile(r"https://qabuzctazvjphelesfql\.supabase\.co/.*"), responder_supabase)
    await ctx.add_init_script(f"try{{if(!localStorage.getItem('sb-qabuzctazvjphelesfql-auth-token'))localStorage.setItem('sb-qabuzctazvjphelesfql-auth-token',{json.dumps(sessao())})}}catch(e){{}}")

async def fila(pg): return await pg.evaluate("PontoOffline.Fila.listar(%r)" % UID)
async def esperar_app(pg): await pg.wait_for_selector("#lst .row", timeout=15000)
async def abrir_trab(pg, i): await pg.evaluate("document.querySelectorAll('.toast').forEach(x=>x.classList.add('old'))"); await pg.click(f'#lst [data-w="{WS[i][0]}"]'); await pg.wait_for_selector("#pbody")
async def toast_txt(pg):
    await pg.wait_for_selector(".toast:not(.old)", timeout=15000); return " | ".join(await pg.locator(".toast").all_inner_texts())

async def main():
    srv = servir()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        base = dict(viewport={"width": 390, "height": 844}, service_workers="allow")
        # ---------- 1. GPS: permissão negada ----------
        ctx = await b.new_context(**base); await preparar(ctx); pg = await ctx.new_page()
        await pg.goto("http://127.0.0.1:8765/"); await esperar_app(pg)
        await abrir_trab(pg, 0); await pg.click('#pbody [data-a="marcar"][data-t="entrada"]')
        await pg.wait_for_selector("text=Localização bloqueada", timeout=15000)
        verificar("GPS negado mostra mensagem e não envia nada", not [c for c in SRV.chamadas if c[0] == "registar_marcacao"])
        verificar("GPS negado oferece 'Marcar sem localização'", await pg.locator('[data-semgps="1"]').count() == 1)
        await pg.click('[data-semgps="1"]'); t = await toast_txt(pg)
        verificar("Marcar sem localização é aceite e identificada", "não verificada" in t and SRV.marcacoes and list(SRV.marcacoes.values())[-1]["geo_estado"] == "nao_verificada", t)
        await ctx.close()

        # ---------- 2. GPS impreciso e fora do raio ----------
        ctx = await b.new_context(**base, permissions=["geolocation"], geolocation={"latitude": EMP["lat"], "longitude": EMP["lng"], "accuracy": 500})
        await preparar(ctx); pg = await ctx.new_page(); await pg.goto("http://127.0.0.1:8765/"); await esperar_app(pg)
        n0 = len(SRV.chamadas)
        await abrir_trab(pg, 1); await pg.click('#pbody [data-a="marcar"][data-t="entrada"]')
        await pg.wait_for_selector("text=Localização imprecisa", timeout=15000)
        verificar("GPS impreciso (±500 m) é bloqueado no aparelho", len(SRV.chamadas) == n0, await pg.locator(".ban.warn").first.inner_text())
        await ctx.set_geolocation({"latitude": EMP["lat"] + 0.01, "longitude": EMP["lng"], "accuracy": 12})
        await pg.click('#pbody [data-a="marcar"]:not([data-semgps])')
        await pg.wait_for_selector("text=Fora do local da empresa", timeout=15000)
        txt = await pg.locator("#pbody").inner_text()
        verificar("Fora do raio mostra a distância e não envia", len(SRV.chamadas) == n0 and re.search(r"cerca de 1\d{3} m", txt) is not None, re.search(r"cerca de \d+ m", txt).group(0) if re.search(r"cerca de \d+ m", txt) else "")
        verificar("Fora do raio não oferece marcar sem localização", await pg.locator('[data-semgps="1"]').count() == 0)
        # ---------- 3. GPS correcto, online ----------
        await ctx.set_geolocation({"latitude": EMP["lat"], "longitude": EMP["lng"], "accuracy": 15})
        await pg.click('#pbody [data-a="marcar"]:not([data-semgps])'); t = await toast_txt(pg)
        verificar("Entrada com GPS dentro do raio é recebida pelo servidor", "recebida pelo servidor" in t and list(SRV.marcacoes.values())[-1]["geo_estado"] == "verificada", t)
        verificar("Fila vazia depois do envio", len(await fila(pg)) == 0)
        await ctx.close()

        # ---------- 4. Sem internet: fila em IndexedDB, recarregar, ordem, envio ----------
        ctx = await b.new_context(**base, permissions=["geolocation"], geolocation={"latitude": EMP["lat"], "longitude": EMP["lng"], "accuracy": 10})
        await preparar(ctx); pg = await ctx.new_page(); await pg.goto("http://127.0.0.1:8765/"); await esperar_app(pg)
        await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await esperar_app(pg)   # garante a app em cache
        SRV.offline = True; await ctx.set_offline(True); await pg.evaluate("dispatchEvent(new Event('offline'))")
        await abrir_trab(pg, 2); await pg.click('#pbody [data-a="marcar"][data-t="entrada"]'); t = await toast_txt(pg)
        verificar("Sem internet: marcação guardada no telemóvel", "guardada neste telemóvel" in t, t)
        await pg.evaluate("document.querySelectorAll('.toast').forEach(x=>x.remove())")
        await abrir_trab(pg, 2); await pg.click('#pbody [data-a="marcar"][data-t="almS"]'); await toast_txt(pg)
        f = await fila(pg)
        verificar("Duas operações na fila, por ordem", [o["args"]["p_tipo"] for o in f] == ["entrada", "almoco_saida"] and f[0]["seq"] < f[1]["seq"], str([(o["seq"], o["args"]["p_tipo"]) for o in f]))
        ids = [o["id"] for o in f]
        await pg.reload(); await pg.wait_for_selector("#view", timeout=15000)
        await pg.wait_for_timeout(800)
        f2 = await fila(pg)
        verificar("Recarregar sem internet: app abre (service worker) e a fila mantém-se", [o["id"] for o in f2] == ids, await pg.locator(".pill").first.inner_text())
        await pg.click('.bnav [data-v="registos"]'); await pg.wait_for_timeout(400)
        reg = await pg.locator("#view").inner_text()
        verificar("Registos mostra hora do aparelho e 'ainda não foi recebida pelo servidor'", "Hora do aparelho" in reg and "Ainda não foi recebida pelo servidor" in reg)
        # resposta perdida na primeira operação: o servidor grava mas o telemóvel não sabe
        SRV.perder_resposta = 1; SRV.offline = False; await ctx.set_offline(False); await pg.evaluate("dispatchEvent(new Event('online'))")
        for _ in range(60):
            await pg.wait_for_timeout(500)
            if not await fila(pg): break
            await pg.evaluate("sincronizarFila()")
        env = [c for c in SRV.chamadas if c[0] == "registar_marcacao" and c[1] in ids]
        verificar("Sincronização respeita a ordem", [c[2] for c in env if c[1] == ids[0]][:1] == ["entrada"] and env.index(next(c for c in env if c[1] == ids[1])) > env.index(next(c for c in env if c[1] == ids[0])), str([(c[2], c[3]) for c in env]))
        verificar("Resposta perdida: reenvio com o mesmo id não duplica", sum(1 for m in SRV.marcacoes if m in ids) == 2 and len([c for c in env if c[1] == ids[0]]) >= 2, f"envios da 1.ª op: {len([c for c in env if c[1]==ids[0]])}, marcações gravadas: {sum(1 for m in SRV.marcacoes if m in ids)}")
        verificar("Operações feitas sem internet chegam marcadas como offline", all(c[3] for c in env))
        verificar("Fila vazia depois de sincronizar", not await fila(pg))
        await pg.evaluate("actualizar()"); await pg.click('.bnav [data-v="hoje"]'); await pg.wait_for_timeout(300); await abrir_trab(pg, 2)
        tl = await pg.locator("#pbody").inner_text()
        verificar("Painel distingue hora do aparelho e hora de recepção do servidor", "Hora do aparelho" in tl and "recebida pelo servidor às" in tl, tl.split("\n")[3] if len(tl.split("\n")) > 3 else tl)
        await pg.click('[data-a="fecharp"]')

        # ---------- 5. Conflito: o servidor mudou enquanto o telemóvel estava sem internet ----------
        SRV.offline = True; await ctx.set_offline(True); await pg.evaluate("dispatchEvent(new Event('offline'))")
        await abrir_trab(pg, 0); acc = await pg.locator('#pbody [data-a="marcar"]').first.get_attribute("data-t")
        await pg.click(f'#pbody [data-a="marcar"][data-t="{acc}"]'); await toast_txt(pg)
        # entretanto, no servidor, o mesmo campo foi preenchido (ex.: correcção do chefe)
        campo = {"almS": "almoco_saida", "saida": "saida", "entrada": "entrada"}[acc]
        SRV.registos[WS[0][0]][campo] = "12:01:00"
        n_antes = len(SRV.marcacoes)
        SRV.offline = False; await ctx.set_offline(False); await pg.evaluate("dispatchEvent(new Event('online'))")
        for _ in range(30):
            await pg.wait_for_timeout(500)
            f = await fila(pg)
            if f and f[0]["estado"] == "conflito": break
            await pg.evaluate("sincronizarFila()")
        f = await fila(pg)
        verificar("Conflito fica parado na fila e não substitui o servidor", f and f[0]["estado"] == "conflito" and SRV.registos[WS[0][0]][campo] == "12:01:00" and len(SRV.marcacoes) == n_antes, f and f[0]["erro"])
        await pg.click('.bnav [data-v="registos"]'); await pg.wait_for_timeout(500)
        reg = await pg.locator("#view").inner_text()
        verificar("Registos mostra o conflito com o estado actual do servidor", "Conflito" in reg and "No servidor agora" in reg)
        await pg.click('[data-a="descartar"]'); await pg.wait_for_timeout(500)
        verificar("Descartar remove a operação local", not await fila(pg))

        # ---------- 6. Dois separadores a sincronizar ao mesmo tempo ----------
        SRV.offline = True; await ctx.set_offline(True); await pg.evaluate("dispatchEvent(new Event('offline'))")
        await pg.click('.bnav [data-v="hoje"]'); await pg.wait_for_timeout(300)
        await abrir_trab(pg, 1); await pg.click('#pbody [data-a="marcar"]'); await toast_txt(pg)
        ff = await fila(pg); print("   fila:", [(o["estado"], o["args"]["p_tipo"]) for o in ff], (await pg.locator("#pbody").inner_text())[:200] if await pg.locator("#pbody").count() else "")
        op = ff[0]["id"]
        pg2 = await ctx.new_page(); SRV.offline = False; await ctx.set_offline(False)
        await pg2.goto("http://127.0.0.1:8765/"); await esperar_app(pg2)
        await asyncio.gather(pg.evaluate("sincronizarFila()"), pg2.evaluate("sincronizarFila()"), pg.evaluate("sincronizarFila()"))
        await pg.wait_for_timeout(1500)
        envios = [c for c in SRV.chamadas if c[0] == "registar_marcacao" and c[1] == op]
        verificar("Dois separadores: a operação é enviada uma só vez", len(envios) == 1 and not await fila(pg), f"envios: {len(envios)}")
        await ctx.close()
        await b.close()
    srv.shutdown()
    falhas = [r for r in RESULTADOS if not r[1]]
    print(f"\n{len(RESULTADOS) - len(falhas)}/{len(RESULTADOS)} testes passaram")
    sys.exit(1 if falhas else 0)

asyncio.run(main())
