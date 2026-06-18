// KOL 选股追踪 —— 全部前端逻辑
// 优先读 data.json（真实数据）；读不到就用内嵌示意数据兜底（仅本地预览时）。

const FALLBACK = {
  updated_at: "示意数据（部署后自动替换为真实数据）",
  stocks: [
    {ticker:"MU", current_price:1043, mentions:4,
     history: demoHist(573,1043),
     kols:{ "qinbafrank":{mentions:2,first_date:"2025-08-12",change:82.0,
              tweets:[{date:"2025-08-12",text:"$MU DRAM 供需要紧张，业绩有支撑，重点关注。",likes:320,url:"#",mention_price:573}]},
            "Serenity":{mentions:2,first_date:"2025-09-01",change:44.2,
              tweets:[{date:"2025-09-01",text:"$MU HBM 卡位，存储链最强之一。",likes:540,url:"#",mention_price:724}]}}},
    {ticker:"AVGO", current_price:1680, mentions:2,
     history: demoHist(1200,1680),
     kols:{ "qinbafrank":{mentions:1,first_date:"2025-10-10",change:40.0,
              tweets:[{date:"2025-10-10",text:"$AVGO 算力+定制芯片双轮。",likes:210,url:"#",mention_price:1200}]},
            "Serenity":{mentions:1,first_date:"2025-11-02",change:25.0,
              tweets:[{date:"2025-11-02",text:"$AVGO 光互联受益。",likes:330,url:"#",mention_price:1344}]}}},
    {ticker:"INTC", current_price:42, mentions:1,
     history: demoHist(36,42),
     kols:{ "qinbafrank":{mentions:1,first_date:"2026-01-15",change:16.7,
              tweets:[{date:"2026-01-15",text:"$INTC 转型+增资，周期起点观察。",likes:150,url:"#",mention_price:36}]}}},
  ],
  kols: [
    {name:"qinbafrank",handle:"qinbafrank",tickers:{
      "MU":{ticker:"MU",current_price:1043,history:demoHist(573,1043),
        tweets:[{date:"2025-08-12",text:"$MU DRAM 供需紧张，业绩有支撑。",likes:320,url:"#",mention_price:573,change:82.0}]},
      "AVGO":{ticker:"AVGO",current_price:1680,history:demoHist(1200,1680),
        tweets:[{date:"2025-10-10",text:"$AVGO 算力+定制芯片双轮。",likes:210,url:"#",mention_price:1200,change:40.0}]},
    }},
    {name:"Serenity",handle:"aleabitoreddit",tickers:{
      "MU":{ticker:"MU",current_price:1043,history:demoHist(724,1043),
        tweets:[{date:"2025-09-01",text:"$MU HBM 卡位。",likes:540,url:"#",mention_price:724,change:44.2}]},
    }},
  ],
};

function demoHist(start, end){
  const out=[]; const days=120;
  for(let i=0;i<days;i++){
    const t=i/(days-1);
    const v=start+(end-start)*t + (Math.sin(i/6)*((end-start)*0.04));
    const d=new Date(2026,1,1); d.setDate(d.getDate()+i);
    out.push([d.toISOString().slice(0,10), Math.round(v*100)/100]);
  }
  return out;
}

let DATA=null, charts=[];

async function load(){
  DATA=FALLBACK; renderNav(); show("overview");
  document.getElementById("errline").textContent="（示意数据，部署到 GitHub Pages 后自动变真实数据）";
  try{
    const ctrl=new AbortController();
    const to=setTimeout(()=>ctrl.abort(),4000);
    const r=await fetch("data.json?_="+Date.now(),{signal:ctrl.signal});
    clearTimeout(to);
    if(r.ok){
      const j=await r.json();
      if(j&&j.stocks){ DATA=j; document.getElementById("errline").textContent="";
        renderNav(); show(currentView); }
    }
  }catch(e){ }
}

let currentView="overview";
function renderNav(){
  const nav=document.getElementById("nav");
  let html=`<button data-v="overview">标的总览</button>`;
  DATA.kols.forEach(k=>{ html+=`<button data-v="kol:${k.handle}">${k.name}</button>`; });
  nav.innerHTML=html;
  nav.querySelectorAll("button").forEach(b=>{
    b.onclick=()=>show(b.dataset.v);
  });
}

function show(v){
  currentView=v;
  document.getElementById("updated").textContent="更新于："+DATA.updated_at;
  document.querySelectorAll("#nav button").forEach(b=>{
    b.classList.toggle("active", b.dataset.v===v);
  });
  destroyCharts();
  if(v==="overview") renderOverview();
  else if(v.startsWith("kol:")) renderKol(v.slice(4));
}

function destroyCharts(){ charts.forEach(c=>{try{c.destroy()}catch(e){}}); charts=[]; }

function changeHtml(ch){
  if(ch==null) return "—";
  const cls=ch>=0?"up":"down"; const sign=ch>=0?"+":"";
  return `<span class="${cls}">${sign}${ch}%</span>`;
}

function renderOverview(){
  const stocks=[...DATA.stocks].sort((a,b)=>{
    const ka=Object.keys(a.kols).length, kb=Object.keys(b.kols).length;
    if(kb!==ka) return kb-ka;
    return b.mentions-a.mentions;
  });
  const maxM=Math.max(...stocks.map(s=>s.mentions),1);
  let rows="";
  stocks.forEach((s,i)=>{
    const nKol=Object.keys(s.kols).length;
    const consensus=nKol>=2?"consensus":"";
    const barW=Math.round(s.mentions/maxM*80)+10;
    let logic="";
    Object.entries(s.kols).forEach(([name,k])=>{
      const tw=k.tweets[0];
      logic+=`<div><b>${name}</b>：${changeHtml(k.change)} ${tw?escapeHtml(tw.text.slice(0,40)):""}</div>`;
    });
    let tweetsHtml="";
    Object.entries(s.kols).forEach(([name,k])=>{
      k.tweets.forEach(tw=>{
        tweetsHtml+=`<div class="tw"><b>${name}</b> · ${tw.date} · ♥${tw.likes}<br>${escapeHtml(tw.text)} <a href="${tw.url}" target="_blank">原文</a></div>`;
      });
    });
    rows+=`<tr class="${consensus}">
      <td><span class="tk">$${s.ticker}</span><br><span class="pill">${nKol}位看好</span></td>
      <td class="logic">${logic}</td>
      <td><span class="bar" style="width:${barW}px"></span> ${s.mentions}</td>
      <td><canvas class="spark" id="sp${i}"></canvas></td>
      <td>${s.current_price??"—"}</td>
      <td><span class="expand" data-row="${i}">展开原文 ▾</span>
          <div class="tweets" id="tw${i}">${tweetsHtml}</div></td>
    </tr>`;
  });
  document.getElementById("view").innerHTML=`
    <div class="card"><table>
      <thead><tr><th>标的</th><th>各家逻辑</th><th>热度</th><th>走势</th><th>现价</th><th>原文</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  stocks.forEach((s,i)=>drawSpark("sp"+i, s.history, s.kols));
  document.querySelectorAll(".expand").forEach(e=>{
    e.onclick=()=>{ const t=document.getElementById("tw"+e.dataset.row);
      t.classList.toggle("open"); e.textContent=t.classList.contains("open")?"收起 ▴":"展开原文 ▾"; };
  });
}

function renderKol(handle){
  const kol=DATA.kols.find(k=>k.handle===handle);
  if(!kol){ document.getElementById("view").innerHTML="<div class='card'>没有这个 KOL</div>"; return; }
  const tickers=Object.values(kol.tickers).sort((a,b)=>b.tweets.length-a.tweets.length);
  const maxT=Math.max(...tickers.map(t=>t.tweets.length),1);
  let pref="";
  tickers.forEach(t=>{
    const w=Math.round(t.tweets.length/maxT*200)+20;
    pref+=`<div class="kolbar"><span class="lab">$${t.ticker}</span>
      <span class="bar" style="width:${w}px"></span> ${t.tweets.length}次</div>`;
  });
  let body="";
  tickers.forEach((t,i)=>{
    let tw="";
    [...t.tweets].sort((a,b)=>a.date<b.date?-1:1).forEach(x=>{
      tw+=`<div class="tw">${x.date} · ♥${x.likes} · ${changeHtml(x.change)}<br>${escapeHtml(x.text)} <a href="${x.url}" target="_blank">原文</a></div>`;
    });
    body+=`<div class="card">
      <div class="tk">$${t.ticker} <span style="font-weight:400;color:var(--mut)">现价 ${t.current_price??"—"}</span></div>
      <canvas style="max-height:120px" id="kc${i}"></canvas>
      ${tw}</div>`;
  });
  document.getElementById("view").innerHTML=`
    <div class="card"><b>${kol.name} 偏好画像</b>（按提及次数）${pref}</div>${body}`;
  tickers.forEach((t,i)=>drawSpark("kc"+i, t.history, null, true));
}

function drawSpark(id, history, kols, big){
  const el=document.getElementById(id); if(!el||!history||!history.length) return;
  const labels=history.map(h=>h[0]);
  const data=history.map(h=>h[1]);
  const pts=[];
  if(kols){
    Object.values(kols).forEach(k=>k.tweets.forEach(tw=>{
      const idx=labels.findIndex(d=>d>=tw.date);
      if(idx>=0) pts.push(idx);
    }));
  }
  const pointR=labels.map((_,i)=>pts.includes(i)?(big?5:3):0);
  const c=new Chart(el,{type:"line",data:{labels,datasets:[{
      data,borderColor:"#0f766e",borderWidth:big?2:1.5,
      pointRadius:pointR,pointBackgroundColor:"#dc2626",
      tension:0.3,fill:false}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{enabled:!!big}},
      scales:{x:{display:!!big,ticks:{maxTicksLimit:5,font:{size:9}}},
              y:{display:!!big,ticks:{font:{size:9}}}},
      elements:{point:{hoverRadius:5}}}});
  charts.push(c);
}

function escapeHtml(s){return (s||"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));}

load();
