# Acompanhamento de Checklists Notorious Fish

Rotas:
- `/preenchimento` (operação)
- `/admin` (admin)

## Importante (atualização MVP)
- A tela `/preenchimento` agora usa apenas 4 cards: **ABERTURA**, **TROCA DE TURNO**, **FECHAMENTO**, **MANUTENÇÃO**.
- Os itens internos são gerados do CSV `data/checklists_delivery_mvp.csv` (colunas novas) com fallback para estrutura oficial do prompt caso o CSV ainda esteja no formato antigo.
- Não há link para `/admin` na tela operacional.

## Supabase
Execute novamente `supabase/schema.sql` no SQL Editor para aplicar:
- novas colunas em `submissions` (`checklist_name`, `responses_json`)
- suporte de vínculo de arquivo por item em `submission_files.checklist_item`
- novas tabelas compatíveis (`checklist_items`, `submission_item_responses`)
- seed dos 4 checklists principais do MVP

Bucket de arquivos: `checklist-files`.

## Build
```bash
npm install
npm run build
```


## Anexos (Storage)
- Arquivos de imagem/PDF são enviados para o bucket `checklist-files` no Supabase Storage.
- O admin abre anexos via URL assinada temporária (signed URL), sem salvar link permanente no banco.
- No admin, anexos com mais de 40 dias são exibidos como **expirado**.
- Limpeza física automática de arquivos antigos pode ser adicionada futuramente com rotina agendada.


## Resumo diário por e-mail (Vercel Cron + Resend)
Variáveis necessárias:
- `RESEND_API_KEY`
- `DAILY_SUMMARY_TO` (um ou mais e-mails separados por vírgula)
- `DAILY_SUMMARY_FROM` (ex.: `Notorious Fish <onboarding@resend.dev>`)

Agendamento automático:
- `30 10 * * *` (10h30 UTC = 7h30 em São Paulo)
- Endpoint: `/api/daily-summary`

Teste manual:
- `/api/daily-summary?dryRun=true` (não envia e-mail, só retorna resumo)
- `/api/daily-summary?send=true` (envia e-mail de teste)

Opcional de segurança:
- `CRON_SECRET` para exigir `Authorization: Bearer <CRON_SECRET>` no endpoint.

Verifique execução e erros nos logs da Vercel (Functions).
