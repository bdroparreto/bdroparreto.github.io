import Papa from 'papaparse';
import { useEffect, useMemo, useState } from 'react';
import csvRaw from '../data/checklists_delivery_mvp.csv?raw';
import { supabase } from './lib/supabaseClient';

const MAIN_ORDER = [101, 102, 103, 104];
const today = () => new Date().toISOString().slice(0, 10);
const nowHm = () => new Date().toTimeString().slice(0, 5);
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fileUrl = (path) => supabase.storage.from('checklist-files').getPublicUrl(path).data.publicUrl;

const REQUIRED = ['ABERTURA','TROCA DE TURNO','FECHAMENTO'];
const LIMITS = { ABERTURA: '10:30', 'TROCA DE TURNO': '16:20', FECHAMENTO: '23:30' };
const dateMinusDays=(d)=>{const x=new Date();x.setDate(x.getDate()-d);return x.toISOString().slice(0,10)};
const computeStatus=(name,todaySubs)=>{if(todaySubs.find(s=>s.checklist_name===name)) return 'preenchido'; const [h,m]=LIMITS[name].split(':').map(Number); const now=new Date(); return (now.getHours()*60+now.getMinutes())>(h*60+m)?'atrasado':'pendente';};


function csvFallback() {
  const parsed = Papa.parse(csvRaw, { header: true, delimiter: ';' }).data.filter((r) => r.nome_checklist);
  const map = {};
  parsed.forEach((r) => {
    const name = (r.nome_checklist || '').toUpperCase();
    map[name] ??= { id: MAIN_ORDER.find((x, i) => ['ABERTURA', 'TROCA DE TURNO', 'FECHAMENTO', 'MANUTENÇÃO'][i] === name), categoria: name, horario_previsto: r.horario || '', items: [] };
    map[name].items.push({ item_nome: r.item_checklist, tipo_resposta: r.tipo_resposta, foto_obrigatoria: (r.foto || '').toLowerCase() === 'sim', obrigatorio: (r.obrigatorio || '').toLowerCase() === 'sim', ordem: Number(r.ordem || 999), observacao: r.observacao || '' });
  });
  return Object.values(map);
}

async function uploadFile(file, folder) { if (!file) return null; const ext = file.name.split('.').pop(); const path = `${folder}/${crypto.randomUUID()}.${ext}`; const { error } = await supabase.storage.from('checklist-files').upload(path, file, { upsert: false }); if (error) throw error; return { name: file.name, path, type: file.type || 'application/octet-stream' }; }

function statusFrom(card, todaySub) { const s = todaySub.find((x) => x.checklist_name === card.categoria); if (s) return s.has_problem ? 'Com problema' : 'Preenchido'; const now = toMinutes(nowHm()); const limits = { 101: 10 * 60 + 30, 102: 16 * 60 + 20, 103: 23 * 60 + 30 }; if (limits[card.id] && now > limits[card.id]) return 'Atrasado'; return 'Pendente'; }

function FillCardForm({ card, operator, onSave, saving, onClose, origin }) {
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState({});
  const name = card.categoria;
  const items = [...(card.items || [])].sort((a, b) => (a.ordem || 999) - (b.ordem || 999)).filter((it) => !(name === 'MANUTENÇÃO' && (it.item_nome || '').toLowerCase() === 'observações'));
  const missing = items.filter((it) => it.obrigatorio && ((it.foto_obrigatoria && !files[it.item_nome]) || (!it.foto_obrigatoria && (answers[it.item_nome] === undefined || answers[it.item_nome] === ''))));
  const valid = operator.trim() && missing.length === 0;

  const control = (it) => {
    const item = it.item_nome;
    const tipo = (it.tipo_resposta || 'check').toLowerCase();
    if (item.toLowerCase() === 'observações') return <textarea rows={3} placeholder='Observações (opcional)' onChange={e => setAnswers({ ...answers, [item]: e.target.value })} />;
    if (tipo === 'check') return <label className='inline-check touch-row'><input type='checkbox' checked={!!answers[item]} onChange={e => setAnswers({ ...answers, [item]: e.target.checked ? 'Sim' : '' })} /> <span>Confirmado</span></label>;
    if (tipo === 'sim_nao') return <div className='simnao'><button type='button' className={answers[item] === 'Sim' ? 'active' : ''} onClick={() => setAnswers({ ...answers, [item]: 'Sim' })}>Sim</button><button type='button' className={answers[item] === 'Não' ? 'active' : ''} onClick={() => setAnswers({ ...answers, [item]: 'Não' })}>Não</button></div>;
    if (tipo === 'texto') return <input onChange={e => setAnswers({ ...answers, [item]: e.target.value })} />;
    return <select onChange={e => setAnswers({ ...answers, [item]: e.target.value })}><option value=''>Selecione</option>{item === 'Setor' && ['Cozinha', 'Expedição', 'Infraestrutura'].map(v => <option key={v}>{v}</option>)}{item === 'Criticidade do problema' && ['baixa', 'média', 'grave', 'urgente'].map(v => <option key={v}>{v}</option>)}</select>;
  };

  return <div className='modal'><div className='card form-card'><h2>{name}</h2>{origin && <p><b>Origem:</b> {origin}</p>}<p><b>Horário:</b> {card.horario_previsto}</p>{items.map((it) => <div key={it.item_nome} className='item-row'><label className='item-label'><b>{it.item_nome}</b> {it.obrigatorio ? <span className='req'>*</span> : <span className='opt'>(opcional)</span>}</label>{control(it)}{it.foto_obrigatoria && <div className='upload-box'><small>Foto obrigatória</small><input type='file' accept='image/*,.pdf' onChange={e => setFiles({ ...files, [it.item_nome]: e.target.files?.[0] || null })} />{files[it.item_nome] && <small>Arquivo: {files[it.item_nome].name}</small>}</div>}</div>)}{missing.length > 0 && <p className='error-box'>Faltam {missing.length} campo(s) obrigatório(s).</p>}<div className='actions'><button className='primary' disabled={!valid || saving} onClick={() => onSave({ card, answers, files, origin })}>Finalizar</button><button className='secondary' onClick={onClose}>Cancelar</button></div></div></div>;
}

export function FillPage() {
  const [operator, setOperator] = useState(localStorage.getItem('operator') || '');
  const [cards, setCards] = useState([]);
  const [subs, setSubs] = useState([]);
  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const fetchSubs = async () => { const { data } = await supabase.from('submissions').select('*').eq('date', today()); setSubs(data || []); };
  const fetchCards = async () => {
    setErr('');
    const { data: checks, error: ec } = await supabase.from('checklists').select('id,categoria,horario_previsto').in('id', MAIN_ORDER).order('id');
    const { data: items, error: ei } = await supabase.from('checklist_items').select('checklist_id,item_nome,tipo_resposta,foto_obrigatoria,obrigatorio,ordem,observacao').in('checklist_id', MAIN_ORDER).order('ordem');
    if (ec || ei) {
      setErr(`Falha ao carregar checklists: ${ec?.message || ei?.message}`);
      const fb = csvFallback();
      setCards(fb);
      return;
    }
    const grouped = (checks || []).map((c) => ({ ...c, items: (items || []).filter((i) => i.checklist_id === c.id) }));
    setCards(grouped);
  };

  async function saveSubmission({ card, answers, files, origin }) {
    setSaving(true);
    try {
      const problem = answers['Itens com problema'] === 'Sim';
      const payload = { id: crypto.randomUUID(), checklist_id: card.id, checklist_name: card.categoria, operator_name: operator, unidade: 'Delivery', date: today(), filled_at: new Date().toISOString(), status: problem ? 'Com problema' : 'Preenchido', has_problem: problem, observacoes: answers['Observações'] || '', responses_json: { items: answers, horario_previsto: card.horario_previsto, origin_checklist: origin || null } };
      const { data: inserted, error } = await supabase.from('submissions').insert(payload).select().single(); if (error) throw error;
      const fileRows = []; for (const [item, file] of Object.entries(files)) { const up = await uploadFile(file, `submissions/${inserted.id}/${item}`); if (up) fileRows.push({ submission_id: inserted.id, checklist_item: item, file_name: up.name, file_path: up.path, file_type: up.type }); }
      if (fileRows.length) await supabase.from('submission_files').insert(fileRows);
      if (card.categoria === 'MANUTENÇÃO' || problem) await supabase.from('maintenance_records').insert({ submission_id: inserted.id, date: today(), unidade: 'Delivery', checklist_origem: origin || (problem ? card.categoria : null), area_praca: answers['Setor'] || '', item_problema: answers['Equipamento'] || '', descricao_problema: answers['Descrição breve do problema'] || '', responsible: operator, criticidade: answers['Criticidade do problema'] || '', status: 'Aberto', observacoes: '' });
      await fetchSubs();
      if (problem && card.categoria !== 'MANUTENÇÃO') setActive({ card: cards.find(c => c.categoria==='MANUTENÇÃO'), origin: card.categoria }); else setActive(null);
    } catch (e) { alert(`Erro ao salvar: ${e.message}`); }
    setSaving(false);
  }

  useEffect(() => { fetchCards(); fetchSubs(); }, []);
  useEffect(() => localStorage.setItem('operator', operator), [operator]);

  return <main><header className='brand-header'><div className='brand-mark'>Notorious Fish</div><h1>Checklist do Dia - Delivery</h1></header><input className='name-input' placeholder='Nome' value={operator} onChange={e => setOperator(e.target.value)} />{err && <p className='error-box'>{err}</p>}{cards.length === 0 ? <p>Nenhum checklist encontrado. Verifique o cadastro no Supabase.</p> : cards.map((c) => { const st = statusFrom(c, subs); return <article key={c.id || c.categoria} className={`card ${st} checklist-card`}><h2>{c.categoria}</h2><p><b>Limite:</b> {c.horario_previsto || c.horario}</p><span className='status-pill'>{st}</span><button className='primary' disabled={!operator.trim()} onClick={() => setActive({ card: c })}>Preencher</button></article>; })}{active?.card && <FillCardForm card={active.card} origin={active.origin} operator={operator} onSave={saveSubmission} saving={saving} onClose={() => setActive(null)} />}</main>;
}

export function AdminPage() {
  const [subs, setSubs] = useState([]); const [files, setFiles] = useState([]); const [manu, setManu] = useState([]);
  const fetchData = async () => { const { data: s } = await supabase.from('submissions').select('*').order('filled_at', { ascending: false }); const { data: f } = await supabase.from('submission_files').select('*'); const { data: m } = await supabase.from('maintenance_records').select('*').order('date', { ascending: false }); setSubs(s || []); setFiles(f || []); setManu(m || []); };
  useEffect(() => { fetchData(); }, []);

  const t = today();
  const todaySubs = subs.filter(s=>s.date===t);
  const todayRequired = REQUIRED.filter(n=>todaySubs.some(s=>s.checklist_name===n && (s.status==='Preenchido'||s.status==='Com problema'))).length;
  const cumprimentoPct = Math.round((todayRequired/3)*100);
  const pendAtras = REQUIRED.map(n=>({name:n,status:computeStatus(n,todaySubs)}));
  const pendentes = pendAtras.filter(x=>x.status==='pendente').length;
  const atrasados = pendAtras.filter(x=>x.status==='atrasado').length;
  const openedManu = manu.filter(m=>(m.status||'').toLowerCase()!=='resolvido');
  const urg = openedManu.filter(m=>(m.criticidade||'').toLowerCase()==='urgente').length;
  const grave = openedManu.filter(m=>(m.criticidade||'').toLowerCase()==='grave').length;
  const last7 = subs.filter(s=>s.date>=dateMinusDays(6));
  const ranking = Object.entries(last7.reduce((a,s)=>{a[s.operator_name]=(a[s.operator_name]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,3);

  const exportCsv = () => { const rows = ['data,checklist,responsavel,horario_envio,status,observacoes,itens_marcados,teve_problema,manutencao,anexos']; subs.forEach((r) => { const itens = JSON.stringify(r.responses_json?.items || {}); const ann = files.filter(f => f.submission_id === r.id).map(f => fileUrl(f.file_path)).join('|'); const maint = manu.find(m => m.submission_id === r.id); rows.push([r.date, r.checklist_name, r.operator_name, r.filled_at, r.status, `"${(r.observacoes || '').replaceAll('"', '""')}"`, `"${itens.replaceAll('"', '""')}"`, r.has_problem ? 'Sim' : 'Não', maint ? 'Sim' : 'Não', ann].join(',')); }); const blob = new Blob([rows.join('\n')]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'historico_checklists.csv'; a.click(); };

  const statusCount = { preenchido: todaySubs.filter(s=>s.status==='Preenchido').length, comProblema: todaySubs.filter(s=>s.status==='Com problema').length, pendente: pendentes, atrasado: atrasados };

  const [copyMsg, setCopyMsg] = useState('');
  const copyText = async (text) => {
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      setCopyMsg('Mensagem copiada.');
      setTimeout(()=>setCopyMsg(''), 2500);
    } catch { setCopyMsg('Não foi possível copiar.'); }
  };

  const msgResumo = `📋 Resumo checklists - Delivery

Cumprimento hoje: ${todayRequired}/3 (${cumprimentoPct}%)
Preenchidos: ${todayRequired}
Pendentes: ${pendentes}
Atrasados: ${atrasados}
Com problema: ${statusCount.comProblema}
Alertas manutenção: ${urg+grave} graves/urgentes

Acompanhar no painel admin.`;
  const pendList = pendAtras.filter(p=>p.status==='pendente').map(p=>`- ${p.name}`).join('\n');
  const atrList = pendAtras.filter(p=>p.status==='atrasado').map(p=>`- ${p.name}`).join('\n');
  const msgPend = (pendList||atrList) ? `⚠️ Pendências checklists - Delivery\n\nPendentes:\n${pendList||'- Nenhum'}\n\nAtrasados:\n${atrList||'- Nenhum'}\n\nFavor verificar com o líder do turno.` : `✅ Pendências checklists - Delivery\n\nNenhuma pendência ou atraso no momento.`;
  const critAlerts = openedManu.filter(m=>['grave','urgente'].includes((m.criticidade||'').toLowerCase()));
  const preview = critAlerts.slice(0,5).map(m=>`- [${(m.criticidade||'não informado').toUpperCase()}] ${(m.item_problema||'item não informado')}/${(m.area_praca||'item não informado')}: ${m.descricao_problema||'sem descrição'}`).join('\n');
  const msgAlerta = critAlerts.length ? `🚨 Alertas manutenção - Delivery\n\n${preview}\n\nTotal: ${critAlerts.length} alerta(s) grave(s)/urgente(s)\n${critAlerts.length>5?`+ ${critAlerts.length-5} outros alertas no painel admin.\n`:''}\nFavor verificar prioridade.` : `✅ Alertas manutenção - Delivery\n\nNenhum alerta grave ou urgente aberto no momento.`;

  return <main><header className='brand-header'><div className='brand-mark'>Notorious Fish</div><h1>Painel Administrativo</h1></header><p>Resumo operacional dos checklists</p><p><a href='/preenchimento'>Acessar preenchimento</a></p>
  <section className='dash-grid main-kpis'>
    <article className='dash-card'><h3>Cumprimento hoje</h3><p className='kpi-main'><b>{todayRequired}/3</b> · {cumprimentoPct}%</p><div className='progress'><div style={{width:`${cumprimentoPct}%`}} /></div></article>
    <article className='dash-card'><h3>Preenchidos hoje</h3><p className='kpi-main'><b>{todayRequired}</b></p></article>
    <article className='dash-card'><h3>Pendentes / Atrasados</h3><p><span className='chip warn'>{pendentes} pendentes</span></p><p><span className='chip danger'>{atrasados} atrasados</span></p></article>
    <article className='dash-card'><h3>Alertas críticos e urgentes</h3><p className='kpi-main'><b>{urg+grave}</b></p><p>{urg+grave===0?'sem alertas críticos':`${urg} urgente · ${grave} grave`}</p></article>
  </section>
  <section className='dash-grid'>
    <article className='dash-card'><h3>Ranking de preenchimento (7 dias)</h3>{ranking.length===0?<p>Sem dados</p>:<ol>{ranking.map(([n,v])=>{const max=ranking[0][1]||1;return <li key={n}>{n} — {v}<div className='mini-bar'><span style={{width:`${Math.round((v/max)*100)}%`}} /></div></li>})}</ol>}</article>
    <article className='dash-card'><h3>Pendências de hoje</h3>{pendAtras.filter(p=>p.status!=='preenchido').length===0?<p>Nenhuma pendência hoje</p>:pendAtras.filter(p=>p.status!=='preenchido').map(p=><p key={p.name}>{p.name} — <span className={`chip ${p.status==='atrasado'?'danger':'warn'}`}>{p.status==='atrasado'?'Atrasado':'Pendente'}</span></p>)}</article>
    <article className='dash-card'><h3>Status dos checklists</h3><p><span className='chip ok'>Preenchido: {statusCount.preenchido}</span></p><p><span className='chip neutral'>Com problema: {statusCount.comProblema}</span></p><p><span className='chip warn'>Pendente: {statusCount.pendente}</span></p><p><span className='chip danger'>Atrasado: {statusCount.atrasado}</span></p></article>
  </section>
  <section className='dash-card whatsapp-box'><h3>Alertas para WhatsApp</h3><p>Mensagens prontas para colar no grupo da operação.</p><div className='admin-actions'><button onClick={()=>copyText(msgResumo)}>Copiar resumo do dia</button><button onClick={()=>copyText(msgPend)}>Copiar pendências de hoje</button><button onClick={()=>copyText(msgAlerta)}>Copiar alertas graves/urgentes</button></div>{copyMsg && <p className='chip ok'>{copyMsg}</p>}</section><div className='admin-actions'><button onClick={fetchData}>Atualizar</button><button onClick={exportCsv}>Exportar CSV</button></div>
  <table><thead><tr><th>Data</th><th>Horário</th><th>Card</th><th>Responsável</th><th>Status</th><th>Observações</th><th>Problema</th><th>Manutenção</th><th>Anexos</th></tr></thead><tbody>{subs.map((r) => {const maint = manu.find(m=>m.submission_id===r.id); return <tr key={r.id}><td>{r.date}</td><td>{r.filled_at}</td><td>{r.checklist_name}</td><td>{r.operator_name}</td><td><span className='status-pill'>{r.status}</span></td><td>{r.observacoes||'—'}</td><td>{r.status==='Com problema'||r.has_problem?'Sim':'Não'}</td><td>{maint?'Sim':'Não'}</td><td>{files.filter(f => f.submission_id === r.id).map(f => <a key={f.id} href={fileUrl(f.file_path)} target='_blank'>{f.file_name}</a>)}</td></tr>})}</tbody></table></main>;
}
