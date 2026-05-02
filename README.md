# Acompanhamento de Checklists Notorious Fish

MVP mobile first em React + Vite com rotas:
- `/preenchimento`
- `/admin`

## Instalação
```bash
npm install
npm run dev
```

## Persistência de dados (Supabase)
- O app salva submissions, anexos e manutenção no Supabase.
- O `localStorage` é usado somente para lembrar o nome do líder na sessão.
- Os cards de checklist em `/preenchimento` são carregados da tabela `checklists` (não do CSV local).

## Configuração Supabase
1. Crie um projeto no Supabase.
2. Execute **novamente** `supabase/schema.sql` no SQL Editor.
   - Esse script cria/ajusta tabelas, políticas e faz seed dos checklists do MVP.
   - Também inclui `csv_id` para manter vínculo estável com o ID do CSV.
3. Crie o bucket Storage `checklist-files`.
4. Deixe o bucket com leitura pública para visualização dos anexos no admin.
5. Configure `.env` com:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Seed de checklists
O seed no `schema.sql` insere os checklists do CSV `data/checklists_delivery_mvp.csv` com IDs fixos (1..9), garantindo que `submissions.checklist_id` sempre aponte para um `checklists.id` válido.

Se a tabela `checklists` estiver vazia, basta executar o `schema.sql` para popular automaticamente.

## Deploy Vercel
1. Importar repositório.
2. Build command: `npm run build`
3. Output: `dist`
4. Definir variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Rotas principais
- `/preenchimento`
- `/admin`
