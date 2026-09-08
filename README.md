# Elo · Estoque Wholesale

Sistema web para consultar estoques de Sacred Snuff, Maya Herbs e SC23 Trading.

## Credenciais: somente arquivo local
As chaves ficam no arquivo **.env.local**, ignorado pelo Git. O painel apenas mostra o status das conexões. Não há formulário nem endpoint para cadastrar chaves, e elas não são gravadas no banco.

São aceitas as variáveis existentes:
- BRINCR_SITE_URL, BRINCR_CONSUMER_KEY, BRINCR_CONSUMER_SECRET
- H&F_SITE_URL, H&F_CONSUMER_KEY, H&F_CONSUMER_SECRET

A loja é identificada pelo hostname HTTPS exato, não pelo nome do prefixo. Também são aceitos os nomes canônicos de .env.example, que contém somente campos vazios.

Após mudar o .env.local, reinicie o servidor. Somente o servidor recebe as chaves; o build de produção e o navegador não as incluem. Nenhuma credencial das lojas foi enviada à hospedagem.

O site publicado não acessa o arquivo deste computador e continuará sem consultas reais até que a infraestrutura de execução seja definida para isso.

## Desenvolvimento
Node >=22.13.0 e npm.
1. npm install
2. Configure .env.local com as credenciais de leitura do WooCommerce.
3. Aplique as migrações de drizzle/ ao D1 local com Wrangler, em ordem. A migração 0001 cria o progresso persistente da sincronização.
4. npm run dev
5. Abra /signin-with-chatgpt?return_to=/ na sessão local se necessário.

O banco D1 guarda snapshots, status e regras, sem as chaves das lojas. A coluna legada credentials contém apenas o marcador environment nas conexões atuais.

## Uso
- A primeira abertura inicia ou retoma conexões ainda não consultadas. O botão atualiza as lojas em etapas curtas, com progresso por loja, e retoma execuções interrompidas.
- Consulta de estoque: busca por nome ou SKU e comparação entre lojas.
- Agente: consultas guiadas de produto/SKU, estoque baixo e reposição.
- Reposição: sugestões por nível mínimo e exportação CSV.
- Automações: mínimo, estoque desejado e intervalo de atualização.
- Conexões: apenas leitura do status. Lojas sem par de credenciais no ambiente ficam ocultas em todas as telas e respostas do agente.
- Sem nenhuma loja configurada, o painel mostra um estado vazio, sem dados de demonstração.

## Regras de estoque
- API REST v3 por HTTPS, Basic Auth somente no servidor e origens fixas. Redirecionamentos não são seguidos.
- Produtos e variações paginados; até 10.000 itens por endpoint e 50.000 registros por loja. Cada etapa lê no máximo uma página de produtos e seis páginas de variações em paralelo.
- Agrupamento por SKU idêntico, sensível a maiúsculas. Produtos sem SKU ou duplicados na mesma loja ficam isolados.
- N/D indica quantidade não controlada; — indica produto não encontrado.
- Estoque compartilhado de variações é contado apenas na linha do produto pai.
- Cada etapa grava seus registros e o cursor na mesma transação D1. O snapshot só é publicado quando todas as etapas terminam. Falhas preservam o estoque anterior.
- Execuções em andamento mostram progresso e ocultam o erro da tentativa anterior. Repetir o clique retoma a execução existente. Concorrência retorna estado ocupado, sem fabricar falha de credenciais.
- A data de atualização é registrada no fim da execução. A tabela de consulta exibe 50 produtos por página.
- Sugestão = max(0, alvo − max(0, estoque)), quando estoque <= mínimo. Não considera demanda, pedidos em trânsito ou fornecedores e não altera as lojas.

## Monitoramento
Atualização automática com o painel aberto. Ao fechar a página, o progresso já concluído permanece salvo; a próxima abertura retoma as etapas. Não há agendador externo ativo.
scripts/sync-job.mjs e POST /api/jobs/sync preparam a integração com cron, mas dependem de autenticação de máquina e infraestrutura ainda não configuradas. Não há envio de e-mails ou mensagens externas.

## Validação em 08/09/2026
- Sacred Snuff: autenticação e sincronização reais concluídas; 937 registros de produtos e variações. Consulta do agente validada com dados reais.
- Maya Herbs: o teste mais recente com o arquivo local retornou HTTP 200. O 401 anterior não tinha detalhes preservados suficientes para determinar a causa.
- SC23 Trading: sem credenciais no arquivo; loja ocultada.
- Testes: node scripts/test.mjs
- Tipos: npx tsc --noEmit
- Produção: npm run build
- Teste visual de navegador não solicitado; WebMCP não verificado em contexto real.

## Referências
- [WooCommerce REST API](https://developer.woocommerce.com/docs/apis/rest-api/)
- [Produtos](https://developer.woocommerce.com/docs/apis/rest-api/v3/products/)
- [Variações](https://developer.woocommerce.com/docs/apis/rest-api/v3/product-variations/)
