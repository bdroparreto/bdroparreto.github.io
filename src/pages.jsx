import Papa from 'papaparse';
import { useEffect, useMemo, useState } from 'react';
import csvRaw from '../data/checklists_delivery_mvp.csv?raw';
import { supabase } from './lib/supabaseClient';

const maintenanceTriggers = ['Abertura da casa', 'Checagem de temperatura 1', 'Troca de turno', 'Checagem de temperatura 2', 'Fechamento da casa'];
const today = () => new Date().toISOString().slice(0, 10);
const parseCsv = () => Papa.parse(csvRaw, { header: true, delimiter: ';' }).data.filter((r) => r.ID);
const deadlineText = (h) => h || 'Conforme rotina';
const fileUrl = (path) => supabase.storage.from('checklist-files').getPublicUrl(path).data.publicUrl;

async function uploadFile(file, folder) {
  if (!file) return null;
  const ext = file.name.split('.').pop();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('checklist-files').upload(path, file, { upsert: false });
  if (error) throw error;
  return { name: file.name, path, type: file.type || 'application/octet-stream', url: fileUrl(path) };
}

function ChecklistForm({ check, onClose, onSave, operator, saving }) {
  const [f, setF] = useState({ observacoes: '', oknok: 'OK', passagem: '', hasProblem: 'Não' });
  const [files, setFiles] = useState({ manual: null, foto: null });
  const [m, setM] = useState({ area: '', item: '', descricao: '', criticidade: 'Média', status: 'Aberto', prazo: '', observacoes: '' });
  const needsManual = check['Anexo ficha manual?'] === 'Sim';
  const needsPhoto = check['Foto ambiente?'] === 'Sim';
  const needsText = check.Categoria === 'Troca de turno';
  const needsOknok = check.Categoria.includes('Checklist de praça') || check.Categoria.includes('Limpeza');
  const valid = (!needsManual || files.manual) && (!needsPhoto || files.foto) && (!needsText || f.passagem.trim()) && operator.trim();

  return <div className='modal'><div className='card'><h3>{check.Categoria}</h3><input type='time' defaultValue={new Date().toTimeString().slice(0, 5)} readOnly /><p>Responsável: <b>{operator}</b></p>{needsOknok && <select onChange={e => setF({ ...f, oknok: e.target.value })}><option>OK</option><option>NOK</option><option>Conforme</option><option>Não conforme</option></select>}{needsText && <textarea placeholder='Pendências e avisos' onChange={e => setF({ ...f, passagem: e.target.value })} />}<textarea placeholder='Observações (opcional)' onChange={e => setF({ ...f, observacoes: e.target.value })} />{needsManual && <input type='file' accept='image/*,.pdf' onChange={e => setFiles({ ...files, manual: e.target.files?.[0] || null })} />}<input type='file' accept='image/*,.pdf' onChange={e => setFiles({ ...files, foto: e.target.files?.[0] || null })} /><label>Há problema?</label><select onChange={e => setF({ ...f, hasProblem: e.target.value })}><option>Não</option><option>Sim</option></select>{f.hasProblem === 'Sim' && maintenanceTriggers.includes(check.Categoria) && <div><h4>Manutenção</h4><input placeholder='Área/Praça' onChange={e => setM({ ...m, area: e.target.value })} /><input placeholder='Item com problema' onChange={e => setM({ ...m, item: e.target.value })} /><textarea placeholder='Descrição' onChange={e => setM({ ...m, descricao: e.target.value })} /><select onChange={e => setM({ ...m, criticidade: e.target.value })}><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select></div>}<button disabled={!valid || saving} onClick={() => onSave({ check, f, files, m })}>{saving ? 'Salvando...' : 'Finalizar'}</button><button onClick={onClose} disabled={saving}>Cancelar</button></div></div>;
}

export function FillPage() {
  const [operator, setOperator] = useState(localStorage.getItem('operator') || '');
  const [checklists] = useState(parseCsv());
  const [subs, setSubs] = useState([]);
  const [active, setActive] = useState();
  const [saving, setSaving] = useState(false);

  const ordered = useMemo(() => [...checklists].sort((a, b) => a.ID - b.ID), [checklists]);

  async function fetchSubmissions() {
    const { data, error } = await supabase.from('submissions').select('*, submission_files(*)').eq('date', today());
    if (!error) setSubs(data || []);
  }

  const status = (c) => {
    const s = subs.find((x) => String(x.checklist_id) === String(c.ID) && x.date === today());
    if (s) return s.has_problem ? 'Com problema' : 'Preenchido';
    return 'Pendente';
  };

  async function save({ check, f, files, m }) {
    setSaving(true);
    try {
      const payload = {
        id: crypto.randomUUID(), checklist_id: Number(check.ID), operator_name: operator, unidade: 'Delivery', date: today(), filled_at: new Date().toISOString(), status: f.hasProblem === 'Sim' ? 'Com problema' : 'Preenchido', has_problem: f.hasProblem === 'Sim', observacoes: f.observacoes, oknok: f.oknok, passagem: f.passagem
      };
      const { error: subErr } = await supabase.from('submissions').upsert(payload, { onConflict: 'id' });
      if (subErr) throw subErr;

      const uploaded = [];
      if (files.manual) uploaded.push({ ...(await uploadFile(files.manual, `submissions/${payload.id}/manual`)), kind: 'manual' });
      if (files.foto) uploaded.push({ ...(await uploadFile(files.foto, `submissions/${payload.id}/foto`)), kind: 'foto' });
      if (uploaded.length) {
        const rows = uploaded.map((f0) => ({ submission_id: payload.id, file_name: `${f0.kind}:${f0.name}`, file_path: f0.path, file_type: f0.type }));
        const { error: fileErr } = await supabase.from('submission_files').insert(rows);
        if (fileErr) throw fileErr;
      }

      if (payload.has_problem && maintenanceTriggers.includes(check.Categoria)) {
        const { error: mErr } = await supabase.from('maintenance_records').insert({ submission_id: payload.id, date: today(), unidade: 'Delivery', checklist_origem: check.Categoria, area_praca: m.area, item_problema: m.item, descricao_problema: m.descricao, responsible: operator, criticidade: m.criticidade, status: m.status, prazo_retorno: m.prazo, observacoes: m.observacoes });
        if (mErr) throw mErr;
      }

      await fetchSubmissions();
      setActive(null);
    } catch (e) {
      alert(`Erro ao salvar no Supabase: ${e.message}`);
    } finally { setSaving(false); }
  }

  useEffect(() => { fetchSubmissions(); }, []);
  useEffect(() => localStorage.setItem('operator', operator), [operator]);

  return <main><h1>Checklist do Dia - Delivery</h1><p><a href='/preenchimento'>Acessar preenchimento</a> · <a href='/admin'>Acessar painel admin</a></p><input placeholder='Nome do Líder de Turno' value={operator} onChange={e => setOperator(e.target.value)} required />{ordered.map(c => { const st = status(c); return <article key={c.ID} className={`card ${st}`}><h3>{c.Categoria}</h3><p>{c.Momento} · {c['Frequência']}</p><p><b>Limite:</b> {deadlineText(c['Horário previsto'])}</p><p><b>Responsável sugerido:</b> {c['Responsável sugerido'] || '-'}</p><span>{st}</span><button disabled={!operator.trim()} onClick={() => setActive(c)}>{st === 'Preenchido' || st === 'Com problema' ? 'Visualizar envio' : 'Preencher'}</button></article>; })}{active && <ChecklistForm check={active} operator={operator} onClose={() => setActive(null)} onSave={save} saving={saving} />}</main>;
}

export function AdminPage() {
  const [subs, setSubs] = useState([]);
  const [manu, setManu] = useState([]);
  const [f, setF] = useState({ date: '', checklist: '', responsible: '', status: '' });

  async function fetchData() {
    const { data: sData } = await supabase.from('submissions').select('*, submission_files(*)').order('filled_at', { ascending: false });
    const { data: mData } = await supabase.from('maintenance_records').select('*').order('date', { ascending: false });
    setSubs(sData || []);
    setManu(mData || []);
  }

  useEffect(() => { fetchData(); }, []);

  const data = subs.filter(s => (!f.date || s.date === f.date) && (!f.responsible || (s.operator_name || '').includes(f.responsible)) && (!f.status || s.status === f.status));

  const exportCsv = () => {
    const rows = ['data,horario_preenchimento,checklist_id,responsavel,status,problema,observacoes,anexos'];
    data.forEach(r => rows.push([r.date, r.filled_at, r.checklist_id, r.operator_name, r.status, r.has_problem ? 'Sim' : 'Não', `"${(r.observacoes || '').replaceAll('"', '""')}"`, (r.submission_files || []).map(x => fileUrl(x.file_path)).join('|')].join(',')));
    const blob = new Blob([rows.join('\n')]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'historico_checklists.csv'; a.click();
  };

  return <main><h1>Painel Administrativo</h1><p><a href='/preenchimento'>Acessar preenchimento</a> · <a href='/admin'>Acessar painel admin</a></p><section className='grid'><div>Total previstos: 8</div><div>Total preenchido: {subs.length}</div><div>Com problema: {subs.filter(s => s.has_problem).length}</div><div>Pendentes: {Math.max(8 - subs.length, 0)}</div></section><section><h2>Filtros</h2><input type='date' onChange={e => setF({ ...f, date: e.target.value })} /><input placeholder='Responsável' onChange={e => setF({ ...f, responsible: e.target.value })} /><button onClick={fetchData}>Atualizar</button><button onClick={exportCsv}>Exportar CSV</button></section><table><thead><tr><th>Data</th><th>Checklist ID</th><th>Responsável</th><th>Status</th><th>Anexos</th></tr></thead><tbody>{data.map(r => <tr key={r.id}><td>{r.date}</td><td>{r.checklist_id}</td><td>{r.operator_name}</td><td>{r.status}</td><td>{(r.submission_files || []).map(x => <a key={x.id} href={fileUrl(x.file_path)} target='_blank'>{x.file_name}</a>)}</td></tr>)}</tbody></table><h2>Manutenções abertas</h2>{manu.filter(m => m.status !== 'Resolvido').map(m => <article key={m.id} className='card'><b>{m.checklist_origem}</b><p>{m.item_problema} - {m.descricao_problema}</p><p>{m.status} · {m.criticidade}</p></article>)}</main>;
}
