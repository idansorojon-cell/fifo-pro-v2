/* Included ONLY in the generated isolated review build, never production. */
const Demo = (() => {
  const key = 'fifo-workspace-review-v1';
  const date = days => { const d = new Date(); d.setDate(d.getDate()-days); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };
  function seed() {
    const symbols = ['NVDA','AAPL','MSFT','AMD','META','GOOGL'];
    const trades = Array.from({length:36}, (_,i) => {
      const buy = 90 + i*3, qty = 20 + i%4*10, delta = [-8,14,7,-5,18,9][i%6];
      const sell_date = date((35-i)*5), buy_date = date((35-i)*5+3);
      const gross = qty*delta;
      return {id:i+1,symbol:symbols[i%6],buy_date,sell_date,qty,buy_price:buy,sell_price:buy+delta,cost:qty*buy,gross,tax:gross*.25,net:gross*.75,pct:delta/buy*100,hold_days:3,month:sell_date.split('/').reverse().slice(0,2).join('-'),lesson:i%4?'לחכות לאישור לפני הכניסה':'',entry_reason:i%4?'פריצה לפי תוכנית':'',exit_reason:i%4?'הגעה ליעד':'',followed_plan:'כן',respected_stop:'כן',notes:''};
    });
    return {trades,positions:[
      {id:101,symbol:'NVDA',qty:80,avg_price:118,target:145,stop_loss:112,notes:'מעקב אחר פריצה עם מחזור — נתוני הדגמה',added_date:date(12)},
      {id:102,symbol:'AMD',qty:60,avg_price:158,target:178,stop_loss:'',notes:'תכנון הסטופ טרם הושלם — נתוני הדגמה',added_date:date(8)},
      {id:103,symbol:'MSFT',qty:25,avg_price:420,target:468,stop_loss:405,notes:'תוכנית לטווח בינוני — נתוני הדגמה',added_date:date(20)}
    ],watchlist:[{symbol:'AAPL',note:'מעקב אחר תמיכה',added:date(4)},{symbol:'META',note:'בדיקת תוכנית לפני כניסה',added:date(2)}],goal:2500,settings:{portfolioSize:50000,monthlyGoal:2500}};
  }
  let state; try { state = JSON.parse(localStorage.getItem(key)) || seed(); } catch { state=seed(); }
  const clone = value => JSON.parse(JSON.stringify(value));
  const save = () => { localStorage.setItem(key,JSON.stringify(state)); return {ok:true}; };
  const blocked = async () => ({ok:false,error:'פעולה זו אינה זמינה בסביבת הבדיקה. לא נשלח דבר למערכת האמיתית.'});
  function prices(symbols) { const fixed={NVDA:132.6,AMD:149.3,MSFT:438.5,AAPL:224.8,META:526.2}; return Object.fromEntries(symbols.filter(s=>fixed[s]).map(s=>[s,{price:fixed[s],ok:true,source:'demo',changePctValid:false,updated:'הדגמה'}])); }
  const api = {
    isConfigured:()=>true,loadAll:async()=>clone(state),getSettings:async()=>({ok:true,settings:clone(state.settings)}),
    saveSettings:async settings=>{Object.assign(state.settings,settings);return save();},setGoal:async goal=>{state.goal=goal;return save();},
    fetchPrices:async symbols=>prices(symbols),fetchPrice:async symbol=>prices([symbol])[symbol]||null,
    upsertPositionMeta:async p=>{const target=state.positions.find(x=>x.symbol===p.symbol);if(!target)return {ok:false,error:'פוזיציה לא נמצאה'}; ['target','stop_loss','notes'].forEach(k=>target[k]=p[k]);return save();},
    upsertTradeMeta:async t=>{const target=state.trades.find(x=>x.id===t.id);if(!target)return {ok:false};Object.assign(target,t);return save();},
    getWatchlist:async()=>clone(state.watchlist),addWatchlistItem:async(symbol,note)=>{if(!state.watchlist.some(w=>w.symbol===symbol))state.watchlist.push({symbol,note,added:date(0)});return save();},removeWatchlistItem:async symbol=>{state.watchlist=state.watchlist.filter(w=>w.symbol!==symbol);return save();},
    getIndicators:async()=>{throw new Error('נתוני שוק אינם זמינים בהדגמה');},getNews:async()=>null,
    askClaude:blocked,appendOperation:blocked,addTradeOperation:blocked,seedAll:blocked,
    setStatus:(message,type)=>{const el=document.getElementById('sync-bar');el.textContent=message;el.className='sync-bar '+(type||'info');el.style.display='block';setTimeout(()=>{el.style.display='none';},4500);},
    showSpinner:()=>{},connectWS:()=>{},disconnectWS:()=>{},reportPriceSuccess:()=>{},reportPriceError:()=>{},setButtonBusy:(button,busy)=>{if(button)button.disabled=busy;},
    changePassword:blocked,revokeAllSessions:blocked,setViewerCredentials:blocked,setViewerEnabled:blocked,setViewerPositionPermission:blocked,setOwnerDisplayName:blocked,getViewerStatus:blocked,
    addTrade:blocked,updateTrade:blocked,deleteTrade:blocked,addPosition:blocked,updatePosition:blocked,deletePosition:blocked,diagnose:blocked
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const banner=document.createElement('div');banner.className='demo-banner';
    banner.innerHTML='<strong>סביבת בדיקה נפרדת</strong><span>נתונים ומחירים פיקטיביים · ללא חיבור לברוקר, לנתונים או ל-AI אמיתי</span><button type="button">איפוס הדגמה</button>';
    banner.querySelector('button').addEventListener('click',()=>{localStorage.removeItem(key);location.reload();});document.body.prepend(banner);
    document.body.classList.add('demo-review');
    document.querySelectorAll('#last-updated').forEach(el=>el.textContent='נתוני הדגמה');
    document.querySelectorAll('#seed-banner').forEach(el=>el.remove());
  });
  return {api};
})();
const API = Demo.api;
const Auth = {
  init:async()=>{document.getElementById('login-overlay').style.display='none';document.getElementById('app').style.display='flex';return true;},
  isLoggedIn:()=>true,isViewer:()=>false,isOwner:()=>true,getDisplayName:()=> 'עידן',getRole:()=> 'owner',getToken:()=>'',saveLastVisit:()=>{},getLastVisit:()=>null,
  logout:()=>API.setStatus('זו סביבת בדיקה נפרדת, ללא חשבון מחובר.','info')
};
