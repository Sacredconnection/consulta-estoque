# Equivalência de produtos

A tabela associa automaticamente as famílias de rapé com códigos `RA` + duas letras + dois dígitos (como `RACO06`, `RAHK02`, `RASC01` e `RAYA02`). Não é necessário cadastrar cada produto. A identidade usa **família + peso da apresentação + unidade de medida**.

Maya informa o peso depois do hífen (`RACO06-10`, `RACO06-50`). Sacred e Pagnier usam dois dígitos adicionais para identificar a variação. Esses dígitos não significam o mesmo peso em todas as famílias: `RACO0604` é 10 g, enquanto `RASC0103` também é 10 g. Por isso a regra usa o peso registrado da apresentação, não uma tabela universal de sufixos.

Exemplos:

| Maya | Sacred | Apresentação comum |
|---|---|---|
| RACO06-10 | RACO0604 | RACO06 · 10 g |
| RACO06-50 | RACO0606 | RACO06 · 50 g |
| RASC01-10 | RASC0103 | RASC01 · 10 g |
| RASC01-50 | RASC0105 | RASC01 · 50 g |

A mesma regra atende os demais pesos. Pagnier participa quando possui a mesma família e apresentação. Os códigos e nomes originais são preservados; buscar qualquer código ou nome expande o resultado para as apresentações equivalentes das fontes selecionadas. Os saldos de cada fonte permanecem em suas próprias colunas.

Produtos pais e saldos compartilhados ficam separados das variações. Granel medido em kg (sufixo `00`) fica separado das embalagens vendidas por unidade. Peso ausente, unidade incompatível ou divergência entre o peso explícito do SKU Maya e seu cadastro impedem a associação. Nomes semelhantes, sozinhos, não associam famílias diferentes.

A regra é aplicada ao ler o cache persistente, sem modificar os SKUs de origem e sem exigir nova sincronização. No catálogo auditado, quatro SKUs Maya (`RAYA14-500`, `RAYA13-500`, `RAYA12-500`, `RAYA08-500`) têm peso cadastrado de 10 g e permanecem separados até a correção na origem.
