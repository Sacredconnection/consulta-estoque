# Reposição Sacred

Os mínimos são importados do arquivo `Sacred_Estoque_Minimo_3meses.csv` e persistidos na chave `settings.sacred_minimums` do Turso. O importador rejeita SKUs vazios/duplicados e mínimos inválidos. Para repetir a importação:

```sh
python scripts/import-sacred-minimums.py
node --env-file=.env.local scripts/save-sacred-minimums.mjs
```

O seletor abre em Sacred. Cada empresa usa exclusivamente seus SKUs, nomes e saldos da integração e sua própria chave `settings.<empresa>_minimums`. Sem mínimos próprios, a aba informa que não há configuração e não reutiliza os da Sacred. O pedido não usa o estoque histórico do CSV. Quantidade sugerida: `max(0, ceil((mínimo - max(0, saldo)) / 10) * 10)`. A reposição é arredondada para cima em múltiplos de 10 unidades por SKU: 3 → 10, 11 → 20 e 20 → 20. Totais e pesos usam a quantidade arredondada, inclusive no PDF e Excel. Mínimo zero não gera reposição. SKUs ausentes da integração selecionada ficam fora de todas as listas e exportações. Estoque desconhecido, unidade incompatível, códigos duplicados e saldos compartilhados existentes exigem revisão.

A aba calcula um pedido para revisão e exportação, sem enviá-lo a fornecedores. Recalcular lê o snapshot mais recente, sem forçar sincronização. As exportações usam o mesmo relatório exibido e registram a data do snapshot. Excel inclui Pedido, Revisar e Mínimos cadastrados; PDF inclui o pedido e um anexo de pendências. Pesos desconhecidos deixam o total de kg parcial.

O filtro de empresas das consultas não modifica o seletor de reposição. Os mínimos importados do CSV continuam exclusivos Sacred. Produtos Pagnier cujo nome contém “etiqueta” (sem distinção de maiúsculas ou acentos) são excluídos na importação e na leitura do cache.
# Filtros de categoria

A reposição permite adicionar várias categorias da empresa selecionada. A seleção inclui produtos de qualquer uma delas, sem duplicar SKUs, e aplica-se ao pedido, aos itens para revisão, a todos os mínimos e aos totais. PDF e Excel usam o mesmo conjunto filtrado e identificam as categorias no arquivo. Remova seleções individualmente ou use Limpar categorias; trocar a empresa limpa o filtro. Recalcular preserva a seleção.
# Regra específica da Pagnier

Os mínimos da Pagnier são do SKU pai e usam kg ou litros conforme a planilha. O disponível soma o pai (código terminado em `00`) e as apresentações da mesma família de seis caracteres no catálogo Nomus. Cada posição de estoque é contada uma vez, preservando a soma de setores distintos. Filhos podem compor o saldo mesmo quando o pai não está no catálogo.

Embalagens são convertidas pelo peso cadastrado (por exemplo, 2 × 500 g + 1 × 250 g = 1,25 kg). Líquidos usam litros/ml, nunca uma conversão de peso em volume. Saldo ou conversão desconhecidos deixam a família para revisão. Saldos negativos contam como zero disponível.

Reposição Pagnier = máximo entre zero e mínimo menos disponível, **sem arredondamento para unidades inteiras ou múltiplos de 10**. Tela, PDF e Excel indicam a medida e totalizam kg e litros separadamente. A regra de múltiplos de 10 das demais empresas permanece inalterada.
# Exportação Nomus

Em **Exportar pedido → Exportar pedido Nomus**, informe somente Pedido e Cliente. O cliente deve corresponder ao cadastro no Nomus. O modelo preenchido `Importação+de+pedidos+de+venda (3) (1) (2).xlsx` define empresa `PAGNIER COMERCIO LTDA`, preço unitário 10 e unidade `UNIDADE`. Os demais campos comerciais ficam vazios, como no modelo.

O XLSX reproduz exatamente as 26 colunas e a aba `Pedidos de Vendas`, sem incluir itens de exemplo. Exporta somente itens a repor com os filtros atuais, sequencia os itens e repete os dados do pedido. Mantém SKU como texto e quantidade numérica. Pagnier preserva KG/LITRO sem arredondamento adicional; demais empresas usam UNIDADE. Emissão é a data da exportação em Brasília, e entrega é um mês calendário depois, limitada ao último dia do mês de destino quando necessário (31/01 → 28/02, ou 29/02 em ano bissexto). Ambas são células de data Excel.

Antes de importar, confira códigos, unidades e os padrões comerciais: a exportação não presume equivalências entre SKUs de lojas e cadastros do ERP. A aba `Comece por aqui` inclui essas orientações. Não há criação automática de pedido no ERP.
