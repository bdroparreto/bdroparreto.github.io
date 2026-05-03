import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const REQUIRED = ['ABERTURA', 'TROCA DE TURNO', 'FECHAMENTO'];
const LIMITS = { ABERTURA: '10:30', 'TROCA DE TURNO': '16:20', FECHAMENTO: '23:30' };

function saoPauloYesterday() {
  const now = new Date();
  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  sp.setDate(sp.getDate() - 1);
  return sp.toISOString().slice(0, 10);
}

function fmtBR(dateStr) {
  const [y,m,d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function minutesFromIso(iso) { const d = new Date(iso); return d.getHours()*60 + d.getMinutes(); }
function limitMin(name){ const [h,m]=LIMITS[name].split(':').map(Number); return h*60+m; }

function buildSummary(subs, maint, refDate){
  const daySubs = subs.filter(s=>s.date===refDate);
  const byReq = REQUIRED.map((name)=> daySubs.find(s=>s.checklist_name===name));
  const completed = byReq.filter(Boolean);
  const conclu = completed.length;
  const pct = Math.round((conclu/3)*100);
  const pontuais = completed.filter(s=>minutesFromIso(s.filled_at) <= limitMin(s.checklist_name)).length;
  const atrasados = completed.filter(s=>minutesFromIso(s.filled_at) > limitMin(s.checklist_name)).length;
  const naoRealizados = 3 - conclu;
  const comProblema = completed.filter(s=>s.status==='Com problema' || s.has_problem).length;
  const crit = maint.filter(m => (m.date===refDate) && (m.status||'').toLowerCase()!=='resolvido' && ['grave','urgente'].includes((m.criticidade||'').toLowerCase()));
  const pendencias = REQUIRED.filter(name=>!completed.find(s=>s.checklist_name===name)).map(name=>`- ${name} — não realizado`);
  return { refDate, conclu, pct, pontuais, atrasados, naoRealizados, comProblema, alertas: crit.length, pendencias, crit };
}

export default async function handler(req, res) {
  try {
    const CRON_SECRET = process.env.CRON_SECRET;
    if (CRON_SECRET) {
      const auth = req.headers.authorization || '';
      if (auth !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
    }

    const dryRun = String(req.query?.dryRun || 'false') === 'true';
    const send = String(req.query?.send || 'false') === 'true';

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'missing supabase env' });

    const supabase = createClient(supabaseUrl, supabaseKey);
    const refDate = saoPauloYesterday();

    const [{ data: subs, error: e1 }, { data: maint, error: e2 }] = await Promise.all([
      supabase.from('submissions').select('date,checklist_name,filled_at,status,has_problem'),
      supabase.from('maintenance_records').select('date,status,criticidade,item_problema,area_praca,descricao_problema')
    ]);
    if (e1 || e2) throw e1 || e2;

    const summary = buildSummary(subs || [], maint || [], refDate);
    if (dryRun && !send) return res.status(200).json({ ok: true, dryRun: true, summary });

    const to = (process.env.DAILY_SUMMARY_TO || '').split(',').map(s=>s.trim()).filter(Boolean);
    const from = process.env.DAILY_SUMMARY_FROM;
    const key = process.env.RESEND_API_KEY;
    if (!to.length || !from || !key) return res.status(500).json({ error: 'missing resend env', summary });

    const pendText = summary.pendencias.length ? summary.pendencias.join('\n') : 'Pendências: nenhuma no período.';
    const subject = `Resumo Checklists Notorious Fish - ${fmtBR(summary.refDate)}`;
    const text = `📋 Resumo checklists - Delivery\nReferência: ${fmtBR(summary.refDate)}\n\nConclusão do dia: ${summary.conclu}/3 (${summary.pct}%)\nPontuais: ${summary.pontuais}\nAtrasados: ${summary.atrasados}\nNão realizados: ${summary.naoRealizados}\nCom problema: ${summary.comProblema}\nAlertas críticos/urgentes: ${summary.alertas}\n\nPendências:\n${pendText}\n\nAcompanhar no painel admin:\nhttps://bdroparreto-github-io.vercel.app/admin`;

    const resend = new Resend(key);
    const sent = await resend.emails.send({ from, to, subject, text, html: `<pre>${text}</pre>` });
    return res.status(200).json({ ok: true, sent, summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
