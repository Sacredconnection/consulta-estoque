import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function QueryTurn({question,index,historical,expanded,onToggle,children}:{question:string;index:number;historical:boolean;expanded:boolean;onToggle:()=>void;children:ReactNode}){
 if(!historical)return <div className="query-turn"><article className="message user"><div className="speaker">Você</div><p>{question}</p></article>{children}</div>;
 return <div className={'query-history'+(expanded?' expanded':'')}>
  <button type="button" className="query-history-toggle" aria-expanded={expanded} aria-controls={'query-result-'+index} onClick={onToggle}>
   {expanded?<ChevronDown size={17}/>:<ChevronRight size={17}/>}
   <span className="query-history-question" title={question}>{question}</span>
   <span className="query-history-action">{expanded?'Recolher':'Expandir'}</span>
  </button>
  <div id={'query-result-'+index} hidden={!expanded}>{expanded?children:null}</div>
 </div>;
}
