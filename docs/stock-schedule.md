# Atualização periódica

A Vercel Pro chama `/api/jobs/sync` a cada 5 minutos. O servidor inicia uma leitura somente para fontes cujo último snapshot completou o intervalo configurado (30 minutos por padrão), ou que tenham alterações pendentes. A próxima leitura pode começar até cerca de 5 minutos após o vencimento; o tempo de importação depende de cada fonte.

Configure `CRON_SECRET` no ambiente Production da Vercel, com pelo menos 32 caracteres aleatórios. A Vercel envia esse valor automaticamente como Bearer. Publique novamente após configurar a variável. Sem esse segredo, o endpoint recusa a chamada.

Cada execução processa etapas durante até 200 segundos (limite da função: 300 segundos). Catálogos maiores continuam na próxima execução; os bloqueios por fonte impedem que duas execuções avancem a mesma etapa. O snapshot anterior permanece disponível até a publicação completa do novo. A atualização funciona com o navegador fechado.

A regra persistida em `settings.rule` controla `enabled` e `interval`. A API autenticada `PUT /api/rules` aceita intervalos de 5, 15, 30 ou 60 minutos, preservando os campos `minimum` e `target`. Desativar `enabled` pausa o cron. Abrir o site também verifica fontes vencidas; consultas continuam lendo o cache.

O script `scripts/sync-job.mjs` permanece disponível para agendadores externos com `SITE_ORIGIN` e `SYNC_JOB_TOKEN`. O gateway legado é opcional.
