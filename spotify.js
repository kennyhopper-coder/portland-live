/* Browser-local Spotify authorization and concert discovery. */
(() => {
  const key = 'pdx.spotify.v1';
  const pendingKey = key + '.authorization';
  const redirect = location.origin + location.pathname;
  const params = new URLSearchParams(location.search);
  let account = {};
  let notice = '', busy = false, setup = false;
  try { account = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  const save = () => localStorage.setItem(key, JSON.stringify(account));
  const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
  const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();

  function matchTitle(title, followed) {
    if (/\b(tribute to|tribute night|rescheduled to|cancelled|canceled)\b/i.test(title)) return false;
    const bill = title.replace(/^(sold out|all ages)\s*:\s*/i,'').trim();
    const parts = [bill, ...bill.split(/\s+(?:with|w\/|feat\.?|featuring|presents|[-–—+&])\s+|\s*[:,;|]\s*/i)];
    return parts.some(part => {
      const name = normalize(part);
      if (followed.has(name)) return true;
      // Venue listings often append a tour name directly after the headliner.
      return /\btour\b/i.test(part) && [...followed].some(artist => name.startsWith(artist+' ') && !/\b(tribute|cover|the music of)\b/i.test(part));
    });
  }
  function render() {
    const panel = document.getElementById('artist-matches');
    if (!panel) return;
    panel.className = 'panel';
    panel.style.marginTop = '1.25rem';
    const linked = Array.isArray(account.artists);
    const names = new Set((account.artists || []).map(normalize).filter(Boolean));
    const today = portlandToday(), end = new Date(today);
    end.setDate(end.getDate()+89);
    const first = isoDate(today), last = isoDate(end);
    const matches = linked ? shows.filter(s => s.date>=first && s.date<=last && matchTitle(s.artist,names))
      .sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)) : [];
    const summary = linked
      ? (matches.length ? 'Next 90 days · Portland' : 'No matches in the next 90 days at the five venues on this calendar.')
      : 'See when artists you follow on Spotify are playing in Portland in the next 90 days.';
    panel.innerHTML = '<div class="eyebrow">Spotify · Portland</div><h2>Your artists in town</h2><p>'+summary+'</p>'+
      matches.map(s=>'<div><p class="minor">'+esc(parseDate(s.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}))+'</p>'+showCard(s)+'</div>').join('')+
      (notice ? '<p role="status">'+esc(notice)+'</p>' : '')+
      '<div class="actions">'+(linked ? '<button class="chip" id="sp-sync">Refresh artists</button><button class="chip" id="sp-off">Disconnect</button>' : '<button class="btn btn-primary" id="sp-link">Connect Spotify</button>')+'</div>'+
      (setup ? '<form id="sp-config"><label>Spotify app Client ID<input class="field" required name="client" pattern="[a-fA-F0-9]{32}" autocomplete="off"></label><p>Register <code>'+esc(redirect)+'</code> as the redirect URI in your <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Spotify developer dashboard</a>.</p><button class="btn">Continue to Spotify</button></form>' : '');
    const bind=(id,fn)=>{const b=document.getElementById(id);if(b){b.disabled=busy;b.onclick=fn;}};
    bind('sp-link',()=>{if(account.client) authorize(account.client);else {setup=true;render();}});
    bind('sp-sync',()=>account.refresh ? sync() : authorize(account.client));
    bind('sp-off',()=>{account={};localStorage.removeItem(key);sessionStorage.removeItem(pendingKey);notice='';setup=false;render();});
    const form=document.getElementById('sp-config');
    if(form) form.onsubmit=e=>{e.preventDefault();authorize(form.elements.client.value.trim());};
  }
  async function authorize(client) {
    try {
      const verifier=random(), state=random();
      const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
      sessionStorage.setItem(pendingKey,JSON.stringify({client,verifier,state}));
      location.assign('https://accounts.spotify.com/authorize?'+new URLSearchParams({
        client_id:client,response_type:'code',scope:'user-follow-read',redirect_uri:redirect,state,
        code_challenge:challenge,code_challenge_method:'S256',show_dialog:'true'
      }));
    } catch { notice='Could not start Spotify sign-in. Allow browser storage and try again.';render(); }
  }
  async function getToken(body) {
    const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',body:new URLSearchParams(body)});
    if(!res.ok) throw Error(res.status===400 ? 'Spotify authorization expired. Reconnect Spotify.' : 'Spotify sign-in is unavailable. Try again later.');
    return res.json();
  }
  async function sync(pending,code) {
    if(busy)return;
    busy=true;notice='Checking Spotify…';render();
    try {
      const client=pending?.client || account.client;
      const token=await getToken(pending ? {client_id:client,grant_type:'authorization_code',code,code_verifier:pending.verifier,redirect_uri:redirect}
        : {client_id:client,grant_type:'refresh_token',refresh_token:account.refresh});
      account.client=client;account.refresh=token.refresh_token || account.refresh;save();
      const artists=[];
      let url='https://api.spotify.com/v1/me/following?type=artist&limit=50';
      while(url) {
        const page=new URL(url);
        if(page.origin!=='https://api.spotify.com'||page.pathname!=='/v1/me/following')throw Error('Unexpected Spotify response.');
        const res=await fetch(page,{headers:{Authorization:'Bearer '+token.access_token}});
        if(!res.ok)throw Error(res.status===429 ? 'Spotify is busy. Try refreshing later.' : 'Spotify could not read your follows. Check that this account can use your Spotify app.');
        const {artists:batch}=await res.json();
        artists.push(...batch.items.map(item=>item.name));url=batch.next;
      }
      account.artists=artists;account.updated=Date.now();save();notice='';setup=false;
    } catch(e) {notice=e.message;if(notice.includes('expired')){delete account.refresh;save();}}
    finally {busy=false;render();}
  }
  window.portlandSpotify={render};
  if(params.has('state') && (params.has('code')||params.has('error'))) {
    const pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
    sessionStorage.removeItem(pendingKey);
    history.replaceState(null,'',redirect+'#/');
    if(pending && pending.state===params.get('state') && params.has('code')) sync(pending,params.get('code'));
    else {notice='Spotify connection was canceled or expired. Connect again.';render();}
  } else if(account.refresh && (!account.updated || Date.now()-account.updated>86400000)) sync();
  else render();
})();
