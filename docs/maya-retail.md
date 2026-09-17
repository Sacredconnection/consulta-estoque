# Maya: varejo, atacado e mínimos

A Maya usa a mesma consolidação de estoque da Sacred: uma empresa, SKUs completos (sem juntar tamanhos diferentes), saldo do atacado prioritário inclusive quando zero/negativo e fallback ao varejo apenas quando desconhecido. Saldos espelhados nunca são somados. Categorias dos dois canais são preservadas; produtos exclusivos do varejo também pertencem à Maya. Duplicatas dentro de um canal continuam sujeitas à revisão.

Variáveis servidor: `WOO_MAYA_KEY`, `WOO_MAYA_SECRET` e `MAYA_RETAIL_SITE_URL`, `MAYA_RETAIL_CONSUMER_KEY`, `MAYA_RETAIL_CONSUMER_SECRET`. A origem do varejo precisa ser HTTPS, sem caminho/credenciais e diferente do atacado. As credenciais não são encaminhadas em redirecionamentos. O fallback OAuth é o mesmo da Sacred.

Após publicar o código, sincronize Maya. O cache anterior permanece utilizável até as duas fontes terminarem; falha em uma fonte não publica catálogo parcial. A inclusão/alteração/remoção da origem varejo invalida os checkpoints anteriores. As propriedades persistidas `sacredSources`/`sacredCursor` são reutilizadas por compatibilidade, mas estão isoladas pelo `store_id`.

## Importação das vendas de 2026

`scripts/maya-sales-minimums.ts` consulta apenas leitura e salva artefatos em `work/` e `outputs/`, ignorados pelo Git. Compile com esbuild (Node, ESM, packages external) para `work/maya-sales-minimums.mjs`. Execute com `node --env-file=.env.local work/maya-sales-minimums.mjs` e uma das opções:

- `--collect`: pedidos/reembolsos do varejo; dados locais limitados a IDs, datas, status, SKUs, descrições e quantidades, sem clientes/endereço/pagamento.
- `--catalog`: catálogo completo do varejo em inglês, incluindo apresentações.
- `--calculate`: concilia a planilha `order_export_01-01-2026_17-09-2026.xlsx` e o catálogo persistido do atacado; gera relatório Excel e auditoria JSON, sem gravar o banco.
- `--save`: calcula novamente, faz backup local de configuração anterior, grava somente `maya_minimums` e verifica a persistência.

Mesma metodologia da Sacred: média mensal projetada para três meses, mínimo arredondado para cima à unidade inteira. Como esta fonte cobre 01/01–17/09/2026 (e não 12 meses), o denominador é `8 + 17/30` meses. Reposição continua arredondada para cima em múltiplos de 10; essa regra não altera o mínimo armazenado.

Entram pedidos Woo `completed`/`processing`, descontadas quantidades reembolsadas por item. Pedidos totalmente reembolsados, cancelados, pendentes e em espera não entram. Da planilha entram somente `Afgerond / Factureren` e `Gereed voor Picken`, sem referências de importação Woo. Referências Woo já coletadas contam uma vez pela API; referências não confirmadas são excluídas e contabilizadas na auditoria, pois “WooCommerce” não comprova pagamento. Fretes não são produtos. SKUs ausentes do catálogo são auditados, nunca aproximados por nome ou fundidos com outras apresentações.

A planilha fornecida contém principalmente pedidos recentes/pendentes: não prova um histórico completo das vendas manuais desde janeiro. Os mínimos refletem as vendas comprovadas nas fontes disponíveis; reexportar o histórico completo de pedidos faturados pode elevar os mínimos. Quantidades vendidas sem SKU ficam registradas como pendência na auditoria.

Referências oficiais: [pedidos WooCommerce](https://woocommerce.github.io/woocommerce-rest-api-docs/#orders) e [reembolsos](https://woocommerce.github.io/woocommerce-rest-api-docs/#order-refunds).
