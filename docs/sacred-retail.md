# Sacred: varejo e atacado

Erros de sincronização identificam o canal Varejo ou Atacado. No varejo, uma resposta 401 `woocommerce_rest_cannot_view` tenta uma única vez a autenticação por parâmetros HTTPS no mesmo endereço, alternativa documentada pelo WooCommerce para servidores que não encaminham Authorization. Redirecionamentos continuam bloqueados e erros não exibem URLs autenticadas nem credenciais.

A Sacred aparece como uma empresa na consulta, nos filtros, nos totais e na reposição. O atacado mantém a configuração existente (`WOO_SACRED_KEY`/`WOO_SACRED_SECRET` ou o prefixo legado com URL).

O varejo usa as três variáveis de Production:

- `SACRED_RETAIL_SITE_URL`: origem HTTPS da loja, sem caminho da API.
- `SACRED_RETAIL_CONSUMER_KEY`
- `SACRED_RETAIL_CONSUMER_SECRET`

As duas fontes são lidas no mesmo trabalho, com checkpoints persistentes. O catálogo anterior permanece disponível até ambas concluírem. Uma falha no varejo não publica um saldo parcial. IDs internos negativos distinguem os registros de varejo dos IDs do atacado; os SKUs originais são preservados.

Saldos do mesmo SKU e apresentação são somados antes da consulta e do cálculo de reposição. Essa soma pressupõe saldos independentes entre os dois canais. Quantidade desconhecida em um canal mantém o total desconhecido. Duplicidades dentro de um canal, pesos incompatíveis e saldos compartilhados não são somados automaticamente. Produtos exclusivos de qualquer canal continuam pertencendo à Sacred. Os mínimos cadastrados permanecem exclusivos da Sacred.

A inclusão ou troca da URL de varejo sinaliza uma nova sincronização; depois, vale o agendamento existente de 30 minutos.
