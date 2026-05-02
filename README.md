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
Os dados de preenchimento **não** são salvos em localStorage.
- Submissões: tabela `submissions`
- Anexos: tabela `submission_files`
- Manutenção: tabela `maintenance_records`
- Uploads: bucket `checklist-files`

O `localStorage` é usado somente para lembrar temporariamente o nome do Líder no campo inicial.

## Configuração Supabase
1. Crie um projeto no Supabase.
2. Execute `supabase/schema.sql` no SQL Editor (script idempotente).
3. Crie o bucket Storage chamado `checklist-files`.
4. No bucket, permita leitura dos arquivos (público) para visualização no admin.
5. Configure `.env` com base no `.env.example`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

> Se você já tinha executado a versão antiga do schema, execute novamente `supabase/schema.sql` para aplicar `if not exists`, índices e políticas RLS abertas do MVP.

## Dados iniciais
A estrutura visual dos checklists é carregada do arquivo `data/checklists_delivery_mvp.csv`.

## Deploy Vercel
1. Importar repositório.
2. Build command: `npm run build`
3. Output: `dist`
4. Definir variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Rotas principais
- `/preenchimento`
- `/admin`
