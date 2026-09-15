# Rastreio de envios

A planilha cadastra pedido, cliente, transportadora/AWB, coleta e status administrativo. Status e previsão de entrega vêm da 17TRACK quando configurada, ou das APIs diretas. Nenhuma data ou confirmação de entrega é inventada a partir da planilha.

## Regras

- Reconhece cabeçalhos nas dez primeiras linhas e colunas deslocadas entre abas.
- Lê texto formatado, hyperlinks e resultados salvos de fórmulas sem executar fórmulas.
- Separa múltiplos AWBs; preserva zeros à esquerda em células de texto.
- Transportadora vem do nome explícito; códigos UPS com prefixo 1Z também são reconhecidos. Números sem transportadora ficam para revisão.
- Lê AWBs de redirecionamento como etapas separadas.
- Coleta nos últimos 120 dias entra no monitoramento; cancelados, datas inválidas/ausentes e envios anteriores ficam no histórico. O histórico pode ser consultado individualmente.
- Pedidos marcados como **Entregue** no status da planilha ou na coluna Entregue (x/sim/data) ficam fora de todas as consultas, automáticas ou manuais, inclusive por ID. A regra também protege dados já importados com status textual, sem exigir reimportação. Códigos repetidos ficam bloqueados se qualquer cadastro os marcar como entregues.
- "Não entregue" e "Saiu para entrega" não ativam essa exclusão. Em redirecionamentos, o status de entrega no hub pertence à primeira etapa, e o status da segunda fase é independente.
- Entregues confirmados pela API deixam a fila automática. A informação da planilha continua identificada como tal, sem inventar uma confirmação da API. Registros excluídos de rastreio permanecem visíveis ao marcar "Incluir histórico, entregues e cancelados".
- Erros preservam a última resposta válida, exibindo a falha separadamente.
- Com 17TRACK, cada rodada consulta até 120 códigos únicos em até três lotes de 40. Sem 17TRACK, as APIs diretas consultam até cinco códigos por rodada. Priorizam-se os há mais tempo sem consulta; códigos repetidos usam o mesmo resultado. Volume e limites das APIs podem aumentar o intervalo efetivo.
- Toda tentativa de consulta fica registrada na tabela `tracking_history`, inclusive respostas sem mudança de status, alteração de previsão, processamento pendente e erros. Não há envio de e-mails implementado.

## Fonte

Importar .xlsx na aba Rastreio (até 4 MB). Reimportar substitui o cadastro da área, preservando resultados das mesmas chaves; não altera a planilha nem o estoque. O arquivo enviado não é publicado no repositório.

O OneDrive ainda não está conectado: este modo usa a última importação. Para novos cadastros, reenviar o arquivo. A automação continua consultando os códigos importados sem depender do navegador.

## Credenciais no servidor

- `TRACK17_API_KEY`: provedor unificado preferencial. Basta esta chave para usar os canais mapeados; não são exigidas chaves FedEx/DHL/UPS adicionais pelo aplicativo. Habilitação e limites de canais dependem da conta 17TRACK.
- `DHL_TRACKING_API_KEY`: Shipment Tracking Unified.
- `FEDEX_CLIENT_ID` e `FEDEX_CLIENT_SECRET`: projeto de produção com Track API habilitada.
- `UPS_CLIENT_ID` e `UPS_CLIENT_SECRET`: projeto de produção com Tracking API habilitada.
- `CRON_SECRET`: segredo com pelo menos 32 caracteres, também exigido pelo job.

Fontes oficiais: https://developer.dhl.com/tracking ; https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html ; https://github.com/UPS-API/api-documentation/blob/main/Tracking.yaml

USPS utiliza 17TRACK. Transportadoras não reconhecidas ficam explicitamente pendentes. Não há scraping de CAPTCHA ou uso de endpoints privados.

## Integração 17TRACK v2.4

Documentação: https://api.17track.net/en/doc . Lista de canais: https://res.17track.net/asset/carrier/info/apicarrier.all.json .

- Usa `gettrackinfo` primeiro. Apenas códigos retornados como não cadastrados (`-18019902`) são enviados a `register`.
- Cadastro duplicado (`-18019901`) é tratado como já aceito. Cadastro ou processamento pendente não vira confirmação de entrega.
- Cada novo cadastro pode consumir saldo da conta. O sistema não exclui/recria assinaturas, nem usa `getRealTimeTrackInfo`, nem solicita tradução de terceiros.
- Envia código, canal e data de coleta quando disponível. Não envia nomes de clientes, pedidos, e-mails ou a planilha inteira à 17TRACK.
- Canais: DHL Express 100001, FedEx 100003, UPS 100002, USPS 21051; códigos DHL iniciados em JVGL usam DHL Parcel NL 100047.
- `Atualizar agora` lê o último resultado disponível na 17TRACK. Não força uma nova consulta instantânea na transportadora. A frequência de coleta da 17TRACK é independente do intervalo do dashboard.
- Exibe origem 17TRACK, horário do evento e da consulta ao provedor separadamente. Estimativas preservam a origem fornecida (por exemplo Official) e não são calculadas pelo dashboard.
- Não requer endpoint de webhook do aplicativo para a leitura por consulta periódica. Se a conta exigir webhook ou habilitação específica, a recusa é exibida como pendência.
- Chave só é lida no servidor. O dashboard expõe apenas se está configurada, não afirma que foi validada apenas por existir.

## Execução

`/api/tracking` usa a autenticação existente do aplicativo e valida origem nas alterações. `/api/jobs/tracking` exige Bearer CRON_SECRET. Vercel invoca a cada cinco minutos; o intervalo salvo (5/15/30/60) determina a elegibilidade de cada envio. Requer plano de hospedagem que suporte essa frequência.

O banco guarda o estado atual em `settings` (`tracking-v1` e `tracking-lock`) e o histórico permanente em `tracking_history`. Lease de 240 segundos impede importações e consultas concorrentes. Configuração inicia pausada.

## Histórico para consumo posterior

A tabela é criada de forma idempotente na primeira operação de histórico/rastreio; a mesma estrutura também está na migração `0004_tracking_history.sql`. Os resumos antigos ainda disponíveis são migrados uma única vez; registros que a versão anterior já havia descartado não podem ser reconstruídos.

- Sem descarte automático após 2.000 registros. Cada registro tem ID crescente, tipo, horário, pedido, cliente, tracking, transportadora e snapshot normalizado da resposta.
- Eventos `consultation` incluem `data.response` (resposta nova ou null), `data.error`, `data.previousStatus`, provedor e snapshot do cadastro/cache. `changed` indica mudança de status; alterações de previsão também são preservadas mesmo sem mudança de status.
- Não é armazenado o corpo bruto completo de todos os eventos da transportadora: a resposta normalizada contém status, descrição, previsão, origem, localização e horários disponíveis.
- Estado atual e eventos da consulta são gravados na mesma transação. Falha ao salvar não publica um cache sem o histórico correspondente.
- Eventos `baseline`, `legacy`, `import` e `removed` preservam cadastros, resumos antigos e reimportações. Remover um pedido da planilha não remove os seus eventos do banco.
- No dashboard, o botão de histórico em cada envio abre os registros paginados.

Endpoint autenticado: `GET /api/tracking/history`. Aceita filtros exatos `shipmentId`, `tracking`, `order`, além de `limit` (1–200, padrão 50) e `before` (cursor de ID). Retorna `{items, nextCursor}` em ordem decrescente de ID. Use `nextCursor` como `before` para consumir a próxima página, inclusive para pedidos já removidos do cadastro atual. Usa a mesma autenticação do aplicativo; não é uma API pública de clientes.

Exemplo: `/api/tracking/history?tracking=123456789012&limit=50`.

Para importar por CLI, compilar `scripts/tracking-import.mts` com esbuild e executar com as variáveis do banco. Adicionar `--dry-run` valida sem gravar ou conectar ao banco.

Testes locais cobrem parsing, contratos 17TRACK simulados, cadastros pendentes/duplicados, erros, preservação do cache, lotes, intervalo e bloqueio concorrente com banco em memória. Credenciais e habilitação da conta precisam ser validadas em produção.
