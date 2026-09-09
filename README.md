# Elo · Agente de estoque

Interface web somente com o agente de consulta de estoque. Pergunte por nome ou SKU para comparar as lojas configuradas, consultar estoques baixos e obter sugestões de reposição.

## Publicação na Vercel

Este projeto usa Next.js e banco SQLite remoto (Turso). A configuração está em `vercel.json`.

1. Crie um banco libSQL no Turso e obtenha a URL e o token.
2. Em Settings → Environment Variables na Vercel, configure `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_AUTH_USER` e `APP_AUTH_PASSWORD` (senha longa e exclusiva). Configure também os pares `WOO_*_KEY`/`WOO_*_SECRET` das lojas, conforme `.env.example`. Nunca use o prefixo `NEXT_PUBLIC_` para esses valores.
3. Para criar as tabelas, coloque a URL e o token do mesmo banco em `.env.local` e execute `npm ci` e `npm run db:migrate`. O comando pode ser repetido; ele registra as migrações aplicadas. Snapshots do antigo D1 não são copiados automaticamente: faça uma nova sincronização.
4. Envie as alterações ao repositório conectado à Vercel e faça um novo deploy. Use a raiz do repositório como Root Directory; o preset é Next.js, o build é `npm run build` e a saída é `.next`.
5. Abra o site, informe o usuário e a senha no diálogo do navegador e clique em Atualizar estoques.

O build não exige credenciais. Sem usuário/senha configurados, o site retorna uma mensagem de configuração (503) e mantém os dados bloqueados. O banco é persistente entre invocações e deploys. As etapas de sincronização têm limite de 60 segundos. O endpoint de jobs usa `SYNC_JOB_TOKEN` independente; nenhum agendamento é criado automaticamente.

Referências: [Next.js na Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) e [cliente libSQL/Turso](https://docs.turso.tech/sdk/ts/reference).

## Credenciais

Em desenvolvimento, as chaves ficam em **.env.local**, ignorado pelo Git. Em produção, ficam nas variáveis de ambiente da Vercel. Não há formulário nem endpoint para cadastrar chaves. Elas são lidas apenas no servidor e não são enviadas ao navegador nem gravadas no banco.

Prefixos locais aceitos:
- BRINCR_SITE_URL, BRINCR_CONSUMER_KEY, BRINCR_CONSUMER_SECRET
- H&F_SITE_URL, H&F_CONSUMER_KEY, H&F_CONSUMER_SECRET

A associação usa o hostname HTTPS exato de Sacred Snuff, Maya Herbs ou SC23 Trading. Os nomes canônicos de .env.example também são aceitos. Lojas sem um par completo de credenciais ficam ocultas, inclusive nos resultados. Após editar .env.local, reinicie o servidor local.

O site publicado usa as variáveis da Vercel; não acessa o arquivo deste computador.

## Desenvolvimento

Node >=22.13.0 e npm.

1. npm install
2. Configure .env.local com as credenciais de leitura WooCommerce.
3. Configure as variáveis de acesso e banco. Para um banco local, crie a pasta `work` e use `TURSO_DATABASE_URL=file:work/estoque.db`. Execute `npm run db:migrate`.
4. npm run dev
5. Abra http://localhost:3000 e informe o usuário e a senha configurados.

O banco guarda snapshots, status e regras. A coluna legada credentials contém somente o marcador environment.

## Consultas e mensagens

- Pagnier é uma fonte de estoque do relatório público Nomus `751489003726808170`. Não exige chaves WooCommerce. A sincronização lê páginas de 200 linhas, grava checkpoints no Turso e publica o catálogo somente após concluir todas as páginas. Seus produtos participam das buscas e da tabela consolidada.
- Pagnier soma saldos por produto, revisão, empresa e setor; usa somente produtos e setores ativos que consideram disponibilidade. O saldo total da empresa não é somado novamente por setor. Unidades KG/G são preservadas. Para itens unitários, usa o peso líquido informado ou a apresentação explícita; embalagens não viram conteúdo de produto em kg.
- As respostas com produtos mostram somente a tabela: quantidade e kg por fonte, total por SKU, total geral e subtotal de granel. No catálogo paginado, o rodapé soma todos os resultados do filtro, não apenas a página visível. Dados desconhecidos e saldos compartilhados não entram no total de kg e são sinalizados.
- O reconhecimento de `<PREFIXO>_SITE_URL` aceita o ponto final DNS após o domínio. As chamadas WooCommerce continuam usando os endereços fixos das lojas.

- A única tela é o chat, com exemplos de perguntas, status das lojas e botão Atualizar estoques.
- Mensagens de texto ficam restritas a erros e consultas sem correspondência; resultados de estoque são apresentados em tabela.
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
- Registros e progresso são gravados na mesma transação do banco. A publicação acontece somente ao concluir todas as etapas da loja. Falhas preservam o último snapshot compatível.
- O botão retoma execuções interrompidas; progresso e erros aparecem junto ao chat.
- Atualização automática com a página aberta, respeitando as regras já salvas. Fechar a página preserva as etapas concluídas.
- Não há agendador externo ativo. scripts/sync-job.mjs e POST /api/jobs/sync preparam essa integração, condicionada a autenticação de máquina e infraestrutura própria.
- Não há envio de e-mails ou mensagens externas.

## Validação

- node scripts/test.mjs: regras de estoque, isolamento de credenciais, paginação, inglês/aliases do Polylang, embalagens, kg e saldos compartilhados.
- npx tsc --noEmit
- npm run build
- 34 testes, build de produção e requisições HTTP locais (página, autenticação, APIs e persistência de regras).
- Pagnier validada com leitura de todas as 8.326 linhas do relatório, sincronização de 5.825 posições ativas/disponíveis no Turso e consulta real por Tsunu. Essas contagens representam o momento da validação, não valores fixos do catálogo.
- Navegador validado com resposta somente em tabela, fontes Maya/Pagnier, soma em kg e layout móvel. Credenciais WooCommerce de produção não estão disponíveis localmente; WebMCP não verificado em contexto real.

## Referências

- [WooCommerce REST API](https://developer.woocommerce.com/docs/apis/rest-api/)
- [Produtos](https://developer.woocommerce.com/docs/apis/rest-api/v3/products/)
- [Variações](https://developer.woocommerce.com/docs/apis/rest-api/v3/product-variations/)
- [Polylang: funções de idioma e traduções](https://polylang.pro/documentation/support/developers/function-reference/)
