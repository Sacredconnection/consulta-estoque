# Integração com bot de WhatsApp

O projeto está preparado para duas formas de integração. Nenhuma conta, número, webhook externo ou envio real foi ativado.

## 1. API de consulta para qualquer bot

POST /api/bot/query

Cabeçalhos:

```http
Authorization: Bearer <BOT_API_TOKEN>
Content-Type: application/json
```

Corpo:

```json
{"message":"estoque de Tsunu na Maya"}
```

Resposta:

```json
{
  "version": 1,
  "text": "Resposta em Markdown para o site",
  "messages": ["*Maya Herbs*\n...\n*Total de granel: 15,5 kg*"],
  "kind": "stock",
  "generatedAt": "2026-09-10T12:00:00.000Z",
  "stores": [{"id":"maya","lastSync":"2026-09-10T11:58:00.000Z","ready":true,"error":null}],
  "readOnly": true
}
```

Exemplo ilustrativo de formato, sem promessa de saldo. Cada elemento de messages é um texto pronto para enviar, em ordem. Respostas longas são divididas e numeradas. Esta API somente consulta; não dispara mensagens. O bot consumidor deve autenticar e autorizar seus usuários antes de encaminhar perguntas. Nunca coloque BOT_API_TOKEN no navegador.

O agente web e essa API utilizam o mesmo serviço: inglês canônico da Maya, latas separadas de granel, totais em kg e avisos de catálogo incompleto. Os dados vêm da última sincronização concluída; consultar não inicia uma leitura completa do WooCommerce.

## 2. Conector da WhatsApp Cloud API da Meta

Fluxo implementado:

```text
Pessoa autorizada → WhatsApp / Meta → webhook assinado
→ fila Turso/SQLite → processador → consulta de estoque → resposta no WhatsApp
```

Rotas:
- GET /api/whatsapp/webhook: validação do desafio da Meta.
- POST /api/whatsapp/webhook: valida assinatura HMAC, recebe mensagens de texto e grava na fila.
- POST /api/jobs/whatsapp: processa uma parte pendente; requer WHATSAPP_JOB_TOKEN.
- POST /api/bot/query: consulta independente do conector; requer BOT_API_TOKEN.

Configure no .env.local:

```dotenv
BOT_API_TOKEN=
WHATSAPP_PROVIDER=meta
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_VERSION=
WHATSAPP_ALLOWED_NUMBERS=
WHATSAPP_SEND_ENABLED=false
WHATSAPP_JOB_TOKEN=
WHATSAPP_BACKEND_ORIGIN=http://localhost:3000
WHATSAPP_RELAY_PORT=8788
```

- BOT_API_TOKEN, WHATSAPP_VERIFY_TOKEN e WHATSAPP_JOB_TOKEN: três valores aleatórios diferentes com pelo menos 32 caracteres.
- WHATSAPP_APP_SECRET: segredo do aplicativo Meta, utilizado para verificar os eventos.
- WHATSAPP_ACCESS_TOKEN: token com acesso de envio ao número de WhatsApp.
- WHATSAPP_PHONE_NUMBER_ID: ID do número empresarial da Meta; não é o telefone.
- WHATSAPP_GRAPH_VERSION: versão habilitada no aplicativo Meta, no formato vN.0. Não há versão presumida pelo código.
- WHATSAPP_ALLOWED_NUMBERS: telefones autorizados, separados por vírgula, com código de país, somente dígitos. Exemplo de formato: 5511999999999. Lista vazia impede ativação.
- WHATSAPP_SEND_ENABLED: false permite verificar/receber eventos configurados, mas não envia respostas. Altere para true somente ao ativar o bot com os destinatários desejados.
- WHATSAPP_JOB_TOKEN: autentica exclusivamente o processador.
- WHATSAPP_BACKEND_ORIGIN: origem do backend, sem caminho. HTTP somente em loopback; outros endereços exigem HTTPS.

Não foi alterado o .env.local existente. .env.example contém os campos novos; copie e preencha localmente. Após editar as variáveis, reinicie o servidor. Credenciais não são cadastradas na interface, gravadas no banco ou enviadas ao navegador. Na Vercel, configure as mesmas variáveis server-only no ambiente da implantação.

## Execução e conectividade

1. Aplique a migração 0003_whatsapp_queue.sql com npm run db:migrate no mesmo Turso usado pelo aplicativo (migrações 0000–0002 também são necessárias).
2. Configure o ambiente e execute npm run dev.
3. Para usar um bot próprio, conecte-o a POST /api/bot/query com seu token.
4. Para o conector Meta, disponibilize um endpoint HTTPS que encaminhe exclusivamente o webhook.
5. Cadastre na Meta a URL de callback e o WHATSAPP_VERIFY_TOKEN, e assine o campo messages do número correto.
6. Execute npm run whatsapp:worker para consumir a fila. npm run whatsapp:worker -- --once processa no máximo uma parte.
7. Ao ativar o envio, configure WHATSAPP_SEND_ENABLED=true e reinicie o backend.

### Teste do webhook com backend local

npm run whatsapp:relay inicia uma ponte HTTP em 127.0.0.1:8788. Ela aceita somente GET/POST em /webhooks/whatsapp e encaminha o corpo original e a assinatura para o backend. Use um túnel HTTPS ou proxy reverso para essa porta e cadastre https://SEU-ENDERECO/webhooks/whatsapp na Meta. O túnel não foi criado ou iniciado por esta implementação.

Essa ponte permite expor somente o webhook sem publicar a interface, as rotas de autenticação ou a API de inventário. Não exponha o servidor de desenvolvimento inteiro.

### Vercel / Next.js

Na Vercel, cadastre https://SEU-DOMINIO/api/whatsapp/webhook diretamente na Meta. Essa rota não exige o login Basic da interface: valida o desafio e a assinatura da Meta. As APIs do bot e do processador também ficam fora do login da interface e exigem seus próprios tokens Bearer. O callback precisa estar acessível por HTTPS sem uma página de login de infraestrutura.

Configure as variáveis de WhatsApp e banco na Vercel, execute npm run db:migrate para o mesmo Turso e publique o commit. A interface mantém sua autenticação atual. Para consumir a fila, execute o script whatsapp:worker em um serviço próprio, apontando WHATSAPP_BACKEND_ORIGIN para o domínio da Vercel, ou agende POST /api/jobs/whatsapp com o token correspondente. Nenhum agendador foi ativado automaticamente.

## Comportamento da fila

- Recebimentos repetidos do mesmo ID não criam outro trabalho.
- Confirmação HTTP acontece após gravar a mensagem; o webhook não espera WooCommerce nem o envio.
- Somente números da lista e eventos do PHONE_NUMBER_ID configurado são aceitos.
- Eventos de status de entrega são ignorados. sent na fila significa aceito pela API de envio; não é confirmação de leitura ou entrega.
- Mensagens sem texto ou maiores que 500 caracteres recebem uma instrução curta.
- Cada resposta é calculada uma vez e suas partes são persistidas. Partes já confirmadas não são reenviadas em uma retomada normal.
- Consultas do mesmo telefone são processadas em ordem.
- Falhas temporárias usam até cinco tentativas por parte, com espera crescente. Falhas permanentes encerram o trabalho.
- Um timeout após a Meta aceitar uma mensagem pode produzir duplicata em uma nova tentativa: não existe garantia de entrega exatamente uma vez entre o banco e a API externa.
- Somente respostas a consultas recebidas, dentro de uma margem de 23 horas, são enviadas; não há disparo proativo ou templates implementados.
- Mais de oito partes geram uma orientação para restringir a busca.
- Ao ficar sem trabalhos disponíveis, o processador remove trabalhos encerrados há mais de sete dias. A fila contém telefone, pergunta e resposta; não contém chaves das lojas.
- Sem processador ativo, as mensagens ficam pendentes. Ao fechar a interface web, a atualização de estoque também precisa de agendamento separado; o processador de WhatsApp não sincroniza automaticamente o catálogo.

## Validação sem enviar mensagens reais

node scripts/test.mjs testa assinatura, desafio, tokens, consulta com catálogo, duplicação de eventos, fila SQLite, concorrência, retomada de partes, limites Unicode e transporte Meta simulado. Nenhum número real é contatado por esses testes.

## Referências oficiais

- [Meta: WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)
- [Meta: verificação do webhook e assinatura](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/)
