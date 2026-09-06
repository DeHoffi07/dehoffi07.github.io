/* Matchday: all interactive controls are handled through document delegation. */
const COOKIE = 'matchday_tournament_v1';
const $ = (s, root = document) => root.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
let state;
let tabTarget = null;

function defaults() { return { players: [], settings: { name: '', mode: 'groups', groupCount: 2, doubleRound: false, thirdPlace: true, swissRounds: 4 }, started: false, groups: [], swiss: { rounds: [] }, ko: null }; }
function save() { document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(state))}; max-age=31536000; path=/; SameSite=Lax`; $('#statusText').textContent = 'Gespeichert'; }
function load() { const hit = document.cookie.split('; ').find(x => x.startsWith(COOKIE + '=')); try { return hit ? { ...defaults(), ...JSON.parse(decodeURIComponent(hit.split('=').slice(1).join('='))) } : defaults(); } catch { return defaults(); } }
function esc(v = '') { const node = document.createElement('span'); node.textContent = v; return node.innerHTML; }
function player(id) { return state.players.find(p => p.id === id); }
function playerName(id) { return player(id)?.name || '—'; }
function toast(text) { const el = $('#toastTemplate').content.firstElementChild.cloneNode(true); el.textContent = text; document.body.append(el); setTimeout(() => el.remove(), 2200); }
function captureScroll() { return [...document.querySelectorAll('[data-scroll]')].map(el => [el.dataset.scroll, el.scrollLeft, el.scrollTop]); }
function restoreScroll(list) { requestAnimationFrame(() => list.forEach(([key, x, y]) => { const el = document.querySelector(`[data-scroll="${key}"]`); if (el) { el.scrollLeft = x; el.scrollTop = y; } })); }

function roundRobin(ids, doubleRound = false) {
  const teams = [...ids]; if (teams.length % 2) teams.push(null); const n = teams.length, rounds = [];
  for (let r = 0; r < n - 1; r++) { const games = []; for (let i = 0; i < n / 2; i++) { const a = teams[i], b = teams[n - 1 - i]; if (a && b) games.push({ id: uid(), home: a, away: b, homeScore: '', awayScore: '' }); } rounds.push(games); teams.splice(1, 0, teams.pop()); }
  return doubleRound ? rounds.concat(rounds.map(games => games.map(m => ({ id: uid(), home: m.away, away: m.home, homeScore: '', awayScore: '' })))) : rounds;
}
function groupsForPlayers() {
  const count = Math.max(1, Math.min(+state.settings.groupCount || 1, state.players.length));
  const groups = Array.from({ length: count }, (_, i) => ({ id: `g${i}`, name: `Gruppe ${String.fromCharCode(65 + i)}`, players: [], rounds: [] }));
  state.players.forEach((p, i) => groups[i % count].players.push(p.id));
  groups.forEach(g => g.rounds = roundRobin(g.players, state.settings.doubleRound)); assignConsoles(groups); return groups;
}
function assignConsoles(groups) {
  groups.forEach((group, groupIndex) => groupMatches(group).forEach((match, matchIndex) => {
    if (!match.console) { const pairStart = Math.floor(groupIndex / 2) * 2; const baseGroup = groups[pairStart]; if (baseGroup.consoleOffset === undefined) baseGroup.consoleOffset = Math.random() < .5 ? 0 : 1; match.console = (matchIndex + (groupIndex % 2) + baseGroup.consoleOffset) % 2 === 0 ? 'PS5' : 'Xbox'; }
  }));
}
function groupKOEntries() {
  const groups = state.groups;
  if (groups.length < 2) return groups.flatMap(g => [{ type: 'qualifier', group: g.id, rank: 0 }, { type: 'qualifier', group: g.id, rank: 1 }]);
  return groups.flatMap((group, i) => [
    { type: 'qualifier', group: group.id, rank: 0 },
    { type: 'qualifier', group: groups[(i + 1) % groups.length].id, rank: 1 }
  ]);
}
function shuffledGroups() {
  const ids = state.players.map(p => p.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const count = Math.max(1, Math.min(+state.settings.groupCount || 1, ids.length));
  const groups = Array.from({ length: count }, (_, i) => ({ id: `g${i}`, name: `Gruppe ${String.fromCharCode(65 + i)}`, players: [], rounds: [] }));
  ids.forEach((id, i) => groups[i % count].players.push(id));
  groups.forEach(g => g.rounds = roundRobin(g.players, state.settings.doubleRound)); assignConsoles(groups);
  return groups;
}
function generateKO(entries) {
  let size = 2; while (size < Math.max(2, entries.length)) size *= 2;
  const randomConsole = () => Math.random() < .5 ? 'PS5' : 'Xbox';
  const slots = [...entries.map(entry => typeof entry === 'string' ? { type: 'player', id: entry } : entry), ...Array(Math.max(0, size - entries.length)).fill(null)];
  const first = []; for (let i = 0; i < size; i += 2) first.push({ id: uid(), home: slots[i], away: slots[i + 1], homeScore: '', awayScore: '', console: randomConsole() });
  const rounds = [first]; let previous = first;
  while (previous.length > 1) { const next = []; for (let i = 0; i < previous.length; i += 2) next.push({ id: uid(), home: { type: 'winner', match: previous[i].id }, away: { type: 'winner', match: previous[i + 1].id }, homeScore: '', awayScore: '', console: randomConsole() }); rounds.push(next); previous = next; }
  const ko = { rounds, third: null };
  if (state.settings.thirdPlace && rounds.length > 1) { const semi = rounds[rounds.length - 2]; ko.third = { id: uid(), home: { type: 'loser', match: semi[0].id }, away: { type: 'loser', match: semi[1].id }, homeScore: '', awayScore: '', console: randomConsole() }; }
  return ko;
}
function assignKOConsoles() { if (state.ko) [...state.ko.rounds.flat(), state.ko.third].filter(Boolean).forEach(match => { if (!match.console) match.console = Math.random() < .5 ? 'PS5' : 'Xbox'; }); }
function createTournament() {
  if (state.players.length < 2) return toast('Bitte mindestens zwei Teams hinzufügen.');
  state.started = true; state.groups = []; state.swiss = { rounds: [] }; state.ko = null;
  if (state.settings.mode === 'table') state.groups = [{ id: 'table', name: 'Gesamttabelle', players: state.players.map(p => p.id), rounds: roundRobin(state.players.map(p => p.id), state.settings.doubleRound) }];
  if (state.settings.mode === 'groups') { state.groups = groupsForPlayers(); state.ko = generateKO(groupKOEntries()); }
  if (state.settings.mode === 'knockout') state.ko = generateKO(state.players.map(p => p.id));
  if (state.settings.mode === 'swiss') nextSwissRound();
  save(); render(); toast('Turnierplan wurde erstellt.');
}
function validScore(v) { return v !== '' && Number.isInteger(+v) && +v >= 0; }
function standing(ids, matches) {
  const rows = Object.fromEntries(ids.map(id => [id, { id, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  matches.forEach(m => { if (!rows[m.home] || !rows[m.away] || !validScore(m.homeScore) || !validScore(m.awayScore)) return; const h = rows[m.home], a = rows[m.away], hs = +m.homeScore, as = +m.awayScore; h.mp++; a.mp++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs; if (hs > as) { h.w++; h.pts += 3; a.l++; } else if (hs < as) { a.w++; a.pts += 3; h.l++; } else { h.d++; a.d++; h.pts++; a.pts++; } });
  return Object.values(rows).sort((a,b) => b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf || playerName(a.id).localeCompare(playerName(b.id)));
}
function groupMatches(g) { return g.rounds.flat(); }
function qualifiers() { return state.groups.flatMap(g => standing(g.players, groupMatches(g)).slice(0, Math.min(2, g.players.length)).map(r => r.id)); }
function findKOMatch(id) { if (!state.ko) return null; return [...state.ko.rounds.flat(), state.ko.third].find(m => m?.id === id); }
function resolveSlot(slot) { if (!slot) return null; if (slot.type === 'player') return slot.id || null; if (slot.type === 'qualifier') { const group = state.groups.find(g => g.id === slot.group); return group ? standing(group.players, groupMatches(group))[slot.rank]?.id || null : null; } const match = findKOMatch(slot.match); const outcome = result(match); return slot.type === 'winner' ? outcome.winner : outcome.loser; }
function result(m) { if (!m) return {}; const h = resolveSlot(m.home), a = resolveSlot(m.away); if (h && !a) return { winner: h }; if (!h && a) return { winner: a }; if (!h || !a || !validScore(m.homeScore) || !validScore(m.awayScore) || +m.homeScore === +m.awayScore) return {}; return +m.homeScore > +m.awayScore ? { winner: h, loser: a } : { winner: a, loser: h }; }
function swissMatches() { return state.swiss.rounds.flatMap(r => r.matches); }
function nextSwissRound() {
  const rounds = state.swiss.rounds; if (rounds.length >= +state.settings.swissRounds) return toast('Alle Schweizer Runden sind angelegt.');
  if (rounds.length && rounds.at(-1).matches.some(m => !validScore(m.homeScore) || !validScore(m.awayScore))) return toast('Bitte zuerst alle Ergebnisse der aktuellen Runde eintragen.');
  const rows = standing(state.players.map(p => p.id), swissMatches()); const used = new Set(swissMatches().map(m => [m.home, m.away].sort().join('|'))); const available = rows.map(r => r.id), matches = [];
  while (available.length > 1) { const home = available.shift(); let at = available.findIndex(away => !used.has([home, away].sort().join('|'))); if (at < 0) at = 0; const away = available.splice(at, 1)[0]; matches.push({ id: uid(), home, away, homeScore: '', awayScore: '' }); }
  if (available.length) matches.push({ id: uid(), home: available[0], away: null, homeScore: 3, awayScore: 0, bye: true });
  rounds.push({ name: `Runde ${rounds.length + 1}`, matches });
}

function playerList() { $('#playerCount').textContent = state.players.length; $('#playerList').innerHTML = state.players.length ? state.players.map(p => `<div class="player-row"><i class="player-dot"></i><span class="player-name">${esc(p.name)}</span><button class="small-button" data-action="rename" data-id="${p.id}" title="Umbenennen">✎</button><button class="small-button" data-action="delete" data-id="${p.id}" title="Löschen">×</button></div>`).join('') : '<p class="notice">Noch keine Teams angelegt.</p>'; }
function options() { const m = state.settings.mode; $('#modeOptions').innerHTML = (m === 'groups' ? `<label class="option-row">Anzahl Gruppen <select data-setting="groupCount">${[1,2,3,4,5,6,8].map(n => `<option ${n===+state.settings.groupCount?'selected':''}>${n}</option>`).join('')}</select></label><button class="shuffle-button" data-action="shuffle-groups">⤨ Gruppen zufällig auslosen</button>` : '') + (m !== 'knockout' ? `<label class="option-row">Hin- & Rückrunde <input type="checkbox" data-setting="doubleRound" ${state.settings.doubleRound?'checked':''}></label>` : '') + (m === 'groups' || m === 'knockout' ? `<label class="option-row">Spiel um Platz 3 <input type="checkbox" data-setting="thirdPlace" ${state.settings.thirdPlace?'checked':''}></label>` : '') + (m === 'swiss' ? `<label class="option-row">Runden <select data-setting="swissRounds">${[3,4,5,6,7].map(n => `<option ${n===+state.settings.swissRounds?'selected':''}>${n}</option>`).join('')}</select></label>` : ''); }
function standingsHTML(ids, matches, qualifierCount=0) { return `<div class="table-scroll" data-scroll="table-${ids.join('-').slice(0,15)}"><table class="standings"><thead><tr><th>#</th><th>Team</th><th>Sp</th><th>S</th><th>U</th><th>N</th><th>T</th><th>GT</th><th>TD</th><th>P</th></tr></thead><tbody>${standing(ids,matches).map((r,i) => `<tr class="${i<qualifierCount?'qualify':''}"><td class="rank">${i+1}</td><td>${esc(playerName(r.id))}</td><td>${r.mp}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gf-r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></div>`; }
function matchHTML(m, category='match') { const h = category === 'ko' ? resolveSlot(m.home) : m.home, a = category === 'ko' ? resolveSlot(m.away) : m.away; const outcome = category === 'ko' ? result(m) : {}; const name = id => id ? esc(playerName(id)) : 'offen'; const consoleBadge = m.console ? `<span class="console-badge" title="Gespielt auf ${m.console}">🎮 ${m.console}</span>` : ''; return `<div class="match ${m.bye?'bye':''}">${consoleBadge}<span class="team ${outcome.winner===h?'winner':''}">${name(h)}</span><input class="score" inputmode="numeric" maxlength="2" data-action="score" data-id="${m.id}" data-side="home" value="${m.homeScore}" ${!h||!a?'disabled':''}><span class="dash">:</span><input class="score" inputmode="numeric" maxlength="2" data-action="score" data-id="${m.id}" data-side="away" value="${m.awayScore}" ${!h||!a?'disabled':''}><span class="team away ${outcome.winner===a?'winner':''}">${name(a)}</span></div>`; }
function scheduleHTML(rounds, category='match', key='matches') { return `<div class="matches-scroll" data-scroll="${key}">${rounds.map((round,i) => `<div class="round-label">${round.name || `Spieltag ${i+1}`}</div>${round.matches ? round.matches.map(m=>matchHTML(m,category)).join('') : round.map(m=>matchHTML(m,category)).join('')}`).join('')}</div>`; }
function bracketHTML() { if (!state.ko) return ''; const roundName = count => ({ 1: 'Finale', 2: 'Halbfinale', 4: 'Viertelfinale', 8: 'Achtelfinale', 16: 'Sechzehntelfinale' }[count] || `${count}. Runde`); return `<div class="bracket-scroll" data-scroll="bracket"><div class="bracket">${state.ko.rounds.map(r => `<div class="bracket-round"><h3>${roundName(r.length)}</h3>${r.map(m=>`<div class="bracket-match">${matchHTML(m,'ko')}</div>`).join('')}${r.length === 1 && state.ko.third ? `<h3 class="third-place-title">Spiel um Platz 3</h3><div class="bracket-match">${matchHTML(state.ko.third,'ko')}</div>` : ''}</div>`).join('')}</div></div>`; }
function renderTournament() { const view = $('#tournamentView'), mode = state.settings.mode; $('#emptyState').hidden = state.started; view.hidden = !state.started; if (!state.started) return; let html = '';
  if (mode === 'table') html = `<div class="view-layout"><section class="card"><div class="card-head"><h2>Gesamttabelle</h2><small>Live-Berechnung</small></div>${standingsHTML(state.groups[0].players,groupMatches(state.groups[0]))}</section><section class="card"><div class="card-head"><h2>Spielplan</h2><small>${groupMatches(state.groups[0]).length} Spiele</small></div>${scheduleHTML(state.groups[0].rounds,'match','table-matches')}</section></div>`;
  if (mode === 'groups') html = `<div class="groups-grid">${state.groups.map(g=>`<section class="card group-card"><div class="card-head"><h2>${g.name}</h2><small>Top 2 qualifizieren sich</small></div>${standingsHTML(g.players,groupMatches(g),2)}<div class="card-head"><h2>Spiele</h2></div>${scheduleHTML(g.rounds,'match',`matches-${g.id}`)}</section>`).join('')}</div><section class="card section-gap"><div class="card-head"><h2>KO-Phase</h2><small>Ergebnisse bestimmen den weiteren Verlauf</small></div>${bracketHTML()}</section>`;
  if (mode === 'knockout') html = `<section class="card"><div class="card-head"><h2>KO-Baum</h2><small>Bei Gleichstand bitte ein Entscheidungsergebnis eintragen.</small></div>${bracketHTML()}</section>`;
  if (mode === 'swiss') html = `<div class="view-layout"><section class="card"><div class="card-head"><h2>Rangliste</h2><small>${state.swiss.rounds.length}/${state.settings.swissRounds} Runden</small></div>${standingsHTML(state.players.map(p=>p.id),swissMatches())}</section><section class="card"><div class="card-head"><h2>Paarungen</h2><button class="toolbar-button" data-action="next-swiss">Nächste Runde</button></div>${scheduleHTML(state.swiss.rounds,'match','swiss-matches')}</section></div>`;
  view.innerHTML = html;
}
function render() { const scroll = captureScroll(); if (state.settings.mode === 'groups') assignConsoles(state.groups); assignKOConsoles(); $('#tournamentName').value = state.settings.name; $('#modeSelect').value = state.settings.mode; $('#viewTitle').textContent = state.settings.name || (state.started ? 'Turnierübersicht' : 'Dein Turnier'); playerList(); options(); renderTournament(); restoreScroll(scroll); }
function scoreChange(input) { const value = input.value.trim(); if (value !== '' && (!/^\d{1,2}$/.test(value))) { input.value = ''; return; } const id = input.dataset.id; let m = state.groups.flatMap(groupMatches).find(x=>x.id===id) || swissMatches().find(x=>x.id===id) || findKOMatch(id); if (!m) return; m[input.dataset.side + 'Score'] = value; save(); render(); if (tabTarget) { const target = tabTarget; tabTarget = null; requestAnimationFrame(() => document.querySelector(`[data-action="score"][data-id="${target.id}"][data-side="${target.side}"]`)?.focus()); } }
function reset() { if (!confirm('Das gesamte Turnier inklusive Teams und Einstellungen wirklich zurücksetzen?')) return; state = defaults(); save(); render(); toast('Turnier vollständig zurückgesetzt.'); }
function onClick(e) { const btn = e.target.closest('[data-action]'); if (!btn) return; const action=btn.dataset.action;
  if (action === 'add-player') { e.preventDefault(); addPlayer(); }
  if (action === 'delete') { state.players = state.players.filter(p=>p.id!==btn.dataset.id); state.started=false; save(); render(); }
  if (action === 'rename') { const p=player(btn.dataset.id), name=prompt('Neuer Teamname:',p?.name); if(p && name?.trim()){p.name=name.trim();save();render();} }
  if (action === 'generate') createTournament(); if (action === 'reset') reset();
  if (action === 'shuffle-groups') { if (state.players.length < 2) return toast('Bitte mindestens zwei Teams hinzufügen.'); state.groups = shuffledGroups(); state.ko = generateKO(groupKOEntries()); state.started = true; save(); render(); toast('Gruppen wurden zufällig ausgelost.'); }
  if (action === 'next-swiss') { nextSwissRound(); save(); render(); }
}
function addPlayer() { const input=$('#playerInput'), name=input.value.trim(); if(!name) return toast('Bitte einen Teamnamen eingeben.'); if(state.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return toast('Dieses Team existiert bereits.'); state.players.push({id:uid(),name}); input.value=''; state.started=false; save(); render(); $('#playerInput').focus(); }
function onChange(e) { if(e.target.matches('[data-setting]')) { const key=e.target.dataset.setting; state.settings[key]=e.target.type==='checkbox'?e.target.checked:e.target.value; save(); render(); } if(e.target.matches('[data-action="score"]')) scoreChange(e.target); }
function onKeydown(e) { if (e.key !== 'Tab' || !e.target.matches('[data-action="score"]')) return; const fields = [...document.querySelectorAll('[data-action="score"]')].filter(field => !field.disabled); const index = fields.indexOf(e.target); const next = fields[index + (e.shiftKey ? -1 : 1)]; tabTarget = next ? { id: next.dataset.id, side: next.dataset.side } : null; }
function init() { state=load(); document.addEventListener('click',onClick); document.addEventListener('change',onChange); document.addEventListener('keydown',onKeydown); $('#addPlayerForm').addEventListener('submit',e=>{e.preventDefault();addPlayer();}); render(); }
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
