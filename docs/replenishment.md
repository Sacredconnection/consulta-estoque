# Reposição Sacred

Os mínimos são importados do arquivo `Sacred_Estoque_Minimo_3meses.csv` e persistidos na chave `settings.sacred_minimums` do Turso. O importador rejeita SKUs vazios/duplicados e mínimos inválidos. Para repetir a importação:

```sh
python scripts/import-sacred-minimums.py
node --env-file=.env.local scripts/save-sacred-minimums.mjs
```

O pedido usa exclusivamente SKUs originais e saldos atuais da Sacred. Não usa o estoque histórico do CSV nem os saldos Maya/Pagnier. Quantidade sugerida: `max(0, ceil(mínimo - max(0, saldo)))`. Mínimo zero não gera reposição. Ausência de SKU, estoque desconhecido, unidade incompatível, códigos duplicados e saldos compartilhados exigem revisão; não geram uma quantidade presumida.

A aba calcula um pedido para revisão e exportação, sem enviá-lo a fornecedores. Recalcular lê o snapshot mais recente, sem forçar sincronização. As exportações usam o mesmo relatório exibido e registram a data do snapshot. Excel inclui Pedido, Revisar e Mínimos cadastrados; PDF inclui o pedido e um anexo de pendências. Pesos desconhecidos deixam o total de kg parcial.

O filtro de empresas das consultas não modifica a reposição: a aba é exclusiva Sacred. As demais lojas mantêm suas regras existentes. Produtos Pagnier cujo nome contém “etiqueta” (sem distinção de maiúsculas ou acentos) são excluídos na importação e na leitura do cache.
