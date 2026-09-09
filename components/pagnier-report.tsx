export const PAGNIER_REPORT_URL = 'https://reports.nomus.com.br/open-view/751489003726808170';

export function PagnierReport() {
  return <section id="pagnier-panel" role="tabpanel" aria-labelledby="pagnier-tab" className="pagnier-report">
    <div className="pagnier-report-heading">
      <div><h1>Pagnier</h1><p>Relatório de saldo de estoque · Nomus</p></div>
      <a href={PAGNIER_REPORT_URL} target="_blank" rel="noopener noreferrer">Abrir em outra janela ↗</a>
    </div>
    <p>Consulte a Pagnier diretamente neste relatório. Seus saldos ainda não compõem os resultados da consulta IA e da tabela consolidada.</p>
    <iframe src={PAGNIER_REPORT_URL} title="Pagnier — relatório de saldo de estoque" loading="lazy" referrerPolicy="no-referrer" />
  </section>;
}
