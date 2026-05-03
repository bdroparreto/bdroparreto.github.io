import Papa from 'papaparse';
import { useEffect, useMemo, useState } from 'react';
import csvRaw from '../data/checklists_delivery_mvp.csv?raw';
import { supabase } from './lib/supabaseClient';

const MAIN_ORDER = ['ABERTURA', 'TROCA DE TURNO', 'FECHAMENTO', 'MANUTENÇÃO'];
const today = () => new Date().toISOString().slice(0, 10);
const nowHm = () => new Date().toTimeString().slice(0, 5);
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fileUrl = (path) => supabase.storage.from('checklist-files').getPublicUrl(path).data.publicUrl;

function parseCsvStructure() {
  const parsed = Papa.parse(csvRaw, { header: true, delimiter: ';' }).data.filter(Boolean);
  const grouped = {};
  const hasNew = parsed[0] && 'nome_checklist' in parsed[0];
  if (!hasNew) return {};
  parsed.filter((r) => r.nome_checklist).forEach((r) => {
    const name = (r.nome_checklist || '').toUpperCase();
    grouped[name] ??= { horario: r.horario || '', items: [] };
    grouped[name].items.push({ item: r.item_checklist, tipo: (r.tipo_resposta || 'check').toLowerCase(), foto: (r.foto || '').toLowerCase() === 'sim', obrigatorio: (r.obrigatorio || '').toLowerCase() === 'sim', ordem: Number(r.ordem || 999), observacao: r.observacao || '' });
  });
  return grouped;
}

async function uploadFile(file, folder) { if (!file) return null; const ext = file.name.split('.').pop(); const path = `${folder}/${crypto.randomUUID()}.${ext}`; const { error } = await supabase.storage.from('checklist-files').upload(path, file, { upsert: false }); if (error) throw error; return { name: file.name, path, type: file.type || 'application/octet-stream' }; }

function statusFrom(check, todaySub) { const s = todaySub.find((x) => x.checklist_name === check); if (s) return s.has_problem ? 'Com problema' : 'Preenchido'; const now = toMinutes(nowHm()); const limits = { ABERTURA: 10 * 60 + 30, 'TROCA DE TURNO': 16 * 60 + 20, FECHAMENTO: 23 * 60 + 30 }; if (limits[check] && now > limits[check]) return 'Atrasado'; return 'Pendente'; }

function FillCardForm({ name, config, operator, onSave, saving, onClose, origin }) {
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState({});
  const items = [...config.items].sort((a, b) => a.ordem - b.ordem).filter((it) => !(name === 'MANUTENÇÃO' && it.item.toLowerCase() === 'observações'));
  const missing = items.filter((it) => it.obrigatorio && ((it.foto && !files[it.item]) || (!it.foto && (answers[it.item] === undefined || answers[it.item] === ''))));
  const valid = operator.trim() && missing.length === 0;

  const getControl = (it) => {
    if (it.item.toLowerCase() === 'observações') return <textarea rows={3} placeholder='Observações (opcional)' onChange={e => setAnswers({ ...answers, [it.item]: e.target.value })} />;
    if (it.tipo === 'check') return <label className='inline-check'><input type='checkbox' checked={!!answers[it.item]} onChange={e => setAnswers({ ...answers, [it.item]: e.target.checked ? 'Sim' : '' })} /> Confirmado</label>;
    if (it.tipo === 'sim_nao') return <div className='simnao'><button type='button' className={answers[it.item] === 'Sim' ? 'active' : ''} onClick={() => setAnswers({ ...answers, [it.item]: 'Sim' })}>Sim</button><button type='button' className={answers[it.item] === 'Não' ? 'active' : ''} onClick={() => setAnswers({ ...answers, [it.item]: 'Não' })}>Não</button></div>;
    if (it.tipo === 'texto') return <input onChange={e => setAnswers({ ...answers, [it.item]: e.target.value })} />;
    if (it.tipo === 'select') return <select onChange={e => setAnswers({ ...answers, [it.item]: e.target.value })}><option value=''>Selecione</option>{it.item === 'Setor' && ['Cozinha', 'Expedição', 'Infraestrutura'].map(v => <option key={v}>{v}</option>)}{it.item === 'Criticidade do problema' && ['baixa', 'média', 'grave', 'urgente'].map(v => <option key={v}>{v}</option>)}</select>;
    return <input onChange={e => setAnswers({ ...answers, [it.item]: e.target.value })} />;
  };

  return <div className='modal'><div className='card'><h2>{name}</h2>{origin && <p><b>Origem:</b> {origin}</p>}<p><b>Horário:</b> {config.horario}</p>{items.map((it) => <div key={it.item}><label><b>{it.item}</b> {it.obrigatorio ? '*' : ''}</label>{getControl(it)}{it.foto && <input type='file' accept='image/*,.pdf' onChange={e => setFiles({ ...files, [it.item]: e.target.files?.[0] || null })} />}</div>)}{missing.length > 0 && <p>Preencha todos os campos obrigatórios antes de finalizar.</p>}<button disabled={!valid || saving} onClick={() => onSave({ name, answers, files, origin })}>Finalizar</button><button onClick={onClose}>Cancelar</button></div></div>;
}

export function FillPage() {
  const [operator, setOperator] = useState(localStorage.getItem('operator') || '');
  const [structure] = useState(parseCsvStructure());
  const [subs, setSubs] = useState([]);
  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState(false);
  const cards = useMemo(() => MAIN_ORDER.filter((n) => structure[n]).map((n) => ({ name: n, ...structure[n] })), [structure]);
  const fetchSubs = async () => { const { data } = await supabase.from('submissions').select('*').eq('date', today()); setSubs(data || []); };

  async function saveSubmission({ name, answers, files, origin }) {
    setSaving(true);
    try {
      const card = cards.find((c) => c.name === name);
      const problem = answers['Itens com problema'] === 'Sim';
      const payload = { id: crypto.randomUUID(), checklist_id: null, checklist_name: name, operator_name: operator, unidade: 'Delivery', date: today(), filled_at: new Date().toISOString(), status: problem ? 'Com problema' : 'Preenchido', has_problem: problem, observacoes: answers['Observações'] || '', responses_json: { items: answers, horario_previsto: card.horario, origin_checklist: origin || null } };
      const { data: inserted, error } = await supabase.from('submissions').insert(payload).select().single();
      if (error) throw error;
      const fileRows = [];
      for (const [item, file] of Object.entries(files)) { const up = await uploadFile(file, `submissions/${inserted.id}/${item}`); if (up) fileRows.push({ submission_id: inserted.id, checklist_item: item, file_name: up.name, file_path: up.path, file_type: up.type }); }
      if (fileRows.length) await supabase.from('submission_files').insert(fileRows);
      if (name === 'MANUTENÇÃO' || problem) await supabase.from('maintenance_records').insert({ submission_id: inserted.id, date: today(), unidade: 'Delivery', checklist_origem: origin || (problem ? name : null), area_praca: answers['Setor'] || '', item_problema: answers['Equipamento'] || '', descricao_problema: answers['Descrição breve do problema'] || '', responsible: operator, criticidade: answers['Criticidade do problema'] || '', status: 'Aberto', observacoes: '' });
      await fetchSubs();
      if (problem && name !== 'MANUTENÇÃO') setActive({ name: 'MANUTENÇÃO', origin: name }); else setActive(null);
    } catch (e) { alert(`Erro ao salvar: ${e.message}`); }
    setSaving(false);
  }

  useEffect(() => { fetchSubs(); }, []);
  useEffect(() => localStorage.setItem('operator', operator), [operator]);

  return <main><h1>Checklist do Dia - Delivery</h1><input placeholder='Nome' value={operator} onChange={e => setOperator(e.target.value)} />{cards.map((c) => { const st = statusFrom(c.name, subs); return <article key={c.name} className={`card ${st}`}><h2>{c.name}</h2><p><b>Limite:</b> {c.horario}</p><span>{st}</span><button disabled={!operator.trim()} onClick={() => setActive({ name: c.name })}>Preencher</button></article>; })}{active && <FillCardForm name={active.name} origin={active.origin} config={structure[active.name]} operator={operator} onSave={saveSubmission} saving={saving} onClose={() => setActive(null)} />}</main>;
}

export function AdminPage() {
  const [subs, setSubs] = useState([]); const [files, setFiles] = useState([]); const [manu, setManu] = useState([]);
  const fetchData = async () => { const { data: s } = await supabase.from('submissions').select('*').order('filled_at', { ascending: false }); const { data: f } = await supabase.from('submission_files').select('*'); const { data: m } = await supabase.from('maintenance_records').select('*').order('date', { ascending: false }); setSubs(s || []); setFiles(f || []); setManu(m || []); };
  useEffect(() => { fetchData(); }, []);
  const exportCsv = () => { const rows = ['data,checklist,responsavel,horario_envio,status,observacoes,itens_marcados,teve_problema,manutencao,anexos']; subs.forEach((r) => { const itens = JSON.stringify(r.responses_json?.items || {}); const ann = files.filter(f => f.submission_id === r.id).map(f => fileUrl(f.file_path)).join('|'); const maint = manu.find(m => m.submission_id === r.id); rows.push([r.date, r.checklist_name, r.operator_name, r.filled_at, r.status, `"${(r.observacoes || '').replaceAll('"', '""')}"`, `"${itens.replaceAll('"', '""')}"`, r.has_problem ? 'Sim' : 'Não', maint ? 'Sim' : 'Não', ann].join(',')); }); const blob = new Blob([rows.join('\n')]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'historico_checklists.csv'; a.click(); };
  return <main><h1>Painel Administrativo</h1><p><a href='/preenchimento'>Acessar preenchimento</a> · <a href='/admin'>Acessar painel admin</a></p><button onClick={fetchData}>Atualizar</button><button onClick={exportCsv}>Exportar CSV</button><table><thead><tr><th>Data</th><th>Card</th><th>Responsável</th><th>Status</th><th>Observações</th><th>Itens</th><th>Anexos</th></tr></thead><tbody>{subs.map((r) => <tr key={r.id}><td>{r.date}</td><td>{r.checklist_name}</td><td>{r.operator_name}</td><td>{r.status}</td><td>{r.observacoes || '-'}</td><td><pre>{JSON.stringify(r.responses_json?.items || {}, null, 2)}</pre></td><td>{files.filter(f => f.submission_id === r.id).map(f => <a key={f.id} href={fileUrl(f.file_path)} target='_blank'>{f.file_name}</a>)}</td></tr>)}</tbody></table></main>;
}
