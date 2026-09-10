# Cache persistente e alterações

Consultas e abertura do site leem o último snapshot salvo no Turso. O cache não expira por tempo, recarregamento do navegador ou novo deploy. Falhas de sincronização preservam o snapshot anterior. Um catálogo vazio também é um resultado válido e não dispara importações repetidas.

As verificações periódicas consultam somente o estado no Turso. Uma fonte só é lida novamente quando ainda não tem catálogo, quando sua interpretação muda ou quando recebe uma notificação de alteração. Uma fonte pendente não reinicia as que já estão atualizadas. `Atualizar manualmente` permite forçar a leitura; `Retomar atualização` continua as etapas pendentes.

## WooCommerce

Para atualizar automaticamente quando houver mudança, configure webhooks nas lojas. A chave de leitura WooCommerce não configura webhooks automaticamente.

| Fonte | Variável secreta na Vercel | URL de entrega |
|---|---|---|
| Sacred | `WOO_SACRED_WEBHOOK_SECRET` | `https://consulta-estoque.vercel.app/api/webhooks/stock/sacred` |
| Maya | `WOO_MAYA_WEBHOOK_SECRET` | `https://consulta-estoque.vercel.app/api/webhooks/stock/maya` |
| SC23 | `WOO_SC23_WEBHOOK_SECRET` | `https://consulta-estoque.vercel.app/api/webhooks/stock/sc23` |

Use um segredo exclusivo por loja, com o mesmo valor na Vercel e no webhook. Configure os eventos de criação, atualização, remoção e restauração de produtos; inclua os eventos de mudança de estoque de produtos e variações usados pela loja. O endpoint valida a assinatura HMAC-SHA256 antes de marcar o cache como alterado. O ping inicial sem assinatura apenas confirma conectividade e não altera dados.

A notificação somente invalida o cache. A página aberta e o cron da Vercel detectam fontes pendentes e executam as etapas. O agendamento também relê os estoques ao vencer o intervalo configurado, mesmo sem webhooks. Veja [Atualização periódica](stock-schedule.md) para a configuração de 30 minutos e autenticação do cron.

## Pagnier / Nomus

O relatório público disponibiliza os saldos paginados, mas não foi identificado um sinal confiável de versão dos dados. A aplicação não usa a data de estrutura do relatório como prova de estoque inalterado.

O cache Pagnier fica salvo até uma atualização manual ou um aviso externo. Se a automação que alimenta o Nomus puder notificar mudanças, configure `PAGNIER_CHANGE_TOKEN` na Vercel e envie `POST /api/webhooks/stock/pagnier` com `Authorization: Bearer <token>`. O aviso marca apenas a Pagnier para nova leitura.

## Concorrência

Cada fonte mantém `source_revision` e `snapshot_revision`. A sincronização salva a revisão existente no seu início. Uma notificação recebida durante a leitura mantém uma revisão maior pendente, mesmo após publicar o snapshot, evitando perder mudanças.

Referência: [webhooks WooCommerce](https://woocommerce.com/document/webhooks/).
