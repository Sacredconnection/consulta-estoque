# Reposição Sacred

Os mínimos são importados do arquivo `Sacred_Estoque_Minimo_3meses.csv` e persistidos na chave `settings.sacred_minimums` do Turso. O importador rejeita SKUs vazios/duplicados e mínimos inválidos. Para repetir a importação:

```sh
python scripts/import-sacred-minimums.py
node --env-file=.env.local scripts/save-sacred-minimums.mjs
```

O seletor abre em Sacred. Cada empresa usa exclusivamente seus SKUs, nomes e saldos da integração e sua própria chave `settings.<empresa>_minimums`. Sem mínimos próprios, a aba informa que não há configuração e não reutiliza os da Sacred. O pedido não usa o estoque histórico do CSV. Quantidade sugerida: `max(0, ceil(mínimo - max(0, saldo)))`. Mínimo zero não gera reposição. SKUs ausentes da integração selecionada ficam fora de todas as listas e exportações. Estoque desconhecido, unidade incompatível, códigos duplicados e saldos compartilhados existentes exigem revisão.

A aba calcula um pedido para revisão e exportação, sem enviá-lo a fornecedores. Recalcular lê o snapshot mais recente, sem forçar sincronização. As exportações usam o mesmo relatório exibido e registram a data do snapshot. Excel inclui Pedido, Revisar e Mínimos cadastrados; PDF inclui o pedido e um anexo de pendências. Pesos desconhecidos deixam o total de kg parcial.

O filtro de empresas das consultas não modifica o seletor de reposição. Os mínimos importados do CSV continuam exclusivos Sacred. Produtos Pagnier cujo nome contém “etiqueta” (sem distinção de maiúsculas ou acentos) são excluídos na importação e na leitura do cache.
# Filtros de categoria

A reposição permite adicionar várias categorias da empresa selecionada. A seleção inclui produtos de qualquer uma delas, sem duplicar SKUs, e aplica-se ao pedido, aos itens para revisão, a todos os mínimos e aos totais. PDF e Excel usam o mesmo conjunto filtrado e identificam as categorias no arquivo. Remova seleções individualmente ou use Limpar categorias; trocar a empresa limpa o filtro. Recalcular preserva a seleção.
