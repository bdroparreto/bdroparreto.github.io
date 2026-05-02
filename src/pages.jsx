import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabaseClient';

const maintenanceTriggers = ['Abertura da casa', 'Checagem de temperatura 1', 'Troca de turno', 'Checagem de temperatura 2', 'Fechamento da casa'];
const today = () => new Date().toISOString().slice(0, 10);
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
  const needsManual = check.anexo_manual;
  const needsPhoto = check.foto_ambiente;
  const needsText = check.categoria === 'Troca de turno';
  const needsOknok = check.categoria.includes('Checklist de praça') || check.categoria.includes('Limpeza');
  const valid = (!needsManual || files.manual) && (!needsPhoto || files.foto) && (!needsText || f.passagem.trim()) && operator.trim();

  return <div className='modal'><div className='card'><h3>{check.categoria}</h3><input type='time' defaultValue={new Date().toTimeString().slice(0, 5)} readOnly /><p>Responsável: <b>{operator}</b></p>{needsOknok && <select onChange={e => setF({ ...f, oknok: e.target.value })}><option>OK</option><option>NOK</option><option>Conforme</option><option>Não conforme</option></select>}{needsText && <textarea placeholder='Pendências e avisos' onChange={e => setF({ ...f, passagem: e.target.value })} />}<textarea placeholder='Observações (opcional)' onChange={e => setF({ ...f, observacoes: e.target.value })} />{needsManual && <input type='file' accept='image/*,.pdf' onChange={e => setFiles({ ...files, manual: e.target.files?.[0] || null })} />}<input type='file' accept='image/*,.pdf' onChange={e => setFiles({ ...files, foto: e.target.files?.[0] || null })} /><label>Há problema?</label><select onChange={e => setF({ ...f, hasProblem: e.target.value })}><option>Não</option><option>Sim</option></select>{f.hasProblem === 'Sim' && maintenanceTriggers.includes(check.categoria) && <div><h4>Manutenção</h4><input placeholder='Área/Praça' onChange={e => setM({ ...m, area: e.target.value })} /><input placeholder='Item com problema' onChange={e => setM({ ...m, item: e.target.value })} /><textarea placeholder='Descrição' onChange={e => setM({ ...m, descricao: e.target.value })} /><select onChange={e => setM({ ...m, criticidade: e.target.value })}><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select></div>}<button disabled={!valid || saving} onClick={() => onSave({ check, f, files, m })}>{saving ? 'Salvando...' : 'Finalizar'}</button><button onClick={onClose} disabled={saving}>Cancelar</button></div></div>;
}

export function FillPage() {
  const [operator, setOperator] = useState(localStorage.getItem('operator') || '');
  const [checklists, setChecklists] = useState([]);
  const [subs, setSubs] = useState([]);
  const [active, setActive] = useState();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const ordered = useMemo(() => [...checklists].sort((a, b) => (a.id - b.id)), [checklists]);

  async function fetchChecklistsAndSubmissions() {
    setLoading(true);
    const { data: cData, error: cErr } = await supabase.from('checklists').select('*').eq('unidade', 'Delivery').order('id');
    if (cErr) alert(`Erro ao carregar checklists do Supabase: ${cErr.message}`);
    setChecklists(cData || []);
    const { data: sData, error: sErr } = await supabase.from('submissions').select('*, submission_files(*)').eq('date', today());
    if (sErr) alert(`Erro ao carregar envios do dia: ${sErr.message}`);
    setSubs(sData || []);
    setLoading(false);
  }

  const status = (c) => {
    const s = subs.find((x) => Number(x.checklist_id) === Number(c.id) && x.date === today());
    if (s) return s.has_problem ? 'Com problema' : 'Preenchido';
    return 'Pendente';
  };

  async function save({ check, f, files, m }) {
    setSaving(true);
    try {
      if (!check?.id) throw new Error('Checklist inválido. Atualize a página e tente novamente.');
      const exists = checklists.some((c) => Number(c.id) === Number(check.id));
      if (!exists) throw new Error('Checklist não encontrado na base Supabase.');

      const payload = {
        id: crypto.randomUUID(), checklist_id: Number(check.id), operator_name: operator, unidade: 'Delivery', date: today(), filled_at: new Date().toISOString(), status: f.hasProblem === 'Sim' ? 'Com problema' : 'Preenchido', has_problem: f.hasProblem === 'Sim', observacoes: f.observacoes, oknok: f.oknok, passagem: f.passagem
      };
      const { error: subErr } = await supabase.from('submissions').insert(payload);
      if (subErr) throw subErr;

      const uploaded = [];
      if (files.manual) uploaded.push({ ...(await uploadFile(files.manual, `submissions/${payload.id}/manual`)), kind: 'manual' });
      if (files.foto) uploaded.push({ ...(await uploadFile(files.foto, `submissions/${payload.id}/foto`)), kind: 'foto' });
      if (uploaded.length) {
        const rows = uploaded.map((f0) => ({ submission_id: payload.id, file_name: `${f0.kind}:${f0.name}`, file_path: f0.path, file_type: f0.type }));
        const { error: fileErr } = await supabase.from('submission_files').insert(rows);
        if (fileErr) throw fileErr;
      }

      if (payload.has_problem && maintenanceTriggers.includes(check.categoria)) {
        const { error: mErr } = await supabase.from('maintenance_records').insert({ submission_id: payload.id, date: today(), unidade: 'Delivery', checklist_origem: check.categoria, area_praca: m.area, item_problema: m.item, descricao_problema: m.descricao, responsible: operator, criticidade: m.criticidade, status: m.status, prazo_retorno: m.prazo, observacoes: m.observacoes });
        if (mErr) throw mErr;
      }

      await fetchChecklistsAndSubmissions();
      setActive(null);
    } catch (e) {
      alert(`Erro ao salvar no Supabase: ${e.message}`);
    } finally { setSaving(false); }
  }

  useEffect(() => { fetchChecklistsAndSubmissions(); }, []);
  useEffect(() => localStorage.setItem('operator', operator), [operator]);

  if (loading) return <main><h1>Checklist do Dia - Delivery</h1><p>Carregando dados do Supabase...</p></main>;
  if (!checklists.length) return <main><h1>Checklist do Dia - Delivery</h1><p>Nenhum checklist cadastrado no Supabase para a unidade Delivery. Execute o seed SQL do arquivo <code>supabase/schema.sql</code>.</p><p><a href='/admin'>Ir para painel admin</a></p></main>;

  return <main><h1>Checklist do Dia - Delivery</h1><p><a href='/preenchimento'>Acessar preenchimento</a> · <a href='/admin'>Acessar painel admin</a></p><input placeholder='Nome do Líder de Turno' value={operator} onChange={e => setOperator(e.target.value)} required />{ordered.map(c => { const st = status(c); return <article key={c.id} className={`card ${st}`}><h3>{c.categoria}</h3><p>{c.momento} · {c.frequencia}</p><p><b>Limite:</b> {deadlineText(c.horario_previsto)}</p><p><b>Responsável sugerido:</b> {c.responsavel_sugerido || '-'}</p><span>{st}</span><button disabled={!operator.trim()} onClick={() => setActive(c)}>{st === 'Preenchido' || st === 'Com problema' ? 'Visualizar envio' : 'Preencher'}</button></article>; })}{active && <ChecklistForm check={active} operator={operator} onClose={() => setActive(null)} onSave={save} saving={saving} />}</main>;
}

export function AdminPage() {
  const [subs, setSubs] = useState([]);
  const [manu, setManu] = useState([]);
  const [f, setF] = useState({ date: '', responsible: '', status: '' });

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
