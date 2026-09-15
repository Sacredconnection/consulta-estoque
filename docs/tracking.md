# Rastreio de envios

A planilha cadastra pedido, cliente, transportadora/AWB, coleta e status administrativo. Status de entrega e previsão vêm exclusivamente das APIs das transportadoras. Nenhuma data ou confirmação de entrega é inventada a partir da planilha.

## Regras

- Reconhece cabeçalhos nas dez primeiras linhas e colunas deslocadas entre abas.
- Lê texto formatado, hyperlinks e resultados salvos de fórmulas sem executar fórmulas.
- Separa múltiplos AWBs; preserva zeros à esquerda em células de texto.
- Transportadora vem do nome explícito; códigos UPS com prefixo 1Z também são reconhecidos. Números sem transportadora ficam para revisão.
- Lê AWBs de redirecionamento como etapas separadas.
- Coleta nos últimos 120 dias entra no monitoramento; cancelados, datas inválidas/ausentes e envios anteriores ficam no histórico. O histórico pode ser consultado individualmente.
- Entregues confirmados pela API deixam a fila automática. A anotação "Entregue" na planilha não equivale à confirmação da API.
- Erros preservam a última resposta válida, exibindo a falha separadamente.
- Cada rodada consulta até cinco envios, priorizando os há mais tempo sem consulta; códigos repetidos usam o mesmo resultado. Volume e limites das APIs podem aumentar o intervalo efetivo.
- Alterações de status ficam registradas no banco para uma futura integração de e-mail. Não há envio de mensagens implementado.

## Fonte

Importar .xlsx na aba Rastreio (até 4 MB). Reimportar substitui o cadastro da área, preservando resultados das mesmas chaves; não altera a planilha nem o estoque. O arquivo enviado não é publicado no repositório.

O OneDrive ainda não está conectado: este modo usa a última importação. Para novos cadastros, reenviar o arquivo. A automação continua consultando os códigos importados sem depender do navegador.

## Credenciais no servidor

- `DHL_TRACKING_API_KEY`: Shipment Tracking Unified.
- `FEDEX_CLIENT_ID` e `FEDEX_CLIENT_SECRET`: projeto de produção com Track API habilitada.
- `UPS_CLIENT_ID` e `UPS_CLIENT_SECRET`: projeto de produção com Tracking API habilitada.
- `CRON_SECRET`: segredo com pelo menos 32 caracteres, também exigido pelo job.

Fontes oficiais: https://developer.dhl.com/tracking ; https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html ; https://github.com/UPS-API/api-documentation/blob/main/Tracking.yaml

USPS e transportadoras não reconhecidas ficam explicitamente pendentes. Não há scraping de CAPTCHA ou uso de endpoints privados.

## Execução

`/api/tracking` usa a autenticação existente do aplicativo e valida origem nas alterações. `/api/jobs/tracking` exige Bearer CRON_SECRET. Vercel invoca a cada cinco minutos; o intervalo salvo (5/15/30/60) determina a elegibilidade de cada envio. Requer plano de hospedagem que suporte essa frequência.

O banco existente recebe apenas as chaves `tracking-v1` e `tracking-lock` na tabela settings. Lease de 240 segundos impede importações e consultas concorrentes. Configuração inicia pausada.

Para importar por CLI, compilar `scripts/tracking-import.mts` com esbuild e executar com as variáveis do banco. Adicionar `--dry-run` valida sem gravar ou conectar ao banco.

Testes locais cobrem parsing; as integrações de produção precisam de validação com credenciais reais antes de ativar a automação.
