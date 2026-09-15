"use client";
import { useEffect, useMemo, useState } from "react";
import { Clock3, ExternalLink, Mail, PackageSearch, RefreshCw, Settings2 } from "lucide-react";

const SOURCE_URL = "https://1drv.ms/x/c/00dfb29bbea3a944/IQBEqaO-m7LfIIAAnHMBAAAAAUejP0WBpcUQDAlSaPV83E8?e=Wd77Pz";
type Row = { order: string; tracking: string; customer: string; delivery: string; status: "Em trânsito" | "Entregue" | "Aguardando coleta" | "Exceção"; updated: string };
const demoRows: Row[] = [
 { order: "#10482", tracking: "BR458921730", customer: "Mercado Aurora", delivery: "18/09/2026", status: "Em trânsito", updated: "há 18 min" },
 { order: "#10479", tracking: "BR458921684", customer: "Casa Verde Atacado", delivery: "17/09/2026", status: "Entregue", updated: "há 42 min" },
 { order: "#10476", tracking: "BR458921602", customer: "Empório da Serra", delivery: "19/09/2026", status: "Aguardando coleta", updated: "há 1 h" },
 { order: "#10471", tracking: "BR458921577", customer: "Rede Bem-Estar", delivery: "16/09/2026", status: "Exceção", updated: "há 2 h" },
 { order: "#10468", tracking: "BR458921541", customer: "Naturalmente Loja", delivery: "20/09/2026", status: "Em trânsito", updated: "há 3 h" },
];
const cls = (s: string) => s.toLowerCase().replaceAll(" ", "-").replace("ã", "a");

export function Tracking() {
 const [enabled, setEnabled] = useState(true), [interval, setIntervalValue] = useState("15"), [lastUpdate, setLastUpdate] = useState(new Date()), [busy, setBusy] = useState(false), [query, setQuery] = useState("");
 useEffect(() => { if (!enabled) return; const timer = window.setInterval(() => setLastUpdate(new Date()), Number(interval) * 60000); return () => window.clearInterval(timer); }, [enabled, interval]);
 const rows = useMemo(() => demoRows.filter(row => `${row.order} ${row.tracking} ${row.customer} ${row.status}`.toLowerCase().includes(query.toLowerCase())), [query]);
 const refresh = () => { setBusy(true); window.setTimeout(() => { setLastUpdate(new Date()); setBusy(false); }, 700); };
 const counts = { total: demoRows.length, transit: demoRows.filter(r => r.status === "Em trânsito").length, delivered: demoRows.filter(r => r.status === "Entregue").length, exception: demoRows.filter(r => r.status === "Exceção").length };
 return <section className="tracking-view" aria-labelledby="tracking-title">
  <header className="tracking-heading"><div><div className="eyebrow">OPERAÇÃO LOGÍSTICA</div><h1 id="tracking-title">Rastreio de pedidos</h1><p>Acompanhe as entregas a partir da sua planilha, em um único lugar.</p></div><button className="tracking-refresh" onClick={refresh} disabled={busy}><RefreshCw size={16} className={busy ? "spin" : ""}/>{busy ? "Atualizando…" : "Atualizar agora"}</button></header>
  <div className="tracking-controlbar"><div className="tracking-source"><PackageSearch size={18}/><span><strong>Fonte conectada</strong><small>Planilha de rastreio · OneDrive</small></span><a href={SOURCE_URL} target="_blank" rel="noreferrer" aria-label="Abrir planilha"><ExternalLink size={15}/></a></div><div className="tracking-schedule"><Clock3 size={16}/><label htmlFor="tracking-interval">Atualizar a cada</label><select id="tracking-interval" value={interval} onChange={e => setIntervalValue(e.target.value)}><option value="5">5 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">1 hora</option></select><button className={`tracking-toggle ${enabled ? "on" : ""}`} onClick={() => setEnabled(!enabled)} aria-pressed={enabled}>{enabled ? "Automático ativo" : "Automático pausado"}</button></div></div>
  <div className="tracking-freshness"><span>Última leitura: <strong>{lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong></span><span className={enabled ? "tracking-live" : ""}>● {enabled ? `Próxima atualização em ${interval} min` : "Atualização automática pausada"}</span><button><Settings2 size={15}/> Configurações</button></div>
  <div className="tracking-metrics"><div><span>Pedidos monitorados</span><strong>{counts.total}</strong><small>na planilha</small></div><div><span>Em trânsito</span><strong>{counts.transit}</strong><small>em acompanhamento</small></div><div><span>Entregues</span><strong>{counts.delivered}</strong><small>com confirmação</small></div><div className="tracking-alert"><span>Exceções</span><strong>{counts.exception}</strong><small>requerem atenção</small></div></div>
  <div className="tracking-toolbar"><div className="tracking-search"><PackageSearch size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar pedido, tracking ou cliente"/></div><button className="tracking-email" disabled><Mail size={16}/> Enviar atualizações <small>Em breve</small></button></div>
  <div className="tracking-table-wrap"><table className="tracking-table"><thead><tr><th>Pedido</th><th>Tracking</th><th>Cliente</th><th>Expected delivery</th><th>Status</th><th>Última leitura</th></tr></thead><tbody>{rows.map(row => <tr key={row.order}><td><strong>{row.order}</strong></td><td><code>{row.tracking}</code></td><td>{row.customer}</td><td>{row.delivery}</td><td><span className={`tracking-status ${cls(row.status)}`}><i/> {row.status}</span></td><td className="tracking-updated">{row.updated}</td></tr>)}</tbody></table>{!rows.length && <div className="tracking-empty">Nenhum pedido encontrado.</div>}</div>
  <p className="tracking-note">Os campos exibidos são normalizados da planilha para facilitar a leitura. O envio por e-mail ficará disponível na próxima etapa.</p>
 </section>;
}
