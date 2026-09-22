import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { REGISTRATION_PROFESSIONS } from '../../types/professions';

/** Wrapped option text, including on mobile where native select popups cannot be styled. */
export const RegistrationProfessionSelect: React.FC<{value: string; onChange: (value: string) => void}> = ({value,onChange}) => {
  const id=useId();
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const root=useRef<HTMLDivElement>(null);
  const button=useRef<HTMLButtonElement>(null);
  const search=useRef({text:'',time:0});
  const selected=REGISTRATION_PROFESSIONS.find(option=>option.id===value);
  const choose=(index:number)=>{onChange(REGISTRATION_PROFESSIONS[index].id);setOpen(false);button.current?.focus();};
  const show=()=>{setActive(Math.max(0,REGISTRATION_PROFESSIONS.findIndex(option=>option.id===value)));setOpen(true);};
  useEffect(()=>{if(open)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'});},[open,active,id]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[]);
  return <div ref={root} className="relative min-w-0 w-full" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
    <button ref={button} id="registration-profession" type="button" role="combobox" aria-label="Profissão"
      aria-required="true" aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined}
      aria-activedescendant={open?`${id}-${active}`:undefined}
      onClick={()=>open?setOpen(false):show()}
      onKeyDown={event=>{
        if(event.key==='Escape'){setOpen(false);event.preventDefault();return;}
        if(event.key==='Tab'){setOpen(false);return;}
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
          event.preventDefault();if(!open){show();return;}
          setActive(index=>event.key==='Home'?0:event.key==='End'?REGISTRATION_PROFESSIONS.length-1:Math.max(0,Math.min(REGISTRATION_PROFESSIONS.length-1,index+(event.key==='ArrowDown'?1:-1))));return;
        }
        if(event.key==='Enter'||event.key===' '){event.preventDefault();if(open)choose(active);else show();return;}
        if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
          const now=Date.now();search.current={text:(now-search.current.time<800?search.current.text:'')+event.key,time:now};
          const norm=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
          const index=REGISTRATION_PROFESSIONS.findIndex(option=>norm(option.label).startsWith(norm(search.current.text)));
          if(index>=0){setActive(index);setOpen(true);}event.preventDefault();
        }
      }}
      className="w-full min-w-0 pl-9 pr-8 py-2 text-left text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 whitespace-normal break-words">
      {selected?.displayOption || 'Selecione sua profissão...'}
      <ChevronDown aria-hidden="true" className="absolute right-2 top-3 w-4 h-4"/>
    </button>
    {open && <div id={id} role="listbox" aria-label="Profissões" className="absolute left-0 right-0 top-full mt-1 z-10 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white shadow-xl">
      {REGISTRATION_PROFESSIONS.map((option,index)=><div key={option.id} id={`${id}-${index}`} role="option" aria-selected={option.id===value}
        onMouseDown={event=>event.preventDefault()} onClick={()=>choose(index)}
        className={`px-3 py-2.5 text-xs whitespace-normal break-words cursor-pointer border-b border-slate-100 ${active===index?'bg-teal-50 text-teal-950':'text-slate-800'} ${option.id===value?'font-bold':''}`}>
        {option.displayOption}
      </div>)}
    </div>}
  </div>;
};
