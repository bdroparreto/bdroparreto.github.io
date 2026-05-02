# Acompanhamento de Checklists Notorious Fish

MVP mobile first em React + Vite com rotas:
- `/preenchimento`
- `/admin`

## Instalação
```bash
npm install
npm run dev
```

## Dados iniciais
O app lê `data/checklists_delivery_mvp.csv` como base dos cards de checklist.

## Supabase
1. Crie projeto Supabase.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Crie bucket Storage (ex.: `checklist-files`) para anexos.
4. Configure `.env` com base em `.env.example`.

## Deploy Vercel
1. Importar repositório.
2. Build command: `npm run build`
3. Output: `dist`
4. Definir variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Observações MVP
- Sem login/senha.
- Registro do nome do líder por sessão local.
- Exportação CSV sem binários de anexos (somente referência nominal).


## Rotas principais
- `/preenchimento`
- `/admin`
