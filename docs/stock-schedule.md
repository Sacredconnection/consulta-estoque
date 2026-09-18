# Atualização periódica

A Vercel Pro chama `/api/jobs/sync` a cada 5 minutos. O servidor inicia uma leitura somente para fontes cujo último snapshot completou o intervalo configurado (30 minutos por padrão), ou que tenham alterações pendentes. A próxima leitura pode começar até cerca de 5 minutos após o vencimento; o tempo de importação depende de cada fonte.

Configure `CRON_SECRET` no ambiente Production da Vercel, com pelo menos 32 caracteres aleatórios. A Vercel envia esse valor automaticamente como Bearer. Publique novamente após configurar a variável. Sem esse segredo, o endpoint recusa a chamada.

Cada execução processa etapas durante até 200 segundos (limite da função: 300 segundos). Catálogos maiores continuam na próxima execução; os bloqueios por fonte impedem que duas execuções avancem a mesma etapa. O snapshot anterior permanece disponível até a publicação completa do novo. A atualização funciona com o navegador fechado.

A regra persistida em `settings.rule` controla `enabled` e `interval`. A API autenticada `PUT /api/rules` aceita intervalos de 5, 15, 30 ou 60 minutos, preservando os campos `minimum` e `target`. Desativar `enabled` pausa o cron. Abrir o site também verifica fontes vencidas; consultas continuam lendo o cache.

O script `scripts/sync-job.mjs` permanece disponível para agendadores externos com `SITE_ORIGIN` e `SYNC_JOB_TOKEN`. O gateway legado é opcional.

## Economia de escritas

Novas sincronizações comparam os produtos com o catálogo publicado e gravam apenas inclusões e alterações reais. O horário de coleta não é uma alteração de estoque: a data da última verificação completa continua em connections.last_sync. Produtos inalterados conservam o updatedAt anterior.

Somente diferenças ficam em preparação. Ao concluir todas as páginas, diferenças e exclusões são aplicadas junto com o checkpoint em uma transação. Consultas continuam vendo o catálogo anterior até essa publicação. IDs encontrados são guardados no cursor para detectar produtos removidos, sem escrever uma linha de presença por produto. Preparações abandonadas são removidas ao iniciar o processamento da execução seguinte; o catálogo publicado é preservado.

Execuções já iniciadas antes desta mudança terminam com o mecanismo anterior. Não há migração de esquema nem limpeza destrutiva do catálogo. Falhas automáticas aguardam pelo menos 30 minutos (ou o intervalo configurado, se maior) antes de reiniciar; uma atualização manual continua disponível.

O rastreio mantém o último horário consultado, mas só acrescenta histórico quando muda o conteúdo da resposta ou o erro. Mudanças de previsão, localização e eventos continuam registradas mesmo com status igual. Automação pausada não adquire bloqueio de escrita; o histórico existente é preservado.

Essas alterações reduzem consumo futuro. Elas não restauram a cota mensal já consumida do provedor.
