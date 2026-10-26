# YFX Ponto Digital

Livro de ponto digital para PMEs em Moçambique. O gerente marca no local, o chefe acompanha, corrige com motivo e aprova o dia.

## Estrutura

- Raiz do repositório — aplicação (PWA) publicada no GitHub Pages: `index.html`, `app.js`, `offline.js` (IndexedDB, fila e GPS), `sw.js`, `config.js`, manifesto e ícones.
- `supabase/001_esquema.sql` — tabelas, RLS, funções do servidor e auditoria imutável (já aplicado no projecto Supabase).
- `supabase/testes.sql` — 41 testes das regras do servidor. Corre dentro de uma transacção e desfaz tudo no fim.
- `testes/teste_offline.py` — 21 testes de falha do cliente (Playwright) com um servidor simulado.

## Publicar no GitHub Pages

1. Crie no GitHub um repositório público chamado `yfx-ponto-digital`.
2. Os ficheiros da app já estão na raiz do repositório.
3. Em Settings → Pages, escolha a branch `main` e a pasta onde estão os ficheiros.
4. O endereço fica `https://<utilizador>.github.io/yfx-ponto-digital/`.

## Configurar o Supabase (uma vez)

Em Authentication → URL Configuration do projecto Supabase:

- **Site URL**: o endereço do GitHub Pages.
- **Redirect URLs**: o mesmo endereço (necessário para a confirmação de e-mail e a recuperação de palavra-passe).

O envio de e-mails do Supabase gratuito tem limite por hora. Para clientes reais, configure um SMTP próprio em Authentication → SMTP.

## Activar uma empresa

Os chefes só existem através de um código de activação emitido pela YFX (tabela `codigos_ativacao`, sem acesso pela API). Para criar um código, no SQL Editor do Supabase:

```sql
insert into public.codigos_ativacao(codigo, plano, limite, notas)
values ('YFX-0001-XXXX', 'medio', 30, 'Nome do cliente');
```

Planos: `pequeno` (15), `medio` (30), `grande` (60). O cliente cria conta, introduz o código e segue o assistente de configuração. O gerente entra pela ligação de convite criada pelo chefe.

## Correr os testes

```bash
python3 testes/teste_offline.py          # precisa de playwright e das bibliotecas em LIBS
```

`supabase/testes.sql` corre no SQL Editor; o resultado aparece como um erro final com o relatório (é assim que os dados de teste são desfeitos).
