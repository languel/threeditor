import { UIPanel } from './libs/ui.js';
import { comboFromEvent, formatCombo } from './Keymap.js';

function SidebarSettingsShortcuts( editor ) {
 const panel=new UIPanel();const keymap=editor.keymap;
 const toolbar=document.createElement('div');toolbar.className='shortcut-toolbar';
 const preset=document.createElement('select');preset.className='Select';preset.setAttribute('aria-label','Shortcut preset');
 for(const [value,label] of [['basic','Basic (Maya)'],['blender','Blender']])preset.add(new Option(label,value));
 preset.value=keymap.preset;preset.addEventListener('change',()=>keymap.setPreset(preset.value));
 const search=document.createElement('input');search.className='Input';search.type='search';search.placeholder='Search actions or keys';search.setAttribute('aria-label','Search shortcuts');
 const reset=document.createElement('button');reset.className='Button';reset.textContent='Reset';reset.title='Restore defaults for this preset';reset.addEventListener('click',()=>{keymap.reset();});
 toolbar.append(preset,search,reset);panel.dom.appendChild(toolbar);
 const note=document.createElement('div');note.className='shortcut-note';note.textContent='Click a binding, then press keys. Escape cancels; × clears.';panel.dom.appendChild(note);
 const list=document.createElement('div');list.className='shortcut-list';panel.dom.appendChild(list);
 let captureCleanup=null;
 function render(){
  preset.value=keymap.preset;const query=search.value.trim().toLowerCase();list.replaceChildren();let last='';
  for(const action of [...keymap.actions].sort((a,b)=>a.category.localeCompare(b.category))){const combo=keymap.combo(action.id);if(query&&!(`${action.label} ${action.category} ${formatCombo(combo)}`.toLowerCase().includes(query)))continue;
   if(action.category!==last){last=action.category;const heading=document.createElement('div');heading.className='shortcut-category';heading.textContent=last;list.appendChild(heading);}
   const row=document.createElement('div');row.className='shortcut-row';const label=document.createElement('span');label.textContent=action.label;const button=document.createElement('button');button.className='Button';button.textContent=formatCombo(combo);button.setAttribute('aria-label',`Rebind ${action.label}`);const clear=document.createElement('button');clear.className='Button shortcut-clear';clear.textContent='×';clear.title='Clear binding';clear.setAttribute('aria-label',`Clear ${action.label}`);clear.addEventListener('click',()=>keymap.rebind(action.id,''));const controls=document.createElement('span');controls.className='shortcut-binding';controls.append(button,clear);row.append(label,controls);list.appendChild(row);
   button.addEventListener('click',()=>{
    captureCleanup?.();keymap.recording=true;button.textContent='Press keys…';button.focus();
    const cleanup=()=>{keymap.recording=false;button.removeEventListener('keydown',capture,true);button.removeEventListener('blur',cancel);captureCleanup=null;};
    const cancel=()=>{cleanup();render();};
    const capture=e=>{e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape'){cancel();return;}const value=comboFromEvent(e);if(!value)return;cleanup();keymap.rebind(action.id,value);};
    captureCleanup=cleanup;button.addEventListener('keydown',capture,true);button.addEventListener('blur',cancel);
   });
  }
 }
 search.addEventListener('input',render);keymap.listeners.add(render);render();return panel;
}
export { SidebarSettingsShortcuts };
