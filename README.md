# Elo · Agente de estoque

Interface web somente com o agente de consulta de estoque. Pergunte por nome ou SKU para comparar as lojas configuradas, consultar estoques baixos e obter sugestões de reposição.

## Credenciais locais

As chaves ficam exclusivamente em **.env.local**, ignorado pelo Git. Não há formulário nem endpoint para cadastrar chaves. Elas não entram no navegador, no banco, no build ou na hospedagem.

Prefixos locais aceitos:
- BRINCR_SITE_URL, BRINCR_CONSUMER_KEY, BRINCR_CONSUMER_SECRET
- H&F_SITE_URL, H&F_CONSUMER_KEY, H&F_CONSUMER_SECRET

A associação usa o hostname HTTPS exato de Sacred Snuff, Maya Herbs ou SC23 Trading. Os nomes canônicos de .env.example também são aceitos. Lojas sem um par completo de credenciais ficam ocultas, inclusive nos resultados. Após editar .env.local, reinicie o servidor local.

O site publicado não acessa o arquivo deste computador; as consultas reais estão disponíveis no localhost configurado.

## Desenvolvimento

Node >=22.13.0 e npm.

1. npm install
2. Configure .env.local com as credenciais de leitura WooCommerce.
3. Aplique, em ordem, as migrações de drizzle/ ao D1 local com Wrangler. A migração 0001 cria o progresso persistente da sincronização.
4. npm run dev
5. Abra /signin-with-chatgpt?return_to=/ na sessão local se necessário.

O D1 guarda snapshots, status e regras. A coluna legada credentials contém somente o marcador environment.

## Consultas e mensagens

- A única tela é o chat, com exemplos de perguntas, status das lojas e botão Atualizar estoques.
- As respostas são mensagens formatadas com títulos por loja e produto, listas de variações, quantidade disponível e data da última sincronização.
- Latas: apresentações de 5, 10, 20 ou 50 g.
- Granel (atacado): demais apresentações com peso identificado. Cada linha mostra unidades × peso unitário em kg. A resposta soma por produto, por loja e entre as lojas consultadas.
- O peso líquido vem do atributo da apresentação, com unidade explícita em g/gr/gramas ou kg. Um nome com peso explícito pode ser usado quando não há atributo. O campo de peso de transporte e o SKU não são usados para estimar conteúdo.
- Kits, pesos ambíguos e apresentações sem peso identificado ficam separados e fora dos totais em kg.
- Quantidade não informada nunca é tratada como zero. Totais com variações de granel sem saldo conhecido são identificados como parciais.
- Saldos compartilhados do produto pai são identificados e não entram nas somas de kg das variações.
- O agente realiza consultas guiadas; não há modelo generativo ou previsão de demanda configurados.
- Reposição sugerida = max(0, alvo − max(0, estoque)), quando estoque <= mínimo. Não altera as lojas e não considera vendas ou pedidos em trânsito.

## Maya Herbs / Polylang

Todas as páginas de produtos e variações solicitam lang=en. As respostas incluem lang e translations. Um idioma explicitamente diferente interrompe a atualização sem publicar dados misturados.

Alguns registros se declaram ingleses, mas translations.en aponta para outro ID. Esses aliases são excluídos; somente a versão canônica inglesa entra no catálogo. A paginação usa a contagem original da resposta para não parar cedo quando aliases são removidos.

O catálogo persistido possui versão de interpretação. Snapshots anteriores ao filtro de idioma e à classificação de peso não são utilizados nas novas respostas. A primeira abertura inicia sua substituição; dados antigos não geram totais temporariamente duplicados.

## Atualização

- HTTPS, Basic Auth somente no servidor, origens fixas e redirecionamentos recusados.
- Produtos e variações paginados: até 10.000 itens por endpoint e 50.000 registros por loja.
- Cada etapa lê no máximo uma página de produtos e seis páginas de variações em paralelo.
- Registros e progresso são gravados na mesma transação D1. A publicação acontece somente ao concluir todas as etapas da loja. Falhas preservam o último snapshot compatível.
- O botão retoma execuções interrompidas; progresso e erros aparecem junto ao chat.
- Atualização automática com a página aberta, respeitando as regras já salvas. Fechar a página preserva as etapas concluídas.
- Não há agendador externo ativo. scripts/sync-job.mjs e POST /api/jobs/sync preparam essa integração, condicionada a autenticação de máquina e infraestrutura própria.
- Não há envio de e-mails ou mensagens externas.

## Validação

- node scripts/test.mjs: regras de estoque, isolamento de credenciais, paginação, inglês/aliases do Polylang, embalagens, kg e saldos compartilhados.
- npx tsc --noEmit
- npm run build
- Verificação real das APIs locais e WooCommerce com as credenciais do arquivo local.
- Teste visual de navegador não solicitado; WebMCP não verificado em contexto real.

## Referências

- [WooCommerce REST API](https://developer.woocommerce.com/docs/apis/rest-api/)
- [Produtos](https://developer.woocommerce.com/docs/apis/rest-api/v3/products/)
- [Variações](https://developer.woocommerce.com/docs/apis/rest-api/v3/product-variations/)
- [Polylang: funções de idioma e traduções](https://polylang.pro/documentation/support/developers/function-reference/)
