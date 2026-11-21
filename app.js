/* Portland Live: editable data in shows.json; browser-local drafts in localStorage. */
const VENUES=[
 {id:'mississippi-studios',name:'Mississippi Studios',address:'3939 N Mississippi Ave, Portland, OR 97227',website:'https://mississippistudios.com/',description:'An intimate live music venue on North Mississippi Avenue.'},
 {id:'revolution-hall',name:'Revolution Hall',address:'1300 SE Stark St, Portland, OR 97214',website:'https://www.revolutionhall.com/',description:'A performance hall in Portland’s former Washington High School.'},
 {id:'crystal-ballroom',name:'Crystal Ballroom',address:'1332 W Burnside St, Portland, OR 97209',website:'https://www.crystalballroompdx.com/',description:'A historic downtown Portland concert venue.'},
 {id:'polaris-hall',name:'Polaris Hall',address:'635 N Killingsworth Ct, Portland, OR 97217',website:'https://www.polarishall.com/',description:'An intimate concert venue in North Portland.'},
 {id:'wonder-ballroom',name:'Wonder Ballroom',address:'128 NE Russell St, Portland, OR 97212',website:'https://wonderballroom.com/',description:'A concert hall in Portland’s Eliot neighborhood.'}
];
const KEY='portland-live-edits-v1';let baseShows=[],shows=[],selectedWeek=startWeek(portlandToday()),selectedVenue='all',editingId=null;
const app=document.getElementById('app');
function esc(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
function safeURL(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}}
function portlandToday(instant = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant);
  const part = name => day.find(p => p.type === name).value;
  return parseDate(part('year') + '-' + part('month') + '-' + part('day'));
}
function save() {
  const published = new Map(baseShows.map(show => [show.id, show]));
  const current = new Set(shows.map(show => show.id));
  const edits = shows.filter(show => JSON.stringify(show) !== JSON.stringify(published.get(show.id)));
  const removed = baseShows.filter(show => !current.has(show.id)).map(show => show.id);
  localStorage.setItem(KEY, JSON.stringify({edits, removed}));
}
function restoreShows() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  const draft = JSON.parse(raw);
  // Older snapshots have no baseline. Preserve their records and include new listings.
  const legacy = Array.isArray(draft);
  const merged = new Map(baseShows.map(show => [show.id, show]));
  for (const id of legacy ? [] : draft.removed) merged.delete(id);
  for (const show of validShows(legacy ? draft : draft.edits)) merged.set(show.id, show);
  shows = [...merged.values()];
  if (legacy) save();
}
function startWeek(date){let d=new Date(date);d.setHours(12,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d}
function isoDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${dd}`}
function parseDate(s){return new Date(`${s}T12:00:00`)}
function weekEnd(d){let e=new Date(d);e.setDate(e.getDate()+6);return e}
function fmtWeek(d){const e=weekEnd(d),opt={month:'short',day:'numeric'};return `${d.toLocaleDateString('en-US',opt)} – ${e.toLocaleDateString('en-US',{...opt,year:'numeric'})}`}
function venueFor(id){return VENUES.find(v=>v.id===id)}
function validShows(records) {
  if (!Array.isArray(records)) throw Error('Expected an array of shows.');
  const ids = new Set();
  return records.map((record, index) => {
    const row = 'Show ' + (index + 1);
    if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || isoDate(parseDate(record.date)) !== record.date)
      throw Error(row + ' needs a valid YYYY-MM-DD date.');
    if (!venueFor(record.venueId)) throw Error(row + ' has an unknown venue.');
    const id = String(record.id || crypto.randomUUID());
    if (ids.has(id)) throw Error(row + ' repeats an event ID.');
    ids.add(id);
    return {...record, id, artist:String(record.artist || ''), time:String(record.time || ''), ticketUrl:String(record.ticketUrl || '')};
  });
}
function showCard(s){const v=venueFor(s.venueId),url=safeURL(s.ticketUrl);return `<article class="show"><div><h3>${esc(s.artist||'Artist to be announced')}</h3><p><span class="tag">${esc(v.name)}</span><span class="bullet">·</span>${esc(s.time||'Time TBA')}</p></div>${url?`<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Tickets ↗</a>`:'<span class="btn" aria-label="Ticket link to be announced">Tickets TBA</span>'}</article>`}
function renderSchedule(){const begin=isoDate(selectedWeek),end=isoDate(weekEnd(selectedWeek)),visible=shows.filter(s=>s.date>=begin&&s.date<=end&&(selectedVenue==='all'||s.venueId===selectedVenue)).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));const groups=Object.groupBy?Object.groupBy(visible,s=>s.date):visible.reduce((a,s)=>((a[s.date]??=[]).push(s),a),{});app.innerHTML=`<section id="artist-matches" aria-label="Spotify concert matches"></section><section class="hero"><div class="eyebrow">Portland, Oregon · Live music guide</div><h1>Have fun.<br><em>With Kenny.</em></h1><p>What’s playing this week at five of Portland’s favorite music rooms. Find a show, get tickets, and get out there.</p></section><div class="toolbar"><div class="weeknav"><button class="chip" id="prev" aria-label="Previous week">←</button><strong>${esc(fmtWeek(selectedWeek))}</strong><button class="chip" id="next" aria-label="Next week">→</button><button class="chip" id="today">This week</button></div><div class="filters"><label for="venueFilter">Venue</label><select id="venueFilter" aria-label="Filter by venue"><option value="all">All venues</option>${VENUES.map(v=>`<option value="${v.id}" ${selectedVenue===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></div></div><div class="sectionhead"><h2>On the calendar</h2><p>${visible.length} ${visible.length===1?'show':'shows'} listed</p></div>${visible.length?Object.entries(groups).map(([date,items])=>`<section class="day"><div class="day-date">${parseDate(date).toLocaleDateString('en-US',{weekday:'long',month:'short'})}<b>${parseDate(date).getDate()}</b></div><div class="shows">${items.map(showCard).join('')}</div></section>`).join(''):`<div class="empty"><h3>No shows listed for this selection</h3><p>The schedule may not be populated yet. Try another week or venue, or add verified events in the editor.</p></div>`}<div class="sectionhead"><h2>Our venues</h2><p>Five rooms. One city.</p></div>${venueCards()}`;document.getElementById('prev').onclick=()=>moveWeek(-7);document.getElementById('next').onclick=()=>moveWeek(7);document.getElementById('today').onclick=()=>{selectedWeek=startWeek(portlandToday());renderSchedule()};document.getElementById('venueFilter').onchange=e=>{selectedVenue=e.target.value;renderSchedule()};window.portlandSpotify?.render()}
function moveWeek(days){selectedWeek.setDate(selectedWeek.getDate()+days);renderSchedule()}
function venueCards(){return `<div class="venue-grid">${VENUES.map(v=>`<article class="venue"><div class="icon">✳</div><div><h3><a href="#/venue/${v.id}">${esc(v.name)} ↗</a></h3><p>${esc(v.address)}</p></div></article>`).join('')}</div>`}
function renderVenues(){app.innerHTML=`<section class="hero"><div class="eyebrow">The spaces</div><h1>FIVE<br><em>VENUES.</em></h1><p>Discover music rooms across Portland and explore their schedules.</p></section>${venueCards()}`}
function renderVenue(id){const v=venueFor(id);if(!v)return notFound();const entries=shows.filter(s=>s.venueId===id&&s.date>=isoDate(portlandToday())).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));const url=safeURL(v.website);app.innerHTML=`<a class="back" href="#/venues">← All venues</a><section class="detail"><div class="eyebrow">Portland · Music venue</div><h1>${esc(v.name)}</h1><p>${esc(v.description)}</p><p class="meta">${esc(v.address)}</p><div class="links">${url?`<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Venue website ↗</a>`:''}<a class="btn" href="#/">Browse schedule →</a></div></section><div class="sectionhead"><h2>Upcoming shows</h2><p>${entries.length} listed</p></div>${entries.length?`<div class="shows">${entries.map(s=>`<div><p class="minor">${esc(parseDate(s.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}))}</p>${showCard(s)}</div>`).join('')}</div>`:'<div class="empty">No upcoming shows have been entered yet.</div>'}`}
function adminFormData(s={}){return `<div class="form-grid"><label class="full">Artist / event name<input class="field" name="artist" value="${esc(s.artist||'')}" placeholder="Artist to be announced"></label><label>Date (required)<input required class="field" type="date" name="date" value="${esc(s.date||'')}"></label><label>Venue (required)<select required class="field" name="venueId">${VENUES.map(v=>`<option value="${v.id}" ${s.venueId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label><label>Start time<input class="field" type="time" name="time" value="${esc(s.time||'')}"></label><label>Ticket link<input class="field" type="url" name="ticketUrl" value="${esc(s.ticketUrl||'')}" placeholder="https://..."></label></div>`}
function renderAdmin(){const editing=shows.find(s=>s.id===editingId);app.innerHTML=`<div class="admin-title"><div><div class="eyebrow">Maintain the calendar</div><h1>SHOW EDITOR</h1></div><a class="btn" href="#/">View schedule ↗</a></div><div class="notice"><strong>Local editor / publishing workflow:</strong> Changes made here are stored only in this browser. To publish for all visitors, export the JSON and replace the repository’s <code>shows.json</code>, then deploy. This editor is not authenticated; do not use it as a public server-side admin.</div><div class="admin-grid"><section class="panel"><h2>${editing?'Edit show':'Add a show'}</h2><form id="showForm">${adminFormData(editing)}<div class="actions"><button class="btn btn-primary" type="submit">${editing?'Save changes':'Add show'}</button>${editing?'<button class="btn" type="button" id="cancel">Cancel</button>':''}</div></form></section><section class="panel"><h2>Show records (${shows.length})</h2><div class="small-list">${shows.length?shows.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(s=>`<div class="small-entry"><div><strong>${esc(s.artist||'Artist TBA')}</strong><small>${esc(s.date)} · ${esc(venueFor(s.venueId).name)}</small></div><div><button class="chip" data-edit="${esc(s.id)}">Edit</button> <button class="chip" data-remove="${esc(s.id)}">×</button></div></div>`).join(''):'<div class="minor">No events have been added yet.</div>'}</div><div class="actions"><button class="btn" id="export" type="button">Export JSON ↓</button><label class="btn" style="cursor:pointer">Import JSON<input type="file" id="import" accept="application/json,.json" hidden></label><button class="btn" id="reset" type="button">Reset to published data</button></div></section></div>`;document.getElementById('showForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),obj={id:editingId||crypto.randomUUID(),artist:String(f.get('artist')).trim(),date:String(f.get('date')),venueId:String(f.get('venueId')),time:String(f.get('time')),ticketUrl:String(f.get('ticketUrl')).trim()};if(!/^\d{4}-\d{2}-\d{2}$/.test(obj.date))return alert('Enter a valid date.');if(obj.ticketUrl&&!safeURL(obj.ticketUrl))return alert('Ticket link must start with http:// or https://');if(editingId){shows=shows.map(s=>s.id===editingId?obj:s)}else{shows.push(obj)}editingId=null;save();renderAdmin()};if(editing)document.getElementById('cancel').onclick=()=>{editingId=null;renderAdmin()};document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editingId=b.dataset.edit;renderAdmin()});document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('Delete this show?')){shows=shows.filter(s=>s.id!==b.dataset.remove);save();renderAdmin()}});document.getElementById('export').onclick=()=>{const blob=new Blob([JSON.stringify(shows,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='shows.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};document.getElementById('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());const imported=validShows(parsed);if(confirm('Replace locally edited shows with imported records?')){shows=imported;save();editingId=null;renderAdmin()}}catch(err){alert('Could not import: '+err.message)}};document.getElementById('reset').onclick=()=>{if(confirm('Discard local edits and return to repository shows.json?')){localStorage.removeItem(KEY);shows=structuredClone(baseShows);editingId=null;renderAdmin()}}}
function notFound(){app.innerHTML='<section class="hero"><h1>NOT FOUND.</h1><p>That page isn’t here.</p><a class="btn btn-primary" href="#/">Back to schedule</a></section>'}
let loading = true, feedFailed = false;
function router(){
  if (loading) {app.textContent='Loading concert calendar…';return}
  if (feedFailed && location.hash !== '#/venues') {
    app.innerHTML='<section class="empty" role="alert"><h2>Couldn’t load the concert calendar</h2><p>Please try again to see the latest listings.</p><button class="btn" id="retry">Try again</button></section>';
    document.getElementById('retry').onclick=init;
    return;
  }
  const route=location.hash.slice(1)||'/';if(route==='/')renderSchedule();else if(route==='/venues')renderVenues();else if(route.startsWith('/venue/'))renderVenue(route.slice(7));else if(route==='/admin')renderAdmin();else notFound();window.scrollTo({top:0,behavior:'instant'})}
async function init() {
  loading = true;
  router();
  try {
    const response = await fetch('shows.json', {cache:'no-store'});
    if (!response.ok) throw Error('Calendar request failed: ' + response.status);
    baseShows = validShows(await response.json());
    feedFailed = false;
    shows = structuredClone(baseShows);
    try { restoreShows(); } catch (error) { console.warn('Local editor data unavailable', error); }
  } catch (error) {
    feedFailed = true;
    console.warn('Could not load published shows', error);
  }
  loading = false;
  router();
}
window.addEventListener('hashchange', router);
init();
