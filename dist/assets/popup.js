import"./modulepreload-polyfill.js";import{p as x,a as $}from"./dashParser.js";import{s as T,r as k}from"./security.js";const y=document.getElementById("no-streams-view"),w=document.getElementById("stream-list-container"),g=document.getElementById("clear-all-btn");let r=null,l=[];document.addEventListener("DOMContentLoaded",async()=>{const e=await chrome.tabs.query({active:!0,currentWindow:!0});e[0]&&e[0].id&&(r=e[0].id,await m()),g.addEventListener("click",E)});async function m(){if(r===null)return;const e=`tab_${r}`;if(l=(await chrome.storage.session.get(e))[e]||[],l.length===0)y.style.display="flex",w.style.display="none",g.style.display="none";else{y.style.display="none",w.style.display="flex",g.style.display="block",w.innerHTML="";for(const a of l){const s=await L(a);w.appendChild(s)}}}async function L(e){const n=document.createElement("div");n.className="stream-card";const a=T(e.pageTitle||"Video Stream"),s=k(e.url);n.innerHTML=`
    <div class="stream-header">
      <div class="stream-meta">
        <span class="badge badge-${e.format}">${e.format}</span>
        <span class="stream-title" title="${a}">${a}</span>
      </div>
      <button class="btn-delete" title="Remove stream">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="url-display" title="${e.url}">${s}</div>
    <div class="variants-section">
      <div class="variants-title">Available Options</div>
      <div class="variants-list" id="variants-list-${e.id}">
        <div style="font-size: 11px; color: var(--text-secondary);">Loading variants...</div>
      </div>
    </div>
  `,n.querySelector(".btn-delete").addEventListener("click",async d=>{d.stopPropagation(),await M(e.id)});const o=n.querySelector(`#variants-list-${e.id}`);try{if(e.format==="hls"){const d=await b(e.url,e.headers),i=x(d,e.url);if(i.isEncrypted){o.innerHTML=`
          <div class="unsupported-msg">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Encrypted stream (DRM) is not supported.
          </div>
        `;const t=n.querySelector(`.badge-${e.format}`);t.className="badge badge-unsupported",t.innerText="DRM"}else if(i.isLive)o.innerHTML=`
          <div class="unsupported-msg" style="color: var(--warning);">
            Live stream downloading is not supported in v1.
          </div>
        `;else if(i.isMaster)o.innerHTML="",i.variants.forEach(t=>{const c=t.resolution||"Auto",p=t.frameRate?`${t.frameRate}fps`:"",v=t.bandwidth?`${Math.round(t.bandwidth/1e3)} kbps`:"",u=document.createElement("div");u.className="variant-item",u.innerHTML=`
            <div class="variant-info">
              <span class="variant-resolution">${c}</span>
              ${p?`<span class="variant-fps">${p}</span>`:""}
              <div class="variant-bandwidth">${v} - ${t.codecs||"unknown codec"}</div>
            </div>
            <button class="btn-download">Download</button>
          `,u.querySelector(".btn-download").addEventListener("click",()=>h(e,t.url,c)),o.appendChild(u)});else{o.innerHTML="";const t=document.createElement("div");t.className="variant-item",t.innerHTML=`
          <div class="variant-info">
            <span class="variant-resolution">Default Quality</span>
            <div class="variant-bandwidth">${i.segments.length} segments detected</div>
          </div>
          <button class="btn-download">Download</button>
        `,t.querySelector(".btn-download").addEventListener("click",()=>h(e,e.url,"Default")),o.appendChild(t)}}else if(e.format==="dash"){const d=await b(e.url,e.headers),i=$(d,e.url);if(i.isEncrypted){o.innerHTML=`
          <div class="unsupported-msg">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Encrypted DASH (DRM) is not supported.
          </div>
        `;const t=n.querySelector(`.badge-${e.format}`);t.className="badge badge-unsupported",t.innerText="DRM"}else o.innerHTML="",i.representations.forEach(t=>{const c=t.width&&t.height?`${t.width}x${t.height}`:t.id,p=t.bandwidth?`${Math.round(t.bandwidth/1e3)} kbps`:"",v=document.createElement("div");v.className="variant-item",v.innerHTML=`
            <div class="variant-info">
              <span class="variant-resolution">${c} (DASH)</span>
              <div class="variant-bandwidth">${p} - ${t.mimeType||"unknown"}</div>
            </div>
            <button class="btn-download">Download</button>
          `,v.querySelector(".btn-download").addEventListener("click",()=>h(e,t.url,c)),o.appendChild(v)})}else{o.innerHTML="";const d=e.size?`${(e.size/(1024*1024)).toFixed(2)} MB`:"Unknown Size",i=document.createElement("div");i.className="variant-item",i.innerHTML=`
        <div class="variant-info">
          <span class="variant-resolution">Source File</span>
          <div class="variant-bandwidth">${d} - ${e.mimeType||"direct stream"}</div>
        </div>
        <button class="btn-download">Download</button>
      `,i.querySelector(".btn-download").addEventListener("click",()=>h(e,e.url,"Source")),o.appendChild(i)}}catch{o.innerHTML='<div style="font-size: 11px; color: var(--error);">Error loading qualities details.</div>'}return n}async function b(e,n){const a={};n["User-Agent"]&&(a["User-Agent"]=n["User-Agent"]),n.Referer&&(a.Referer=n.Referer),n.Origin&&(a.Origin=n.Origin);const s=await fetch(e,{method:"GET",headers:a});if(!s.ok)throw new Error("Network error");return await s.text()}async function h(e,n,a){const s=`task_${Date.now()}`;await chrome.storage.local.set({[s]:{id:s,manifestUrl:n,originalUrl:e.url,pageUrl:e.pageUrl,pageTitle:e.pageTitle,format:e.format,resolution:a,headers:e.headers}});const f=chrome.runtime.getURL(`extension/src/downloader/index.html?taskId=${s}`);chrome.tabs.create({url:f})}async function M(e){if(r===null)return;const n=`tab_${r}`;l=l.filter(s=>s.id!==e),await chrome.storage.session.set({[n]:l}),await m();const a=l.length>0?l.length.toString():"";chrome.action.setBadgeText({text:a,tabId:r})}async function E(){if(r===null)return;const e=`tab_${r}`;await chrome.storage.session.remove(e),chrome.action.setBadgeText({text:"",tabId:r}),await m()}
