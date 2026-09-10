import {h} from '../engine/render.ts'
import type {WorldReport} from '../../shared/world-system.ts'
const labels={open:'Offen',convicted:'Verurteilt',dismissed:'Abgewiesen'}
export function worldPanel(request:(body?:unknown)=>Promise<WorldReport>){
  let report:WorldReport|undefined,busy=false,timer:ReturnType<typeof setTimeout>|undefined
  const params=new URLSearchParams(location.search)
  const defenseDrafts=new Map<number,string>()
  let tab=['bank','alliances','justice'].includes(params.get('worldTab')??'')?params.get('worldTab')!:'bank'
  const param=(key:string,value:string)=>{const u=new URL(location.href);u.searchParams.set(key,value);history.replaceState(null,'',u)}
  const notice=h('p',{role:'status',class:'civic-notice'})
  const metrics=h('div',{class:'civic-metrics'})
  const bank=h('section'),alliances=h('section'),justice=h('section')
  const action=async(body:unknown)=>{
    if(busy)return;busy=true;notice.textContent='Wird verarbeitet …'
    try{update(await request(body));notice.textContent='Aktion bestätigt.'}catch(e){notice.textContent=(e as Error).message}finally{busy=false}
  }
  const button=(label:string,fn:()=>void)=>h('button',{type:'button',onClick:fn},label)
  const input=(name:string,key:string,value:string,type='text')=>h('input',{'aria-label':name,type,value:params.get(key)??value,onInput:(e:Event)=>param(key,(e.target as HTMLInputElement).value)}) as HTMLInputElement
  const amount=input('Bankbetrag','bankAmount','1000','number');amount.min='1';amount.max='1000000000000';amount.step='1'
  bank.append(h('h2','Bank'),h('p','Einlagen bleiben bei Eroberung und Respawn erhalten. Bargeld und lokale Vorräte sind Beute. Keine Zinsen und kein neues Startgeld beim Respawn.'),
    h('div',{class:'civic-trade'},h('label','Betrag in Credits',amount),button('Einzahlen',()=>void action({action:'bank_deposit',amount:Number(amount.value),bankVersion:report?.me.bankVersion})),button('Auszahlen',()=>void action({action:'bank_withdraw',amount:Number(amount.value),bankVersion:report?.me.bankVersion}))))
  const name=input('Bündnisname','allianceName','');name.maxLength=48
  const allianceList=h('div',{class:'world-list'})
  const activity=h('div',{class:'world-list'})
  const target=input('Spieler-Kennung für Krieg','warTarget','','number')
  const warReason=input('Begründung der Kriegserklärung','warReason','Gebietskonflikt')
  alliances.append(h('h2','Bündnisse'),h('p','Verbündete greifen sich nicht automatisch an. Aufnahmen werden von der Bündnisleitung bestätigt. Städtebünde nehmen friedliche Kommandanten direkt auf.'),
    h('div',{class:'civic-trade'},h('label','Neues Bündnis',name),button('Bündnis gründen',()=>void action({action:'alliance_create',name:name.value}))),allianceList,
    h('h2','Handel & Konflikte'),h('p','Fremdes Gebiet bleibt gesperrt. Bündnisse gewähren Baurecht; im Krieg muss das Gebiet erst erobert werden. Kriegserklärungen kosten 5 Reputation.'),
    h('div',{class:'civic-trade'},h('label','Spieler-Kennung',target),h('label','Begründung',warReason),button('Krieg erklären',()=>void action({action:'war_declare',targetId:Number(target.value),statement:warReason.value}))),activity)
  const conquest=h('select',{'aria-label':'Eroberung für Klage',onChange:()=>param('conquest',conquest.value)}) as HTMLSelectElement
  const charge=h('select',{'aria-label':'Klagegrund',onChange:()=>param('charge',charge.value)},h('option',{value:'civilian_seizure'},'Zivile Enteignung / Zerstörung'),h('option',{value:'alliance_breach'},'Bündnisbruch')) as HTMLSelectElement
  if(params.get('charge')==='alliance_breach')charge.value='alliance_breach'
  const statement=h('textarea',{'aria-label':'Klagebegründung',maxlength:1000,rows:3,placeholder:'Begründe deine Klage anhand des Eroberungsberichts.'}) as HTMLTextAreaElement
  const cases=h('div',{class:'world-list'})
  justice.append(h('h2','Rat der Bündnisse'),h('p','Eroberung kostet 20 Reputation, Bündnisbruch weitere 30. Eine Klage ist noch kein Urteil: 60 reale Sekunden Stellungnahmefrist, danach entscheiden drei neutrale Bündnisse mit Mehrheit. NPC-Räte prüfen die gespeicherten Ereignisse. Verurteilung: weitere −30 und Status „Kriegsverbrecher“.'),
    h('div',{class:'civic-trade'},h('label','Erfasste Eroberung',conquest),h('label','Vorwurf',charge)),statement,
    button('Klage einreichen',()=>void action({action:'case_file',conquestId:Number(conquest.value),charge:charge.value,statement:statement.value})),cases)
  const setTab=(next:string)=>{tab=next;param('worldTab',next);bank.hidden=tab!=='bank';alliances.hidden=tab!=='alliances';justice.hidden=tab!=='justice';for(const b of tabs.children)b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.tab===tab))}
  const tabs=h('nav',{'aria-label':'Globales System',class:'world-tabs'},...([['bank','Bank'],['alliances','Bündnisse'],['justice','Gericht']] as const).map(([id,label])=>{const b=button(label,()=>setTab(id));b.dataset.tab=id;return b}))
  const dialog=h('dialog',{class:'civic-panel world-panel','aria-label':'Globales System',onCancel:()=>close()},
    h('header',h('div',h('span',{class:'civic-eyebrow'},'Real Command / GLOBALES SYSTEM'),h('h1','Besitz. Bündnisse. Verantwortung.')),button('Schließen',()=>close())),metrics,tabs,notice,bank,alliances,justice,
    h('footer','Respawn stellt den gespeicherten Gebäudeplan an einem freien Ort wieder her. Keine Einheiten, Vorräte oder Bargeld. Bankeinlagen, Bündnis und Reputation bleiben bestehen.')) as HTMLDialogElement
  document.body.append(dialog);setTab(tab)
  function update(next:WorldReport){
    report=next
    const m=next.me,num=(n:number)=>n.toLocaleString('de-DE')
    metrics.replaceChildren(...[['Bargeld',num(m.cash)+' CR'],['Bank',num(m.bank)+' CR'],['Reputation',String(m.reputation)],['Status',m.criminal?'Kriegsverbrecher':'Nicht verurteilt'],['Wiederaufbau',m.rebuildBuildings+' Gebäude']].map(([k,v])=>h('div',h('span',k),h('strong',v))))
    allianceList.replaceChildren(...next.alliances.map(a=>h('article',h('h3',a.name),h('p',`${a.members} Mitglieder · Leitung: ${next.names[a.leader]??a.leader}${a.joined?' · Dein Bündnis':''}`),
      a.joined?button('Bündnis verlassen',()=>void action({action:'alliance_leave'})):!m.alliance?button(a.applied?'Bewerbung eingereicht':a.npc?'Beitreten':'Aufnahme beantragen',()=>void action({action:'alliance_apply',allianceId:a.id})):null,
      ...a.applicants.map(id=>button(`${next.names[id]??id} aufnehmen`,()=>void action({action:'alliance_accept',memberId:id}))))))
    activity.replaceChildren(...next.wars.map(w=>h('article',h('h3',`${next.names[w.attacker]} gegen ${next.names[w.defender]}`),h('p',`${w.aggregate?'Aggregierter Bot-Feldzug':'Krieg'} · ${{declared:'Erklärt',marching:'Anmarsch',battle:'Gefechte',ended:'Beendet'}[w.status]} · ${w.result??w.reason}`),w.status!=='ended'&&[w.attacker,w.defender].includes(m.id)?button('Frieden anbieten / annehmen',()=>void action({action:'war_peace',warId:w.id})):null)),
      ...next.trades.slice(0,10).map(t=>h('article',h('p',`${next.names[t.buyer]} kauft ${t.quantity} ${t.good==='food'?'Nahrung':'Konsumgüter'} von ${next.names[t.seller]} für ${t.credits} CR.`))))
    const selected=conquest.value||params.get('conquest')
    conquest.replaceChildren(...next.conquests.filter(c=>c.victim===m.id).map(c=>h('option',{value:String(c.id)},`#${c.id} · ${next.names[c.attacker]??c.attacker} · ${c.buildings} Gebäude`)))
    if(selected&&Array.from(conquest.options).some(o=>o.value===selected))conquest.value=selected
    if(document.activeElement?.tagName==='TEXTAREA'&&cases.contains(document.activeElement))return
    cases.replaceChildren(...next.cases.map(c=>{
      const response=h('textarea',{'aria-label':`Stellungnahme Fall ${c.id}`,maxlength:1000,rows:2}) as HTMLTextAreaElement
      response.value=defenseDrafts.get(c.id)??'';response.addEventListener('input',()=>defenseDrafts.set(c.id,response.value))
      const judge=next.alliances.some(a=>a.joined&&a.leader===m.id&&c.judges.includes(a.id))
      return h('article',h('h3',`Fall #${c.id} · ${labels[c.status]}`),h('p',`${next.names[c.evidence.victim]} gegen ${next.names[c.evidence.attacker]} · ${c.charge==='alliance_breach'?'Bündnisbruch':'Zivile Enteignung / Zerstörung'}`),h('p',c.statement),c.defense?h('p','Stellungnahme: '+c.defense):null,
        h('p',`${c.evidence.civilianBuildings} zivile Gebäude · Bündnisbruch: ${c.evidence.allianceBreach?'ja':'nein'} · ${Object.keys(c.votes).length}/3 Stimmen${c.judges.length<3?' · Wartet auf drei neutrale Bündnisse':''}`),
        c.status==='open'&&c.evidence.attacker===m.id?h('div',response,button('Stellungnahme abgeben',()=>void action({action:'case_defend',caseId:c.id,statement:response.value}))):null,
        c.status==='open'&&judge?h('div',button('Schuldig',()=>void action({action:'case_vote',caseId:c.id,guilty:true})),button('Abweisen',()=>void action({action:'case_vote',caseId:c.id,guilty:false}))):null)
    }))
  }
  async function refresh(){try{update(await request())}catch(e){notice.textContent=(e as Error).message}if(dialog.open)timer=setTimeout(()=>void refresh(),5000)}
  function close(){dialog.close();if(timer)clearTimeout(timer);const u=new URL(location.href);u.searchParams.delete('panel');history.replaceState(null,'',u)}
  return {isOpen:()=>dialog.open,open:()=>{if(dialog.open)return;dialog.showModal();param('panel','world');void refresh()},close,dispose:()=>{if(timer)clearTimeout(timer);dialog.remove()}}
}
