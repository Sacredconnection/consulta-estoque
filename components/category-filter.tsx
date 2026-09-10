"use client";
import {useState} from 'react';
import {X} from 'lucide-react';
import {CATEGORY_SEPARATOR} from '@/lib/category-tree';

export function CategoryFilter({categories,selected,onChange,company,disabled=false,id}:{categories:string[];selected:string[];onChange:(values:string[])=>void;company:string;disabled?:boolean;id:string}){
 const [browsing,setBrowsing]=useState('');
 const roots=[...new Set(categories.map(c=>c.split(CATEGORY_SEPARATOR)[0]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const selectedParent=selected.at(-1)?.split(CATEGORY_SEPARATOR)[0]??'';
 const parent=roots.includes(browsing)?browsing:roots.includes(selectedParent)?selectedParent:'';
 const children=categories.filter(c=>c.startsWith(parent+CATEGORY_SEPARATOR));
 function chooseParent(value:string){
  setBrowsing(value);if(!value)return;
  onChange([...selected.filter(c=>c!==value&&!c.startsWith(value+CATEGORY_SEPARATOR)),value]);
 }
 function chooseChild(value:string){
  if(!value)return;
  // Narrow this parent to the chosen branches; other parent selections stay.
  onChange([...selected.filter(c=>c!==parent&&c!==value&&!value.startsWith(c+CATEGORY_SEPARATOR)&&!c.startsWith(value+CATEGORY_SEPARATOR)),value]);
 }
 return <fieldset className="category-filter category-hierarchy" disabled={disabled}><legend>Categorias · {company}</legend>
  <div className="category-levels"><label htmlFor={id+'-parent'}>Categoria pai<select id={id+'-parent'} value={parent} onChange={e=>chooseParent(e.target.value)} disabled={disabled||!roots.length}><option value="">Selecione uma categoria pai</option>{roots.map(root=><option key={root} value={root}>{root}</option>)}</select></label>
  <label htmlFor={id+'-child'}>Subcategorias<select id={id+'-child'} value="" disabled={disabled||!parent||!children.length} onChange={e=>chooseChild(e.target.value)}><option value="">{!parent?'Selecione a categoria pai primeiro':!children.length?'Sem subcategorias':selected.includes(parent)?'Todas as subcategorias':'Adicionar subcategoria…'}</option>{children.filter(c=>!selected.includes(c)).map(child=><option key={child} value={child}>{child.split(CATEGORY_SEPARATOR).slice(1).join(' → ')}</option>)}</select></label></div>
  {selected.length>0&&<><div className="category-chips">{selected.map(value=><button type="button" key={value} aria-label={'Remover categoria '+value} onClick={()=>onChange(selected.filter(c=>c!==value))}>{value.split(CATEGORY_SEPARATOR).join(' → ')}<X size={14}/></button>)}</div><button className="category-clear" type="button" onClick={()=>{setBrowsing('');onChange([]);}}>Limpar categorias</button></>}
  <small>{roots.length?'A categoria pai inclui todas as subcategorias. Selecione subcategorias para refinar; adicione outras para acumular.':'Categorias disponíveis após carregar a hierarquia da empresa.'}</small>
 </fieldset>;
}
