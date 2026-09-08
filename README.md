# Elo · Estoque Wholesale

Sistema web privado para comparar estoques de Sacred Snuff, Maya Herbs e SC23 Trading.

## Conexões do .env.local
O servidor de desenvolvimento lê o arquivo ignorado .env.local. Prefixos legados como BRINCR e H&F são associados às lojas pelo hostname de *_SITE_URL; somente as três origens HTTPS aprovadas são aceitas.
Na hospedagem, as mesmas chaves são configuradas como segredos WOO_SACRED_KEY / WOO_SACRED_SECRET, WOO_MAYA_KEY / WOO_MAYA_SECRET e WOO_SC23_KEY / WOO_SC23_SECRET. Nenhum segredo local é incluído no build.
Conexões de ambiente têm prioridade sobre o cadastro manual e não podem ser alteradas pelo formulário. A primeira abertura inicia a sincronização de conexões ainda não sincronizadas. Falhas de autenticação ficam visíveis; nenhum dado é inventado.

## Uso
1. Abra **Conexões** e cadastre, para cada loja, uma Consumer key e Consumer secret do WooCommerce com permissão de Leitura.
2. Clique em **Sincronizar estoques**. O catálogo real substitui a demonstração assim que uma loja é conectada; lojas não conectadas continuam explicitamente indisponíveis.
3. Pesquise nome/SKU em Consulta de estoque ou no Agente de estoque.
4. Configure mínimo, estoque desejado e intervalo em Automações.
5. Exporte sugestões em CSV na tela Reposição.

## Comportamento implementado
- API REST v3 por HTTPS com autenticação Basic exclusivamente no servidor e origens fixas.
- Chaves AES-256-GCM em D1; chave mestra CREDENTIAL_KEY em segredo do ambiente. Não rotacionar a chave mestra sem recriptografar as conexões.
- Sites privado, limitado ao proprietário pelo controle de acesso da hospedagem. Cada API exige identidade autenticada e rejeita mutações de outra origem. Não publicar este workspace com acesso compartilhado sem revisar as permissões.
- Produtos e variações com paginação, até 10.000 itens por endpoint e 15.000 registros por loja. Catálogos acima desse limite falham explicitamente, preservando o último snapshot.
- Agrupamento por SKU idêntico (sensível a maiúsculas). Sem SKU ou com SKU duplicado na mesma loja: registros isolados.
- Quantidade não controlada é N/D, não zero. Ausência de produto é —. Estoque compartilhado por produto pai aparece como compartilhado; a quantidade do pai é contada somente na linha do estoque do pai.
- Snapshot publicado somente após leitura e gravação completas. Falha de uma loja preserva seu último snapshot e não impede as outras.
- Reposição = max(0, alvo − max(0, estoque)), para estoque <= mínimo. Não é previsão de demanda, não considera pedidos em trânsito, não cria compras e não altera o WooCommerce.
- Agente de consultas guiadas em português, baseado em busca determinística por produto/SKU e intenções de estoque baixo e reposição. Não há um modelo de IA generativa configurado.
- Atualização periódica **enquanto o painel está aberto**. Ao fechar a página, não existe agendador em execução.
- Sem envio de e-mails, mensagens externas ou alterações no estoque.

## Monitoramento com o painel fechado
O endpoint POST /api/jobs/sync está pronto para receber uma chamada de um agendador, mas o Sites privado exige autenticação de máquina no gateway. Esse agendamento não foi ativado.

Para completar o monitoramento 24h:
1. Solicitar explicitamente um token de integração do Sites (bypass do gateway), guardar no cofre do agendador e manter o workspace privado.
2. Configurar SYNC_JOB_TOKEN como segredo no site e no agendador. O endpoint implementado só permite sincronização e exige esse token dedicado, além do token do gateway.
3. Executar node scripts/sync-job.mjs em um serviço de cron a cada 5 minutos, com SITE_ORIGIN, SITES_GATEWAY_TOKEN e SYNC_JOB_TOKEN no cofre do agendador. A tarefa respeita pausa e intervalo configurados no painel. Retentar somente na próxima execução; o snapshot anterior é preservado.
4. Testar uma execução com a página fechada e validar as datas nas três lojas.

Alternativa: hospedar o mesmo aplicativo em infraestrutura própria com autenticação de usuários e cron do servidor. Não considerar monitoramento 24h operacional antes dessa configuração.

## Desenvolvimento
Node >=22.13.0 e npm.
- npm install
- npm run dev
- npm run db:generate após alterar db/schema.ts
- node scripts/test.mjs
- npx tsc --noEmit
- npm run build

A migração está em drizzle/. Produção: aplicada pela hospedagem.
Desenvolvimento local: aplicar a migração usando Wrangler D1 local. O Sites fornece sessão local simulada; iniciar em /signin-with-chatgpt?return_to=/ se necessário.
CREDENTIAL_KEY é uma string base64 de 32 bytes aleatórios. Guardar em .env local (ignorado) e em segredo da hospedagem; nunca no navegador nem no Git.

## Limites e verificações pendentes
- Validação em 08/09/2026: Sacred Snuff aceitou a chave do .env.local; Maya Herbs retornou HTTP 401. SC23 não possui credenciais nesse arquivo.
- Regras globais por loja/produto; previsão por velocidade de vendas, regras individuais, fornecedores e pedidos de compra não estão implementados.
- Monitoramento no painel, sem cron remoto configurado.
- A ferramenta WebMCP consultar_estoque é registrada se suportada pelo navegador. O ambiente de validação WebMCP não estava disponível; não foi verificada em um contexto WebMCP real.
- Testes de lógica e APIs locais fazem parte da entrega; teste visual automatizado de navegador não foi solicitado.

## Referências
- [API REST WooCommerce](https://developer.woocommerce.com/docs/apis/rest-api/)
- [Produtos](https://developer.woocommerce.com/docs/apis/rest-api/v3/products/)
- [Variações](https://developer.woocommerce.com/docs/apis/rest-api/v3/product-variations/)
