'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kapok } from '@/components/icons';
import { macauNow } from '@/components/ui';
import { parseWorkbook, type ImportResult } from '@/lib/excel';
import { finalizeRows, recordFor, warnings } from '@/lib/marks';
import type { Live, Meet, ResultRow, Round } from '@/lib/types';

type Staff = { role: 'admin' | 'entry'; name: string };
interface State {
  staff: Staff;
  meet: Meet;
  live: Live;
  storageMode: string;
  dataUrl: string;
}

async function api<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined && method === 'POST' ? 'GET' : method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `錯誤 ${res.status}`), { status: res.status });
  return data as T;
}

function Login({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card adminLogin"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr('');
        try {
          await api('/api/admin/login', { name, password });
          onDone();
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="mark">
        <Kapok size={36} />
      </div>
      <h2>紅棉賽場 · 工作人員登入</h2>
      <input placeholder="你的名字（記錄誰發佈了成績）" value={name} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="密碼" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {err ? <div className="err">{err}</div> : null}
      <button className="primary" disabled={busy}>
        {busy ? '登入中…' : '登入'}
      </button>
      <p className="sub center">管理員可匯入名單和相片；成績錄入員只能錄成績。</p>
    </form>
  );
}

// ---------- results entry ----------

function emptyRow(): ResultRow {
  return { bib: '', mark: '', status: '' };
}

// msg lives in the parent: publishing re-mounts the editor (to show the saved rows), which would wipe local state.
function ResultEditor({
  round,
  state,
  onSaved,
  msg,
  setMsg,
}: {
  round: Round;
  state: State;
  onSaved: (live: Live) => void;
  msg: string;
  setMsg: (m: string) => void;
}) {
  const { meet, live } = state;
  const relay = round.kind === 'relay' || round.kind === 'other';
  const existing = live.results[round.id];
  const initial = (): ResultRow[] => {
    // ranks are always computed from marks (here for display, and again on the server when publishing)
    if (existing) return existing.rows.map((r) => ({ ...r, rank: null, record: undefined }));
    if (round.entries.length)
      return [...round.entries]
        .sort((a, b) => (a.heat ?? 0) - (b.heat ?? 0) || (a.lane ?? 0) - (b.lane ?? 0))
        .map((e) => ({ bib: e.bib ?? '', team: e.team ?? '', heat: e.heat, mark: '', status: '' }));
    return Array.from({ length: Math.min(round.count ?? 8, 8) }, emptyRow);
  };
  const [rows, setRows] = useState<ResultRow[]>(initial);
  const [busy, setBusy] = useState(false);
  const byBib = useMemo(() => new Map(meet.athletes.map((a) => [a.bib, a])), [meet]);
  const table = useRef<HTMLTableElement>(null);
  // Enter in a mark box jumps to the next row's mark, so a heat can be typed straight from the paper sheet.
  const nextMark = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    table.current?.querySelector<HTMLInputElement>(`input[data-mark="${i + 1}"]`)?.focus();
  };

  const set = (i: number, patch: Partial<ResultRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const named = rows.filter((r) => r.bib || r.team || r.name);
  // rows without a mark or status are left out, so one heat can be published before the next is run
  const filled = named.filter((r) => r.mark.trim() || r.status);
  const blank = named.length - filled.length;
  const warn = warnings(filled, round, meet);
  const copies = filled.map((r) => ({ ...r, rank: null }));
  const preview = finalizeRows(copies, round, recordFor(meet, round));
  const rankOf = new Map(copies.map((c, i) => [filled[i], c.rank]));
  const record = recordFor(meet, round);

  const send = async (body: object, ok: string) => {
    setBusy(true);
    setMsg('');
    try {
      const res = await api<{ live: Live }>('/api/admin/results', { roundId: round.id, ...body });
      onSaved(res.live);
      setMsg(ok);
    } catch (e) {
      setMsg('❌ ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card editor">
      <h3>
        #{round.id} · {round.time} · {round.title}
      </h3>
      <div className="sub">
        {record ? `大會紀錄 ${record.mark}（${record.holder} ${record.year}）· ` : ''}
        {round.kind === 'field' ? '成績越大越好，例如 5.20' : '成績越小越好，例如 12.34 或 2:15.30'}
        {' · '}名次按成績自動計算，同成績同名次
      </div>
      <table className="tbl edit" ref={table}>
        <thead>
          <tr>
            <th>組</th>
            <th>{relay ? '隊伍 / 班級' : '號碼 / 姓名'}</th>
            <th>成績</th>
            <th>名次</th>
            <th>狀態</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const a = r.bib ? byBib.get(r.bib) : undefined;
            return (
              <tr key={i}>
                <td>
                  <input className="w2" inputMode="numeric" value={r.heat ?? ''} onChange={(e) => set(i, { heat: Number(e.target.value) || undefined })} />
                </td>
                <td>
                  {relay ? (
                    <input className="w6" value={r.team ?? ''} onChange={(e) => set(i, { team: e.target.value })} />
                  ) : (
                    <input className="w4" inputMode="numeric" value={r.bib ?? ''} onChange={(e) => set(i, { bib: e.target.value.trim() })} />
                  )}
                  {relay || !meet.athletes.length ? (
                    <input className="w6 nameIn" value={r.name ?? ''} placeholder={relay ? '名稱（可留空）' : '姓名'} onChange={(e) => set(i, { name: e.target.value })} />
                  ) : (
                    <div className="sub nowrap">{a ? `${a.name} ${a.cls}` : r.bib ? '⚠️ 不在名單' : ''}</div>
                  )}
                </td>
                <td>
                  <input
                    className="w5"
                    inputMode="decimal"
                    enterKeyHint="next"
                    data-mark={i}
                    value={r.mark}
                    onKeyDown={(e) => nextMark(e, i)}
                    onChange={(e) => set(i, { mark: e.target.value })}
                  />
                </td>
                <td>
                  <span className={`rankno sm ${rankOf.get(r) && rankOf.get(r)! <= 3 ? `m${rankOf.get(r)}` : ''}`}>{rankOf.get(r) ?? '–'}</span>
                </td>
                <td>
                  <select value={r.status ?? ''} onChange={(e) => set(i, { status: e.target.value as ResultRow['status'] })}>
                    <option value="">—</option>
                    <option value="DNS">DNS 缺席</option>
                    <option value="DNF">DNF 未完成</option>
                    <option value="DQ">DQ 犯規</option>
                  </select>
                </td>
                <td>
                  <button className="link" aria-label="刪除此行" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <Icon name="x" size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="link" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
        <Icon name="plus" size={14} /> 加一行
      </button>
      {blank ? <div className="sub">另有 {blank} 行未填成績，不會發佈。</div> : null}
      {warn.length ? (
        <ul className="warn">
          {warn.map((w, i) => (
            <li key={i}>⚠️ {w}</li>
          ))}
        </ul>
      ) : null}
      {preview.some((r) => r.record) ? (
        <div className="warn">🔥 將標示破紀錄：{preview.filter((r) => r.record).map((r) => `${r.bib || r.team} ${r.mark}`).join('、')}。請總裁判確認後才發佈。</div>
      ) : null}
      <div className="row">
        <button className="ghost" disabled={busy} onClick={() => send({ action: 'running', running: !live.running.includes(round.id) }, '已更新')}>
          {live.running.includes(round.id) ? '取消「進行中」' : '標記為進行中'}
        </button>
        {existing ? (
          <button className="ghost" disabled={busy} onClick={() => confirm('撤回後觀眾將看不到這場成績，確定？') && send({ action: 'withdraw' }, '已撤回')}>
            撤回成績
          </button>
        ) : null}
        <button
          className="primary"
          disabled={busy || !filled.length}
          onClick={() => confirm(`已對照紙本核對 ${filled.length} 行成績，確定發佈？`) && send({ action: 'publish', rows: filled }, '✅ 已發佈，觀眾約 30 秒內看到')}
        >
          {existing ? '更新發佈' : '發佈成績'}
        </button>
      </div>
      {msg ? <div className="msg">{msg}</div> : null}
      {existing ? (
        <div className="sub">
          上次發佈：{new Date(existing.publishedAt).toLocaleString('zh-Hant', { hour12: false })} · {existing.by}
        </div>
      ) : null}
    </div>
  );
}

function ResultsTab({ state, setLive, reload }: { state: State; setLive: (l: Live) => void; reload: () => void }) {
  const today = state.meet.days.find((d) => d.date === macauNow().date)?.day ?? 1;
  const [day, setDay] = useState(today);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const { results, running } = state.live;
  const query = q.trim();
  const rounds = query
    ? state.meet.rounds.filter((r) => r.id.startsWith(query) || r.title.includes(query))
    : state.meet.rounds.filter((r) => r.day === day);
  const round = state.meet.rounds.find((r) => r.id === sel);
  const dayRounds = state.meet.rounds.filter((r) => r.day === day);

  // Someone else may have published meanwhile: refresh when returning to the list, and every 30 s on it.
  useEffect(() => {
    if (sel) return;
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [sel, reload]);

  if (round)
    return (
      <>
        <button
          className="link"
          onClick={() => {
            setSel(null);
            setMsg('');
            reload();
          }}
        >
          <Icon name="back" size={14} /> 返回賽次列表
        </button>
        <ResultEditor
          key={round.id + (results[round.id]?.publishedAt ?? '')}
          round={round}
          state={state}
          onSaved={setLive}
          msg={msg}
          setMsg={setMsg}
        />
      </>
    );

  return (
    <>
      <div className="tabs">
        {state.meet.days.map((d) => (
          <button key={d.day} className={d.day === day && !query ? 'on' : ''} onClick={() => (setDay(d.day), setQ(''))}>
            <b>第{d.day}日</b>
            <small>{d.label}</small>
          </button>
        ))}
      </div>
      <div className="stats">
        <div>
          <b>
            {dayRounds.filter((r) => results[r.id]).length}/{dayRounds.length}
          </b>
          <span>本日已發佈</span>
        </div>
        <div>
          <b>{running.length}</b>
          <span>進行中</span>
        </div>
        <div>
          <b>{Object.values(results).reduce((n, x) => n + x.rows.filter((r) => r.record).length, 0)}</b>
          <span>破紀錄</span>
        </div>
      </div>
      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="輸入序號（如 105）或項目搜尋" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="card">
        {rounds.length === 0 ? <p className="empty">找不到賽次</p> : null}
        {rounds.map((r) => (
          <button key={r.id} className={`round adminRound ${results[r.id] ? 'done' : running.includes(r.id) ? 'running' : ''}`} onClick={() => setSel(r.id)}>
            <span className="time">
              {query ? <small>第{r.day}日</small> : null}
              {r.time}
            </span>
            <span className="rtitle">
              #{r.id} {r.title}
              <span className="extra">{r.entries.length ? `名單 ${r.entries.length}` : '未有名單'}</span>
            </span>
            <span className="sub">{results[r.id] ? '已發佈' : running.includes(r.id) ? '進行中' : ''}</span>
            <Icon name="chevron" size={16} className="chev" />
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- import ----------

function ImportTab({ state, setMeet }: { state: State; setMeet: (m: Meet) => void }) {
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div className="card">
      <h3>匯入 Excel</h3>
      <p className="sub">
        一個 Excel 檔可同時包含三張表：運動員（號碼布、姓名、班級、性別、組別）、參賽名單（序號或項目、號碼布或隊伍、組次、道次）、大會紀錄（項目、成績、保持者、年份）。只匯入檔案中有的表，其他保持不變。
        <a href="/template.xlsx" download>
          下載範本
        </a>
      </p>
      <input
        type="file"
        accept=".xlsx"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setFileName(f.name);
          setMsg('');
          try {
            setParsed(await parseWorkbook(f, state.meet.rounds));
          } catch (err) {
            setMsg('❌ 讀取失敗：' + (err as Error).message);
          }
        }}
      />
      {parsed ? (
        <div className="preview">
          <p>找到：{parsed.sheets.join('、') || '無'}</p>
          <ul>
            {parsed.athletes ? <li>運動員 {parsed.athletes.length} 人（目前 {state.meet.athletes.length} 人，將整批取代）</li> : null}
            {parsed.entries ? <li>參賽名單 {parsed.entries.length} 行（將整批取代現有名單）</li> : null}
            {parsed.records ? <li>大會紀錄 {parsed.records.length} 項</li> : null}
          </ul>
          {parsed.problems.length ? (
            <ul className="warn">
              {parsed.problems.slice(0, 20).map((p, i) => (
                <li key={i}>⚠️ {p}</li>
              ))}
              {parsed.problems.length > 20 ? <li>…另有 {parsed.problems.length - 20} 項</li> : null}
            </ul>
          ) : null}
          {parsed.athletes?.length ? (
            <p className="sub">
              例子：{parsed.athletes
                .slice(0, 3)
                .map((a) => `${a.bib} ${a.name} ${a.cls} ${a.gender === 'M' ? '男' : '女'}${a.group}`)
                .join('；')}
            </p>
          ) : null}
          <button
            className="primary"
            disabled={!parsed.sheets.length}
            onClick={async () => {
              try {
                const res = await api<{ meet: Meet; unknownRounds: string[] }>('/api/admin/meet', {
                  action: 'import',
                  athletes: parsed.athletes,
                  entries: parsed.entries,
                  records: parsed.records,
                  demo: /demo|示範/i.test(fileName),
                });
                setMeet(res.meet);
                setParsed(null);
                setMsg('✅ 已匯入' + (res.unknownRounds.length ? `；以下賽次號碼不存在，已略過：${res.unknownRounds.join('、')}` : ''));
              } catch (err) {
                setMsg('❌ ' + (err as Error).message);
              }
            }}
          >
            確認匯入
          </button>
        </div>
      ) : null}
      {msg ? <div className="msg">{msg}</div> : null}
      <p className="sub">
        現有資料：運動員 {state.meet.athletes.length} 人 · 有名單的賽次 {state.meet.rounds.filter((r) => r.entries.length).length}/{state.meet.rounds.length} · 大會紀錄 {state.meet.records.length} 項
      </p>
    </div>
  );
}

// ---------- photos ----------

async function shrink(file: File, max = 480): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.75);
}

function PhotosTab({ state, setMeet }: { state: State; setMeet: (m: Meet) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [day, setDay] = useState('');
  const [msg, setMsg] = useState('');
  const base = state.dataUrl || '/api/public';
  return (
    <div className="card">
      <h3>新增相片</h3>
      <p className="sub">原圖放在外部雲端相簿（Google 相簿、Google Drive、OneDrive 等）並取得分享連結；這裏只上載一張縮圖，觀眾點縮圖會打開原圖連結。</p>
      <div className="form">
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input placeholder="原圖或相簿連結 https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input placeholder="說明（可留空）" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <select value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">日期（可留空）</option>
          {state.meet.days.map((d) => (
            <option key={d.day} value={d.day}>
              第{d.day}日
            </option>
          ))}
        </select>
        <button
          className="primary"
          disabled={!file || !url}
          onClick={async () => {
            try {
              const dataUrl = await shrink(file!);
              const res = await api<{ meet: Meet }>('/api/admin/photo', { dataUrl, url, caption, day });
              setMeet(res.meet);
              setMsg('✅ 已新增');
              setCaption('');
              setUrl('');
            } catch (e) {
              setMsg('❌ ' + (e as Error).message);
            }
          }}
        >
          上載縮圖
        </button>
      </div>
      {msg ? <div className="msg">{msg}</div> : null}
      <div className="grid">
        {[...state.meet.photos].reverse().map((p) => (
          <div key={p.id} className="ph">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/${p.thumb}`} alt={p.caption} />
            <button
              className="link"
              onClick={async () => {
                if (!confirm('刪除這張相片？')) return;
                const res = await api<{ meet: Meet }>('/api/admin/meet', { action: 'photo-delete', id: p.id });
                setMeet(res.meet);
              }}
            >
              刪除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- notice & schedule ----------

function SettingsTab({ state, setMeet, setLive }: { state: State; setMeet: (m: Meet) => void; setLive: (l: Live) => void }) {
  const [notice, setNotice] = useState(state.meet.notice);
  const [id, setId] = useState('');
  const [time, setTime] = useState('');
  const [msg, setMsg] = useState('');
  const run = async (body: object, ok = '✅ 已更新，觀眾數分鐘內看到') => {
    try {
      const res = await api<{ meet?: Meet; live?: Live }>('/api/admin/meet', body);
      if (res.meet) setMeet(res.meet);
      if (res.live) setLive(res.live);
      setMsg(ok);
    } catch (e) {
      setMsg('❌ ' + (e as Error).message);
    }
  };
  const target = state.meet.rounds.find((r) => r.id === id);
  return (
    <div className="card">
      <h3>公告橫幅</h3>
      <textarea rows={2} value={notice} placeholder="例如：因天雨，下午賽事延後 30 分鐘" onChange={(e) => setNotice(e.target.value)} />
      <div className="row">
        <button className="ghost" onClick={() => run({ action: 'notice', notice: '' }).then(() => setNotice(''))}>
          清除
        </button>
        <button className="primary" onClick={() => run({ action: 'notice', notice })}>
          發佈公告
        </button>
      </div>
      <h3>修改賽次時間</h3>
      <div className="form">
        <input placeholder="序號，例如 105" value={id} onChange={(e) => setId(e.target.value.trim())} />
        <div className="sub">{target ? `${target.title} 現在 ${target.time}` : id ? '找不到此序號' : ''}</div>
        <input placeholder="新時間，例如 9:30" value={time} onChange={(e) => setTime(e.target.value.trim())} />
        <button className="primary" disabled={!target || !time} onClick={() => run({ action: 'round', id, time })}>
          更新時間
        </button>
      </div>
      {msg ? <div className="msg">{msg}</div> : null}
      <h3 className="danger-h">清除資料</h3>
      <p className="sub">
        彩排後可只清除成績；正式名單到手前，先清除全部示範資料再匯入。賽程和改過的時間會保留。現有：運動員 {state.meet.athletes.length} 人，已發佈成績{' '}
        {Object.keys(state.live.results).length} 場。
      </p>
      <div className="row">
        <button
          className="ghost danger"
          onClick={() => prompt('會刪除所有已發佈的成績，不能復原。請輸入「清除」確認') === '清除' && run({ action: 'clear-results' }, '✅ 已清除所有成績')}
        >
          只清除成績
        </button>
        <button
          className="ghost danger"
          onClick={() =>
            prompt('會刪除運動員、名單、大會紀錄、相片、公告和所有成績，不能復原。請輸入「清除」確認') === '清除' &&
            run({ action: 'clear-all' }, '✅ 已清除全部資料，可以匯入正式名單')
          }
        >
          清除全部資料
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [state, setState] = useState<State | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [tab, setTab] = useState<'results' | 'import' | 'photos' | 'settings'>('results');

  const [loadErr, setLoadErr] = useState('');
  const load = useCallback(async () => {
    try {
      setState(await api<State>('/api/admin/state'));
      setNeedLogin(false);
      setLoadErr('');
    } catch (e) {
      // only a missing/expired session sends you back to the login form; a network blip keeps your screen
      if ((e as { status?: number }).status === 401) setNeedLogin(true);
      else setLoadErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (needLogin)
    return (
      <div className="page admin">
        <main>
          <Login onDone={load} />
        </main>
      </div>
    );
  if (!state)
    return (
      <div className="page admin">
        <main>
          {loadErr ? <div className="warn">載入失敗：{loadErr}</div> : null}
          <div className="skeleton">
            <div />
            <div />
          </div>
        </main>
      </div>
    );

  const setLive = (live: Live) => setState((s) => (s ? { ...s, live } : s));
  const setMeet = (meet: Meet) => setState((s) => (s ? { ...s, meet } : s));
  const isAdmin = state.staff.role === 'admin';
  type Tab = typeof tab;
  const tabs: [Tab, string][] = [
    ['results', '成績錄入'],
    ...(isAdmin
      ? [
          ['import', '匯入資料'],
          ['photos', '相片'],
          ['settings', '公告、時間與清除'],
        ] as [Tab, string][]
      : []),
  ];

  return (
    <div className="page admin">
      <header className="bar">
        <span className="back" />
        <h1>紅棉賽場 · 後台</h1>
        <button
          className="back"
          aria-label="登出"
          onClick={async () => {
            await fetch('/api/admin/login', { method: 'DELETE' });
            setNeedLogin(true);
          }}
        >
          <Icon name="logout" size={20} />
        </button>
      </header>
      <main>
        {loadErr ? <div className="warn">更新失敗：{loadErr}</div> : null}
        <div className="adminTop">
          <span className="avatar">
            <Icon name="user" size={20} />
          </span>
          <div className="grow">
            <div className="nm">{state.staff.name}</div>
            <div className="sub">{isAdmin ? '管理員' : '成績錄入員'}</div>
          </div>
          <span className={`storage ${state.storageMode}`}>{state.storageMode === 'r2' ? '已連接 R2' : '本機模式'}</span>
          <button className="chip" onClick={load}>
            <Icon name="refresh" size={14} /> 重新整理
          </button>
        </div>
        {tabs.length > 1 ? (
          <div className="chips">
            {tabs.map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {tab === 'results' ? <ResultsTab state={state} setLive={setLive} reload={load} /> : null}
        {tab === 'import' && isAdmin ? <ImportTab state={state} setMeet={setMeet} /> : null}
        {tab === 'photos' && isAdmin ? <PhotosTab state={state} setMeet={setMeet} /> : null}
        {tab === 'settings' && isAdmin ? <SettingsTab state={state} setMeet={setMeet} setLive={setLive} /> : null}
        <p className="sub center">
          <a href="/" target="_blank" rel="noreferrer">
            打開觀眾頁面 <Icon name="external" size={12} />
          </a>
        </p>
      </main>
    </div>
  );
}
