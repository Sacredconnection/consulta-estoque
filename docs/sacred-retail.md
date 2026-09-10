# Sacred: varejo e atacado

Errors identify the retail or wholesale channel. Retail retries anonymous 401 responses with WooCommerce OAuth 1.0a HMAC-SHA256. If WordPress reports a signature mismatch, the signature base is retried with the HTTP scheme used behind some HTTPS proxies. The actual request always stays on the configured HTTPS origin, redirects are blocked, and the consumer secret is never placed in the URL. Nonces and timestamps are regenerated for each request.

Reference: https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/includes/class-wc-rest-authentication.php

A Sacred aparece como uma empresa na consulta, nos filtros, nos totais e na reposição. O atacado mantém a configuração existente (`WOO_SACRED_KEY`/`WOO_SACRED_SECRET` ou o prefixo legado com URL).

O varejo usa as três variáveis de Production:

- `SACRED_RETAIL_SITE_URL`: origem HTTPS da loja, sem caminho da API.
- `SACRED_RETAIL_CONSUMER_KEY`
- `SACRED_RETAIL_CONSUMER_SECRET`

As duas fontes são lidas no mesmo trabalho, com checkpoints persistentes. O catálogo anterior permanece disponível até ambas concluírem. Uma falha no varejo não publica um saldo parcial. IDs internos negativos distinguem os registros de varejo dos IDs do atacado; os SKUs originais são preservados.

Varejo e atacado espelham o mesmo estoque do QuickBooks. Um SKU presente nos dois canais conta uma única vez na consulta, nos totais e na reposição: usa-se o saldo conhecido do atacado (inclusive zero e negativos), ou o varejo se o atacado não informar quantidade. Os saldos nunca são somados. Duplicidades dentro de um mesmo canal permanecem para conferência. Metadados ausentes de peso podem ser completados pelo outro canal quando a unidade é compatível. Produtos exclusivos de qualquer canal continuam pertencendo à Sacred. Os mínimos cadastrados permanecem exclusivos da Sacred.

Apresentações como `0,35oz (10gr.)` usam o peso métrico explícito de 10 g. A leitura do cache recupera esse peso antes do agrupamento, sem exigir nova sincronização. A regra vale para todas as famílias e preserva apresentações diferentes.

A inclusão ou troca da URL de varejo sinaliza uma nova sincronização; depois, vale o agendamento existente de 30 minutos.
