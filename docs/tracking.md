# Rastreio de envios

A planilha cadastra pedido, cliente, transportadora/AWB, coleta e status administrativo. Status e previsão de entrega vêm da 17TRACK quando configurada, ou das APIs diretas. Nenhuma data ou confirmação de entrega é inventada a partir da planilha.

## Regras

- Reconhece cabeçalhos nas dez primeiras linhas e colunas deslocadas entre abas.
- Lê texto formatado, hyperlinks e resultados salvos de fórmulas sem executar fórmulas.
- Separa múltiplos AWBs; preserva zeros à esquerda em células de texto.
- Transportadora vem do nome explícito; códigos UPS com prefixo 1Z também são reconhecidos. Números sem transportadora ficam para revisão.
- Lê AWBs de redirecionamento como etapas separadas.
- Coleta nos últimos 120 dias entra no monitoramento; cancelados, datas inválidas/ausentes e envios anteriores ficam no histórico. O histórico pode ser consultado individualmente.
- Entregues confirmados pela API deixam a fila automática. A anotação "Entregue" na planilha não equivale à confirmação da API.
- Erros preservam a última resposta válida, exibindo a falha separadamente.
- Com 17TRACK, cada rodada consulta até 120 códigos únicos em até três lotes de 40. Sem 17TRACK, as APIs diretas consultam até cinco códigos por rodada. Priorizam-se os há mais tempo sem consulta; códigos repetidos usam o mesmo resultado. Volume e limites das APIs podem aumentar o intervalo efetivo.
- Alterações de status ficam registradas no banco para uma futura integração de e-mail. Não há envio de mensagens implementado.

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

O banco existente recebe apenas as chaves `tracking-v1` e `tracking-lock` na tabela settings. Lease de 240 segundos impede importações e consultas concorrentes. Configuração inicia pausada.

Para importar por CLI, compilar `scripts/tracking-import.mts` com esbuild e executar com as variáveis do banco. Adicionar `--dry-run` valida sem gravar ou conectar ao banco.

Testes locais cobrem parsing, contratos 17TRACK simulados, cadastros pendentes/duplicados, erros, preservação do cache, lotes, intervalo e bloqueio concorrente com banco em memória. Credenciais e habilitação da conta precisam ser validadas em produção.
