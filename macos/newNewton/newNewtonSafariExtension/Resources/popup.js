import{fetchFullAttendanceData as rt}from"./portal-api.js";import{summarize as Le,DEFAULT_TARGET as lt}from"./math.js";import{fetchUnsubmittedQuizzes as ct,extractShortCourseName as dt,sliderPosToSeconds as De,secondsToSliderPos as J}from"./quiz-client.js";import{MESS_SPEC as ut,isSecondaryDish as mt}from"./generated-specs.js";const yt=ut.menuRemoteUrl||"https://ru-print.vercel.app",be=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],ht=[{key:"breakfast",label:"Breakfast",time:"07:30 - 09:30 AM",startMin:450,endMin:570,iconClass:"meal-icon-breakfast",svgIcon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>`},{key:"lunch",label:"Lunch",time:"12:00 - 02:30 PM",startMin:720,endMin:870,iconClass:"meal-icon-lunch",svgIcon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
    </svg>`},{key:"snacks",label:"Snacks",time:"04:30 - 06:30 PM",startMin:990,endMin:1110,iconClass:"meal-icon-snacks",svgIcon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
      <line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>
    </svg>`},{key:"dinner",label:"Dinner",time:"07:30 - 09:30 PM",startMin:1170,endMin:1290,iconClass:"meal-icon-dinner",svgIcon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9ZM7 21h10M19.5 12 22 6"/>
      <path d="M16 3c0 1.5-1.5 2-1.5 3M11 3c0 1.5-1.5 2-1.5 3M6 3c0 1.5-1.5 2-1.5 3"/>
    </svg>`}],Be={Monday:{breakfast:["Watermelon","Dalia","Cornflakes","Onion Uttapam","Sambar & Peanut Chutney","Hot Milk","Cold Milk (D)","Tea (D)","Coffee Powder","Bread/Butter/Jam"],lunch:["Sweet Lassi","Green Salad","Rajma Masala","Dhania Aloo","Veg Poriyal","Jeera Rice","Chapati","Gulab Jamun"],snacks:["Chana Chaat","Chutney & Spice Pwd","Cold Coffee","Tea (D)"],dinner:["Cucumber Salad","Chana Dal Punjabi Style","Lauki Kofta Curry","Rasam","Rice","Chapati"]},Tuesday:{breakfast:["Banana","Masala Oats","Muesli","Kulcha","Matar","Hot Milk (D)","Cold Milk (D)","Tea (D)","Coffee Powder","Bread/Butter/Jam"],lunch:["Rooh Afza","Cucumber Salad","Soya Chaap Masala","Punjabi Mix Dal","Onion Garlic Rasam","Plain Rice","Chapati"],snacks:["Veg Pakori","Ketchup","Hot Milk (D)","Tea (D)","Coffee Powder"],dinner:["Green Salad","Achari Aloo","Dal Makhni","Tomato Sambar","Jeera Rice","Chapati","Ice Cream"]},Wednesday:{breakfast:["Watermelon","Sandwich","Chocos","Vermicelli Upma","Tomato Garlic Chutney","Hot Milk (D)","Cold Milk (D)","Tea (D)","Coffee Powder","Bread/Butter/Jam"],lunch:["Butter Milk","Pickle Onion","Paneer Matar","Arhar Dal Fry","Ghee Rice","Chapati","Rice Kheer"],snacks:["Wada Pav","Chutney","Cold Coffee","Tea (D)"],dinner:["Cucumber Carrot Salad","Cabbage Tamatar Matar","Chole Masala","Pacchadi","Plain Rice","Chapati"]},Thursday:{breakfast:["Banana","Boiled Chana Sprout","Cornflakes","Veg Paratha","Curd & Pickle","Hot Milk (D)","Cold Milk (D)","Tea (D)","Coffee Powder","Bread/Butter/Jam"],lunch:["Boondi Raita","Cucumber Salad","Veg Biryani","Mirch Ka Salan","Karam Chutney","Dhaba Dal","Chapati"],snacks:["French Fries","Hot Milk (D)","Tea (D)","Coffee Powder"],dinner:["Sprout Salad","Chili Garlic Tofu","Rajma Punjabi","Cabbage Foogath","Peas Rice","Chapati","Mango Mousse"]},Friday:{breakfast:["Watermelon","Chocos","Maccaroni","Pav","Missal","Hot Milk (D)","Cold Milk (D)","Tea (D)","Coffee Powder","Bread/Butter/Jam"],lunch:["Mango Crush","Green Salad","Kadhi Pakori","Achara Sabzi","Sambar","Plain Rice","Chapati","Pineapple Halwa"],snacks:["Samosa","Ketchup","Cold Coffee","Tea (D)","Coffee Powder"],dinner:["Cucumber Salad","Paneer Lababdar","Panchratna Dal","Jeera Rice","Chapati"]},Saturday:{breakfast:["Banana","Muesli","Masala Oats","Aloo Pyaaz Paratha","Curd, Green Chutney & Pickle","Hot Milk (D)","Cold Milk (D)","Tea (D)","Coffee Powder","Bread/Butter/Jam"],lunch:["Chaas","Cucumber Carrot Salad","Bhindi Aloo Masaledar","Dal Makhni","Pappu Charu","Plain Rice","Chapati","Ice Cream"],snacks:["Pizza","Ketchup","Hot Milk (D)","Tea (D)","Coffee Powder"],dinner:["Moong Sprout Salad","Mix Veg Kolhapuri","Bukhara Dal","Suran Curry","Ghee Rice","Chapati","Ice Cream"]},Sunday:{breakfast:["Watermelon","Cornflakes","Pasta in Red Sauce","Moong Chila","Chatpati Chatni","Cold/Hot Milk (D)","Tea (D)","Coffee Powder","Bread/Butter/Jam"],lunch:["Butter Milk","Laccha Onion","Chole","Khatta Meetha Sitaphal","Brinjal Curry","Plain Rice","Bhature","Sweet Boondi"],snacks:["Jhal Muri","Cold Coffee","Tea (D)","Coffee Powder"],dinner:["Green Salad","Capsicum Corn Masala","Bhaba Dal","Tamata Pacchadi","Steamed Rice","Chapati"]}};function Pe(e){return mt(e)}const Ie=document.querySelectorAll(".nav-tab"),pt=document.querySelectorAll(".tab-pane"),X=document.getElementById("statusMessage"),qe=document.querySelectorAll(".segment-btn"),Y=document.getElementById("telemetryToggle"),Z=document.getElementById("telemetryStatusTag"),Ne=document.querySelectorAll(".privacy-item"),He=document.getElementById("messDayHeading"),Re=document.getElementById("messDateBadge"),G=document.getElementById("messWeekStatus"),ve=document.getElementById("btnGoToToday"),we=document.getElementById("btnRefreshMenu"),Ue=document.querySelectorAll(".day-btn"),Se=document.getElementById("messMealsContainer"),Ce=document.getElementById("attOverallBadge"),H=document.getElementById("attSyncStatus"),ee=document.getElementById("btnSyncAttendance"),ke=document.querySelectorAll(".att-target-pill"),R=document.getElementById("attendanceContainer"),U=document.getElementById("mysteryHeroCount"),j=document.getElementById("mysteryBadge"),_=document.getElementById("mysterySyncStatus"),te=document.getElementById("btnRefreshMystery"),b=document.getElementById("btnSubmitAllMystery"),x=document.getElementById("mysteryContainer"),Me=document.getElementById("toggleLazySubmit"),O=document.getElementById("lazyStatusPill"),se=document.getElementById("lazySlidersContainer"),ae=document.getElementById("delaySlider"),ne=document.getElementById("delayValBadge"),N=document.getElementById("entropySlider"),F=document.getElementById("entropyValBadge"),A=document.getElementById("lazyKeepBrowserOpenNote"),ie=document.getElementById("mysteryLiveBanner"),je=document.getElementById("liveQuizTitle"),E=document.getElementById("liveStatusText"),V=document.getElementById("liveProgressBar"),w=document.getElementById("btnPauseResume"),ft=document.getElementById("btnFastForward"),gt=document.getElementById("btnStopSubmission");let I=null,L="Monday",Q="Monday",v=null,D=lt,m=null,K=!1,S=!1,T=!1,M=15,C=5,Oe=!1,Fe=!1,q=null;function f(e,t=!0){X&&(X.textContent=e,X.className=t?"status-message success":"status-message",setTimeout(()=>{X.textContent=""},2500))}function Ve(e){return e==="system"?window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":e}function oe(e){qe.forEach(a=>{a.getAttribute("data-theme")===e?a.classList.add("active"):a.classList.remove("active")});const t=Ve(e),s=t==="dark"?"theme-dark":"theme-light";document.documentElement.classList.remove("theme-dark","theme-light","theme-system"),document.body.classList.remove("theme-dark","theme-light","theme-system"),document.documentElement.classList.add(s),document.body.classList.add(s),e==="system"&&(document.documentElement.classList.add("theme-system"),document.body.classList.add("theme-system"));try{localStorage.setItem("popup_theme_mode",e),localStorage.setItem("popup_theme_name",t)}catch{}}function Qe(e){Y&&(Y.checked=e,e?(Z.textContent="Blocked",Z.className="theme-tag tag-blocked",Ne.forEach(t=>t.classList.remove("disabled"))):(Z.textContent="Allowed",Z.className="theme-tag tag-allowed",Ne.forEach(t=>t.classList.add("disabled"))))}function We(e){Ie.forEach(t=>{const s=t.getAttribute("data-tab")===e;t.classList.toggle("active",s),t.setAttribute("aria-selected",s?"true":"false")}),pt.forEach(t=>{const s=t.id===e;t.classList.toggle("active",s)});try{chrome.storage.local.set({activeTab:e})}catch{}e==="tabMessMenu"&&!I&&Je(),e==="tabAttendance"&&!v&&et(),e==="tabMystery"&&!m&&nt()}Ie.forEach(e=>{e.addEventListener("click",()=>{const t=e.getAttribute("data-tab");We(t)})}),chrome.storage.local.get(["activeTab"],e=>{const t=e.activeTab||"tabUtilities";We(t)});function bt(){const e=new Date,s=(e.getDay()+6)%7,a=new Date(e);return a.setDate(e.getDate()-s),a.setHours(0,0,0,0),a.getTime()}function vt(e){if(!e||typeof e!="number"||Date.now()-e>10080*60*1e3)return!0;const t=bt();return e<t}async function wt(){try{const e=yt.replace(/\/+$/,""),t=await fetch(e,{cache:"no-cache"});if(!t.ok)throw new Error(`HTML fetch failed: HTTP ${t.status}`);const a=(await t.text()).match(/\/static\/chunks\/app\/page-[a-f0-9]+\.js/);if(!a)throw new Error("Could not find Next.js page chunk in HTML");const r=`${e}/_next${a[0]}`,i=await fetch(r,{cache:"no-cache"});if(!i.ok)throw new Error(`JS chunk fetch failed: HTTP ${i.status}`);const l=await i.text();let o=l.indexOf("j={Monday:{breakfast:[");if(o!==-1)o+=2;else{const u=/Monday\s*:\s*\{\s*breakfast\s*:\s*\[/,p=l.match(u);if(!p)throw new Error("Monday menu signature not found in JS chunk");o=l.lastIndexOf("{",p.index)}let d=0,h=-1;for(let u=o;u<l.length;u++){const p=l[u];if(p==="{"||p==="[")d++;else if((p==="}"||p==="]")&&(d--,d===0)){h=u+1;break}}if(h===-1)throw new Error("Could not balance JSON braces in JS chunk");const c=l.slice(o,h),y=Function(`return (${c})`)();if(y&&y.Monday&&y.Tuesday){const u=Date.now();return await chrome.storage.local.set({mess_menu_data:y,mess_menu_last_fetched:u}),{data:y,timestamp:u}}throw new Error("Extracted menu missing days")}catch(e){return console.warn("[newNewton] ru-print menu fetch failed:",e),null}}async function Ge(e=!1){let t=null;try{t=await chrome.storage.local.get(["mess_menu_data","mess_menu_last_fetched"])}catch{}const s=t&&t.mess_menu_data&&typeof t.mess_menu_data=="object",a=e||!s||vt(t.mess_menu_last_fetched);if(s&&(I=t.mess_menu_data,W(),Ke(t.mess_menu_last_fetched)),a){we?.classList.add("spinning");const r=await wt();we?.classList.remove("spinning"),r?(I=r.data,W(),Ke(r.timestamp),e&&f("Menu refreshed from ru-print")):s||(I=Be,W(),G.textContent="Weekly Menu (Offline fallback)")}else s||(I=Be,W(),G.textContent="Weekly Menu (Offline fallback)")}function Ke(e){if(!G)return;if(!e){G.textContent="Weekly Menu \u2022 Refreshes Mondays";return}const s=new Date(e).toLocaleDateString("en-US",{month:"short",day:"numeric"});G.textContent=`Synced ${s} \u2022 Refreshes Mondays`}function St(e){const t=e.toLocaleDateString("en-US",{weekday:"short"}),s=e.getDate(),a=e.toLocaleDateString("en-US",{month:"short"});return`${t}, ${s} ${a}`}function Ct(e){const t=new Date,s=(t.getDay()+6)%7,a=be.indexOf(e);if(a===-1)return t;const r=a-s,i=new Date(t);return i.setDate(t.getDate()+r),i}function kt(e,t,s){return s?t>=e.startMin&&t<=e.endMin?{isServing:!0,isNext:!1}:t<e.startMin?{isServing:!1,isNext:!0}:{isServing:!1,isNext:!1}:{isServing:!1,isNext:!1}}function W(){if(!Se)return;const e=new Date,t=(e.getDay()+6)%7;Q=be[t];const s=L===Q;He&&(He.textContent=s?"Today":L);const a=Ct(L);if(Re&&(Re.textContent=St(a)),ve&&(ve.style.display=s?"none":"inline-flex"),Ue.forEach(o=>{const d=o.getAttribute("data-day");o.classList.toggle("active",d===L),o.classList.toggle("is-today",d===Q)}),!I||!I[L]){Se.innerHTML=`
      <div class="mess-empty-state">
        <p>No menu data available for ${L}.</p>
      </div>
    `;return}const r=I[L],i=e.getHours()*60+e.getMinutes();let l=!1,n="";ht.forEach((o,d)=>{const h=r[o.key]||[],c=h.filter(P=>!Pe(P)),y=h.filter(P=>Pe(P)),{isServing:u,isNext:p}=kt(o,i,s);let k=!1,g="";s?u?(k=!0,g='<span class="meal-status-badge badge-serving">\u25CF Serving Now</span>'):p&&!l&&(k=!0,l=!0,g='<span class="meal-status-badge badge-next">Next Up</span>'):d===0&&(k=!0);const B=c.length>0?c.map(P=>`
          <span class="item-chip special-chip" title="Special item">
            <span class="chip-dot"></span>
            ${z(P)}
          </span>
        `).join(""):'<span class="card-description">Standard items</span>',he=y.length>0?y.map(P=>`
          <span class="item-chip staple-chip" title="Daily staple">
            ${z(P)}
          </span>
        `).join(""):"";n+=`
      <details class="meal-card ${u?"is-active-meal":""}" data-meal="${o.key}" ${k?"open":""}>
        <summary class="meal-card-header">
          <div class="meal-header-left">
            <div class="meal-icon-wrapper ${o.iconClass}">
              ${o.svgIcon}
            </div>
            <div class="meal-info">
              <div class="meal-title-row">
                <span class="meal-title">${o.label}</span>
                ${g}
              </div>
              <span class="meal-time">${o.time}</span>
            </div>
          </div>
          <span class="meal-toggle-btn" aria-hidden="true">
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </summary>

        <div class="meal-card-body">
          <!-- Specials Section -->
          <div class="meal-items-section specials-section">
            <div class="section-label">
              <span>\u2728 Special & Main</span>
              <span class="item-count-badge">${c.length}</span>
            </div>
            <div class="items-chip-grid">
              ${B}
            </div>
          </div>

          <!-- Daily Staples Section -->
          ${y.length>0?`
            <div class="meal-items-section staples-section">
              <div class="section-label">
                <span>Daily Staples</span>
                <span class="item-count-badge">${y.length}</span>
              </div>
              <div class="items-chip-grid">
                ${he}
              </div>
            </div>
          `:""}
        </div>
      </details>
    `}),Se.innerHTML=n}function z(e){return e?e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}Ue.forEach(e=>{e.addEventListener("click",()=>{L=e.getAttribute("data-day"),W()})}),ve?.addEventListener("click",()=>{L=Q,W()}),we?.addEventListener("click",()=>{Ge(!0)});function Je(){const t=(new Date().getDay()+6)%7;Q=be[t],L=Q,Ge(!1)}try{const e=localStorage.getItem("popup_theme_mode")||"system";oe(e)}catch{}chrome.storage.sync.get(["themeMode","themeName","blockTelemetry"],e=>{const t=e.themeMode||(e.themeName==="dark"?"dark":localStorage.getItem("popup_theme_mode")||"system");oe(t);const s=e.blockTelemetry!==void 0?e.blockTelemetry:!0;Qe(s)}),qe.forEach(e=>{e.addEventListener("click",async()=>{const t=e.getAttribute("data-theme");oe(t);const s=Ve(t),a=s==="dark"?"grauity-theme-dark":"grauity-theme-light";await chrome.storage.sync.set({themeMode:t,themeName:s,isThemeEnabled:s==="dark"}),await Xe(s,a,t),f(`Theme set to ${t.charAt(0).toUpperCase()+t.slice(1)}`)})}),Y?.addEventListener("change",async()=>{const e=Y.checked;Qe(e),await chrome.storage.sync.set({blockTelemetry:e}),chrome.runtime.sendMessage({action:"SET_TELEMETRY_BLOCK",blockTelemetry:e}),await Mt(e),f(e?"Telemetry blocking enabled":"Telemetry blocking disabled")});const ze=document.getElementById("btnCopyAuthToken"),re=document.getElementById("btnCopyAuthTokenLabel");ze?.addEventListener("click",async()=>{try{let t=(await de())?.token||null;if(!t&&typeof chrome<"u"&&chrome.cookies)try{const s=await chrome.cookies.get({url:"https://my.newtonschool.co",name:"access_token_ns_student_web"});s?.value&&(t=s.value)}catch{}if(!t){f("No token found \u2014 log in at my.newtonschool.co first",!1);return}await navigator.clipboard.writeText(t),ze.classList.add("copied"),re&&(re.textContent="Copied!"),f("Auth token copied to clipboard!"),setTimeout(()=>{ze.classList.remove("copied"),re&&(re.textContent="Copy Token")},2200)}catch{f("Failed to copy auth token",!1)}}),window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",async e=>{chrome.storage.sync.get(["themeMode"],async t=>{if(t.themeMode==="system"){const s=e.matches?"dark":"light",a=s==="dark"?"grauity-theme-dark":"grauity-theme-light";oe("system"),await chrome.storage.sync.set({themeName:s}),await Xe(s,a,"system")}})});async function Xe(e,t,s){try{const[a]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!a||!a.id)return;a.url&&a.url.includes("newtonschool.co")&&chrome.tabs.sendMessage(a.id,{action:"SET_THEME",themeName:e,targetClass:t,themeMode:s},()=>{chrome.runtime.lastError&&chrome.scripting&&chrome.scripting.executeScript&&chrome.scripting.executeScript({target:{tabId:a.id},func:(r,i)=>{document.body.classList.forEach(l=>{l.startsWith("grauity-theme-")&&l!==r&&document.body.classList.remove(l)}),document.body.classList.add(r);try{localStorage.setItem("theme-preference",JSON.stringify({themeName:i,enable_platform_wide_dark_theme:i==="dark"})),localStorage.setItem("app_theme_enabled",i==="dark"?"true":"false")}catch{}},args:[t,e]}).catch(r=>console.warn("Theme script fallback failed:",r))})}catch(a){console.error("Error updating active tab theme:",a)}}async function Mt(e){try{const[t]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!t||!t.id)return;t.url&&t.url.includes("newtonschool.co")&&chrome.tabs.sendMessage(t.id,{action:"SET_TELEMETRY_BLOCK",blockTelemetry:e},()=>{chrome.runtime.lastError&&chrome.scripting&&chrome.scripting.executeScript&&chrome.scripting.executeScript({target:{tabId:t.id},func:s=>{try{localStorage.setItem("newton_enhancer_block_telemetry",s?"true":"false")}catch{}document.documentElement&&document.documentElement.setAttribute("data-newton-block-telemetry",s?"true":"false"),window.dispatchEvent(new CustomEvent("newton_enhancer_telemetry_toggle",{detail:{enabled:s}})),window.postMessage({source:"newton-enhancer-telemetry",enabled:s},"*")},args:[e]}).catch(s=>console.warn("Telemetry script fallback failed:",s))})}catch(t){console.error("Error notifying tab of telemetry change:",t)}}function Ye(e,t,s=t+"s"){return`${e} ${e===1?t:s}`}function zt(e){return e.held===0||e.percentage===null?"none":e.headline==="unreachable"?"bad":e.meetsTarget?"ok":"warn"}function Tt(e){const t=`${Math.round(D*100)}%`,s=a=>`<span class="rest">${a}</span>`;switch(e.headline){case"no-data":return"<strong>No classes held yet.</strong>";case"unreachable":return`<strong>Below ${t}.</strong> ${s("Target is arithmetically out of reach this term.")}`;case"recover":{const a=e.classesToRecover;return`<strong>Attend next ${Ye(a,"class","classes")} in a row</strong> ${s(`to reach ${t}.`)}`}default:return e.skipsAffordable===0?`<strong>No room to skip</strong> ${s(`\u2014 you are right on the ${t} threshold.`)}`:`<strong>Can skip ${Ye(e.skipsAffordable,"class","classes")}</strong> ${s(`and stay above ${t}.`)}`}}function xt(e){return!e.units||e.units.length<=1?`${e.attended||0}/${e.held||0} classes attended`:e.units.map(t=>`${z(t.component||"Class")} ${Number(t.attended)||0}/${Number(t.held)||0}`).join('<span class="att-sep">\xB7</span>')+" attended"}function $t(e){if(!e)return"\u2014";const t=new Date(e);return isNaN(t.getTime())?"\u2014":t.toLocaleDateString("en-US",{weekday:"short",day:"numeric",month:"short"})}function le(e){if(e?.isPractical===!0)return!0;if(e?.isPractical===!1)return!1;const t=(e?.component||"").toLowerCase();return t!=="lecture"&&t!=="theory"}function _t(e){const t=e.missedLectures||[];if(t.length===0)return e.held>0?`
        <details class="missed-details">
          <summary class="missed-summary">
            <span>Missed Classes (0)</span>
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </summary>
          <div class="missed-group-empty" style="margin-top: 6px;">
            \u{1F389} 100% Perfect Attendance! No classes missed.
          </div>
        </details>
      `:"";const s=t.filter(o=>!le(o)),a=t.filter(o=>le(o)),r=(e.units||[]).some(o=>le(o)),i=(e.units||[]).some(o=>!le(o)),l=o=>`
    <li class="missed-item">
      <span class="missed-date">${$t(o.start)}</span>
      <span class="missed-title" title="${z(o.title)}">${z(o.title)}</span>
    </li>
  `;let n="";if(i&&r){let o="";s.length>0?o=`
        <div class="missed-group">
          <div class="missed-group-header">
            <span class="missed-group-title">
              <svg class="missed-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              Theory Lectures
            </span>
            <span class="missed-group-count">${s.length} missed</span>
          </div>
          <ul class="missed-list">
            ${s.map(h=>l(h)).join("")}
          </ul>
        </div>
      `:o=`
        <div class="missed-group-empty">
          <span>\u2728 Theory: 0 missed (All attended)</span>
        </div>
      `;let d="";a.length>0?d=`
        <div class="missed-group">
          <div class="missed-group-header">
            <span class="missed-group-title">
              <svg class="missed-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 2v7.31L4.69 18.2A2 2 0 0 0 6.4 21h11.2a2 2 0 0 0 1.71-2.8L14 9.31V2"/>
                <path d="M8.5 2h7M7 16h10"/>
              </svg>
              Lab / Practical
            </span>
            <span class="missed-group-count">${a.length} missed</span>
          </div>
          <ul class="missed-list">
            ${a.map(h=>l(h)).join("")}
          </ul>
        </div>
      `:d=`
        <div class="missed-group-empty">
          <span>\u2728 Lab: 0 missed (All attended)</span>
        </div>
      `,n=`
      <div class="missed-groups-container">
        ${o}
        <div class="missed-divider"></div>
        ${d}
      </div>
    `}else if(r)n=`
      <div class="missed-groups-container">
        <div class="missed-group">
          <div class="missed-group-header">
            <span class="missed-group-title">
              <svg class="missed-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 2v7.31L4.69 18.2A2 2 0 0 0 6.4 21h11.2a2 2 0 0 0 1.71-2.8L14 9.31V2"/>
                <path d="M8.5 2h7M7 16h10"/>
              </svg>
              Lab / Practical
            </span>
            <span class="missed-group-count">${a.length} missed</span>
          </div>
          <ul class="missed-list">
            ${a.map(o=>l(o)).join("")}
          </ul>
        </div>
      </div>
    `;else if(s.length>0&&a.length>0)n=`
        <div class="missed-groups-container">
          <div class="missed-group">
            <div class="missed-group-header">
              <span class="missed-group-title">Theory Lectures</span>
              <span class="missed-group-count">${s.length} missed</span>
            </div>
            <ul class="missed-list">
              ${s.map(o=>l(o)).join("")}
            </ul>
          </div>
          <div class="missed-divider"></div>
          <div class="missed-group">
            <div class="missed-group-header">
              <span class="missed-group-title">Lab / Practical</span>
              <span class="missed-group-count">${a.length} missed</span>
            </div>
            <ul class="missed-list">
              ${a.map(o=>l(o)).join("")}
            </ul>
          </div>
        </div>
      `;else{const o=a.length>0,d=o?a:s;n=`
        <div class="missed-groups-container">
          <div class="missed-group">
            <div class="missed-group-header">
              <span class="missed-group-title">${o?"Lab / Practical":"Theory Lectures"}</span>
              <span class="missed-group-count">${d.length} missed</span>
            </div>
            <ul class="missed-list">
              ${d.map(h=>l(h)).join("")}
            </ul>
          </div>
        </div>
      `}return`
    <details class="missed-details">
      <summary class="missed-summary">
        <span>Missed Classes (${t.length})</span>
        <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </summary>
      ${n}
    </details>
  `}function ce(e=null,t=!1){if(!R)return;const s=t?"Portal Session Expired":"Portal Login Required",a=e||(t?"Your session on Newton School has expired. Please open the portal to log in and refresh your attendance.":"Connect to your Newton School portal to automatically sync your attendance, view rollups, and track missed classes.");R.innerHTML=`
    <div class="attendance-empty-card">
      <div class="empty-icon-circle">${t?"\u26A0\uFE0F":"\u{1F393}"}</div>
      <h3>${s}</h3>
      <p>${a}</p>
      <button type="button" id="btnOpenPortal" class="open-portal-btn">Open Newton Portal</button>
    </div>
  `,document.getElementById("btnOpenPortal")?.addEventListener("click",()=>{chrome.tabs.create({url:"https://my.newtonschool.co"})}),H&&(H.textContent=t?"Session expired \u2022 Re-login required":"Not logged into portal")}function Te(){if(!R)return;if(!v||!Array.isArray(v.subjects)||v.subjects.length===0){ce();return}const e=v.subjects;let t=0,s=0;if(e.forEach(n=>{t+=Number(n.attended)||0,s+=Number(n.held)||0}),Ce){const n=`${Math.round(D*100)}% Target`;if(s>0){const o=(t/s*100).toFixed(1);Ce.textContent=`${o}% Overall \u2022 ${n}`}else Ce.textContent=n}if(H&&v.timestamp){const n=new Date(v.timestamp),o=n.toLocaleDateString("en-US",{month:"short",day:"numeric"}),d=n.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});H.textContent=`Synced ${o} ${d} \u2022 ${e.length} ${e.length===1?"Subject":"Subjects"}`}const a=e.filter(n=>!n.meetsTarget&&n.held>0),r=e.filter(n=>n.meetsTarget||n.held===0),i=[...a,...r];let l="";i.forEach(n=>{const o=zt(n),d=n.percentage!==null?Math.min(100,Math.max(0,n.percentage*100)):0,h=Math.round(D*100),c=_t(n);l+=`
      <div class="att-subject-card band-${o}">
        <div class="att-card-header">
          <div class="att-subject-title">${z(n.label)}</div>
          <div class="att-pct-badge band-${o}">${n.percentageFormatted}</div>
        </div>
        <p class="att-verdict">${Tt(n)}</p>
        ${n.held>0?`
          <div class="att-bar-track">
            <div class="att-bar-fill band-${o}" style="width: ${d}%;"></div>
            <div class="att-bar-tick" style="left: ${h}%;" title="Target: ${h}%"></div>
          </div>
        `:""}
        <div class="att-meta-row">
          <div class="att-counts">${xt(n)}</div>
        </div>
        ${c}
      </div>
    `}),R.innerHTML=l}function At(e){D=e,ke.forEach(t=>{const s=parseFloat(t.getAttribute("data-target"));t.classList.toggle("active",Math.abs(s-e)<.001)}),chrome.storage.local.set({nst_attendance_target:e}),v&&Array.isArray(v.subjects)&&(v.target=e,v.subjects.forEach(t=>{const s=Le(t.units,{target:e});t.percentage=s.percentage,t.percentageFormatted=s.percentage===null?"\u2014":`${(s.percentage*100).toFixed(1)}%`,t.meetsTarget=s.meetsTarget,t.headline=s.headline,t.skipsAffordable=s.skipsAffordable,t.classesToRecover=s.classesToRecover,t.target=e}),chrome.storage.local.set({nst_attendance_data:v}),Te())}async function de(){try{const e=await chrome.tabs.query({url:"*://my.newtonschool.co/*"});if(e&&e.length>0){for(const t of e)if(t.id)try{const s=await new Promise(a=>{chrome.tabs.sendMessage(t.id,{action:"GET_PORTAL_AUTH"},r=>{chrome.runtime.lastError?a(null):a(r)})});if(s&&s.token)return await chrome.storage.local.set({nst_auth_token:s.token,nst_portal_course_hash:s.courseHash||null,nst_portal_last_seen:Date.now()}),{token:s.token,courseHash:s.courseHash||null}}catch{}}}catch{}try{const e=await chrome.storage.local.get(["nst_auth_token","nst_portal_course_hash"]);if(e&&e.nst_auth_token)return{token:e.nst_auth_token,courseHash:e.nst_portal_course_hash||null}}catch{}return null}async function Ze(e=!1){let t=null;try{t=await chrome.storage.local.get(["nst_attendance_data","nst_attendance_target"])}catch{}t&&t.nst_attendance_target&&(D=t.nst_attendance_target,ke.forEach(a=>{const r=parseFloat(a.getAttribute("data-target"));a.classList.toggle("active",Math.abs(r-D)<.001)}));const s=t&&t.nst_attendance_data&&Array.isArray(t.nst_attendance_data.subjects);if(s&&(v=t.nst_attendance_data,v.target=D,v.subjects.forEach(a=>{const r=Le(a.units,{target:D});a.percentage=r.percentage,a.percentageFormatted=r.percentage===null?"\u2014":`${(r.percentage*100).toFixed(1)}%`,a.meetsTarget=r.meetsTarget,a.headline=r.headline,a.skipsAffordable=r.skipsAffordable,a.classesToRecover=r.classesToRecover,a.target=D}),Te()),e||!s){ee?.classList.add("spinning"),!s&&R&&(R.innerHTML=`
        <div class="mess-loading-state">
          <div class="loading-spinner"></div>
          <span>Syncing attendance from portal...</span>
        </div>
      `),H&&(H.textContent="Syncing attendance from portal...");try{const a=await de();if(!a||!a.token){ee?.classList.remove("spinning"),s?f("Please log into portal to refresh",!1):ce();return}const r=await rt({token:a.token,preferredCourseHash:a.courseHash,target:D});if(r&&Array.isArray(r.subjects))v=r,await chrome.storage.local.set({nst_attendance_data:r}),Te(),e&&f("Attendance synced from portal");else throw new Error("No attendance records found")}catch(a){console.warn("[newNewton] Attendance sync failed:",a),a.message==="AUTH_EXPIRED"?ce("Your Newton School portal session has expired. Please log in again to sync attendance.",!0):s?f("Sync failed: "+(a.message||"Network error"),!1):ce(`Could not sync attendance (${a.message||"Network error"}). Please ensure you are logged into the portal.`)}finally{ee?.classList.remove("spinning")}}}function et(){Ze(!1)}ke.forEach(e=>{e.addEventListener("click",()=>{const t=parseFloat(e.getAttribute("data-target"));isNaN(t)||At(t)})}),ee?.addEventListener("click",()=>{Ze(!0)});function ue(e=null,t=!1){if(!x)return;const s=t?"Portal Session Expired":"Portal Login Required",a=e||(t?"Your session on Newton School has expired. Please open the portal to log in and refresh your quizzes.":"Connect to your Newton School portal to automatically discover unsubmitted quizzes and solutions.");x.innerHTML=`
    <div class="attendance-empty-card mystery-empty-card">
      <div class="empty-icon-circle">${t?"\u26A0\uFE0F":"\u{1F393}"}</div>
      <h3>${s}</h3>
      <p>${a}</p>
      <button type="button" id="btnOpenMysteryPortal" class="open-portal-btn">Open Newton Portal</button>
    </div>
  `,document.getElementById("btnOpenMysteryPortal")?.addEventListener("click",()=>{chrome.tabs.create({url:"https://my.newtonschool.co"})}),U&&(U.textContent="0"),j&&(j.textContent=t?"Expired":"Login Required"),_&&(_.textContent=t?"Session expired \u2022 Re-login required":"Not logged into portal"),b&&(b.style.display="none")}function Et(e){if(!e)return"";const t=new Date(e);if(isNaN(t.getTime()))return"";const s=new Date,a=t.toDateString()===s.toDateString(),r=t.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});if(a)return`Due Today, ${r}`;const i=new Date(s);return i.setDate(i.getDate()+1),t.toDateString()===i.toDateString()?`Due Tomorrow, ${r}`:`Due ${t.toLocaleDateString("en-US",{month:"short",day:"numeric"})}, ${r}`}function tt(e,t=[]){for(const s of t||[]){const a=s?.rawItem?.course?.short_display_name||s?.rawItem?.course?.short_name;if(a){let r=a.replace(/\s*[-–—]\s*[A-Za-z0-9]+$/,"").trim();if(r=r.replace(/\s*[-–—:]?\s*\b(Labs?|Practicals?|Pracs?|Tutorials?|Tuts?|Workshops?)\b\s*\d*$/i,"").trim(),r)return r}}return dt(e)}function st(){if(!x)return;if(!m||!Array.isArray(m.quizzes)){ue();return}const{quizzes:e,groupedBySubject:t,groupedByCourse:s,totalCount:a,solvableCount:r,timestamp:i}=m;if(U&&(U.textContent=a),j&&(j.textContent=a===0?"All Completed":`${a} ${a===1?"Quiz":"Quizzes"}`),_){const c=i?new Date(i).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}):"Just now";a===0?_.textContent=`Synced ${c} \u2022 All caught up!`:_.textContent=`Synced ${c} \u2022 ${a} unsubmitted ${a===1?"quiz":"quizzes"}`}if(a===0){b&&(b.style.display="none"),x.innerHTML=`
      <div class="attendance-empty-card mystery-empty-card">
        <div class="empty-icon-circle">\u{1F389}</div>
        <h3>All Caught Up!</h3>
        <p>No unsubmitted quizzes found across your courses. Great job staying on top of your coursework!</p>
      </div>
    `;return}const l=(e||[]).filter(c=>c.hasAnswersInDb&&!c.isSubmitted).length;b&&(b.style.display="inline-flex",b.disabled=l===0||S,b.title=l===0?"No database answers available for remaining quizzes":`Submit all ${l} unsolved quizzes with answers in database`);const n=t||{};let o=Object.keys(n);o.length===0&&s&&(Object.keys(s).forEach(c=>{const y=s[c]||[],u=tt(c,y);n[u]||(n[u]={subjectLabel:u,quizzes:[],lectures:[],labs:[]}),n[u].quizzes.push(...y),n[u].lectures.push(...y.filter(p=>!p.isPractical)),n[u].labs.push(...y.filter(p=>p.isPractical))}),o=Object.keys(n));let d="";const h=c=>{const y=!!(c.deadline&&Date.now()>c.deadline||c.isPastDeadline);let u=Number(c.earnablePoints??c.rawXP??0);u||(c.isPastDeadline&&c.maxXP?u=c.maxXP*2:u=Number(c.maxXP??0));const p=y?Math.floor(u/2):u,k=String(c.courseHash||"").replace(/^h\//i,"").replace(/^\/+|\/+$/g,"").trim(),g=String(c.hash||"").replace(/^h\//i,"").replace(/^\/+|\/+$/g,"").trim(),B=`https://my.newtonschool.co/course/${encodeURIComponent(k)}/assessment/${encodeURIComponent(g)}`;return`
      <div class="mystery-quiz-card" id="quiz-card-${c.hash}">
        <div class="quiz-card-header">
          <div class="quiz-title-row">
            <h4 class="quiz-title clickable-quiz-title" data-url="${B}" title="Click to open quiz in Newton School">${z(c.title)}</h4>
          </div>
          <div class="quiz-xp-badge" title="${y?`Past deadline: 50% XP (${p} of ${u} XP)`:`Earnable: ${p} XP`}">
            <svg class="xp-icon" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span>${p} XP</span>
          </div>
        </div>

        <div class="quiz-card-body-row">
          <div class="quiz-card-left-col">
            <div class="quiz-meta-row">
              ${y?`
                <span class="quiz-deadline-tag tag-past-deadline" title="Past deadline - earnable XP reduced to half">Past Deadline</span>
              `:""}
              <div class="quiz-stat" title="Total number of questions">
                <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <span>${c.totalQuestions} Questions</span>
              </div>

              ${!y&&c.deadline?`
                <div class="quiz-stat quiz-stat-deadline" title="Submission deadline">
                  <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span>${Et(c.deadline)}</span>
                </div>
              `:""}
            </div>

            <!-- Status feedback message placed directly below number of questions -->
            <div class="quiz-status-feedback" id="quiz-status-${c.hash}" style="display: none;"></div>
          </div>

          <div class="quiz-action-col">
            ${c.hasAnswersInDb?`
              <button type="button" class="mystery-btn mystery-btn-submit" data-hash="${c.hash}" data-course="${c.courseHash}" title="Auto-submit quiz with answers from database">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Submit</span>
              </button>
            `:`
              <button type="button" class="mystery-btn mystery-btn-solve" data-url="${B}" title="Open quiz on Newton School to solve">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                <span>Solve</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `};o.forEach(c=>{const y=n[c];if(!y||!y.quizzes||y.quizzes.length===0)return;const u=tt(y.subjectLabel||c,y.quizzes),p=y.lectures||[],k=y.labs||[],g=(y.quizzes||[]).length,B=(y.quizzes||[]).filter(Ee=>Ee.hasAnswersInDb&&!Ee.isSubmitted),he=B.length>0,P=B.length===g?"Submit All":`Submit ${B.length}`;let pe="";const fe=p.length>0,ge=k.length>0;fe&&(pe+=`
        <div class="mystery-component-group">
          <div class="mystery-component-header">
            <span class="mystery-component-title">
              <svg class="component-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              Theory Lectures
            </span>
            <span class="mystery-count-circle">${p.length}</span>
          </div>
          <div class="mystery-cards-list">
            ${p.map(h).join("")}
          </div>
        </div>
      `),ge&&(pe+=`
        <div class="mystery-component-group" style="${fe?"margin-top: 14px;":""}">
          <div class="mystery-component-header">
            <span class="mystery-component-title">
              <svg class="component-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 2v7.31L4.69 18.2A2 2 0 0 0 6.4 21h11.2a2 2 0 0 0 1.71-2.8L14 9.31V2"/>
                <path d="M8.5 2h7M7 16h10"/>
              </svg>
              Lab / Practical
            </span>
            <span class="mystery-count-circle">${k.length}</span>
          </div>
          <div class="mystery-cards-list">
            ${k.map(h).join("")}
          </div>
        </div>
      `),d+=`
      <details class="meal-card mystery-course-card" ${o.indexOf(c)===0?"open":""} id="course-card-${z(c)}">
        <summary class="meal-card-header mystery-course-summary">
          <div class="meal-header-left">
            <div class="meal-icon-wrapper meal-icon-dinner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <div class="meal-info">
              <div class="meal-title-row">
                <span class="meal-title mystery-course-title" title="${z(u)}">${z(u)}</span>
                <span class="mystery-count-circle" id="subject-badge-${z(c)}">${g}</span>
              </div>
              <span class="meal-time">${fe&&ge?"Theory & Lab Components":ge?"Lab / Practical Component":"Theory Lectures"}</span>
            </div>
          </div>
          <div class="mystery-summary-actions">
            ${he?`
              <button type="button" class="mystery-subject-submit-btn" data-subject="${z(c)}" ${S?"disabled":""} title="Submit ${B.length} unsolved quizzes for ${z(u)}">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>${z(P)}</span>
              </button>
            `:""}
            <span class="meal-toggle-btn" aria-hidden="true">
              <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </div>
        </summary>

        <div class="meal-card-body mystery-course-body">
          ${pe}
        </div>
      </details>
    `}),x.innerHTML=d,x.querySelectorAll(".mystery-subject-submit-btn").forEach(c=>{c.addEventListener("click",async y=>{if(y.preventDefault(),y.stopPropagation(),c.disabled||S)return;const u=c.getAttribute("data-subject"),k=(m?.groupedBySubject?.[u]?.quizzes||(m?.quizzes||[]).filter(g=>g.subjectKey===u||g.subjectLabel===u)).filter(g=>!g.isSubmitted);await ye(k,c,u)})})}async function at(e=!1){if(K)return;K=!0;let t=null;try{t=await chrome.storage.local.get(["nst_mystery_data"])}catch{}const s=t&&t.nst_mystery_data&&Array.isArray(t.nst_mystery_data.quizzes);if(s&&!m&&(m=t.nst_mystery_data,st()),e||!s){te?.classList.add("spinning"),!s&&x&&(x.innerHTML=`
        <div class="mess-loading-state">
          <div class="loading-spinner"></div>
          <span>Checking unsubmitted quizzes...</span>
        </div>
      `),_&&(_.textContent="Checking unsubmitted quizzes...");try{const a=await de();if(!a||!a.token){te?.classList.remove("spinning"),K=!1,s?f("Please log into portal to refresh",!1):ue();return}const r=await ct({token:a.token,preferredCourseHash:a.courseHash});r.timestamp=Date.now(),m=r,await chrome.storage.local.set({nst_mystery_data:r}),st(),e&&f("Quizzes refreshed from portal")}catch(a){console.warn("[newNewton] Mystery quizzes load failed:",a),a.message==="AUTH_EXPIRED"?ue("Your Newton School portal session has expired. Please log in again to sync quizzes.",!0):s?f("Sync failed: "+(a.message||"Network error"),!1):ue(`Could not load quizzes (${a.message||"Network error"}). Please ensure you are logged into the portal.`)}finally{te?.classList.remove("spinning"),K=!1}}else K=!1}function nt(){at(!1),qt()}function it(e){if(e<60)return`${e}s`;const t=Math.floor(e/60),s=e%60;return s>0?`${t}m ${s}s`:`${t}m`}function xe(e){if(e===0)return"\xB10s (Off)";if(e<60)return`\xB1${e}s`;const t=Math.floor(e/60),s=e%60;return s>0?`\xB1${t}m ${s}s`:`\xB1${t}m`}function Wt(e,t,s){return new Promise(a=>{let r=null,i=null;const l=Date.now(),n=()=>{r&&clearTimeout(r),i&&clearInterval(i),q===o&&(q=null)},o=()=>{n(),a(!0)};if(q=o,e<=0||s&&s()){n(),a(!0);return}i=setInterval(()=>{if(s&&s()){n(),a(!0);return}const d=Date.now()-l,h=Math.max(0,e-d);t&&t(d,h),h<=0&&(n(),a(!0))},100),r=setTimeout(()=>{n(),a(!0)},e)})}function Lt(){Oe=!0,typeof q=="function"&&q(),E&&(E.textContent="Submitting remaining without delay...")}function Dt(){Fe=!0,typeof q=="function"&&q(),E&&(E.textContent="Stopping submission..."),f("Submission stopped by user",!1)}function ot(e="Quiz",t="Preparing attempt..."){ie&&(ie.style.display="block"),je&&(je.textContent=`Submitting "${e}"`),E&&(E.textContent=t),V&&(V.style.width="0%")}function $e(){ie&&(ie.style.display="none"),V&&(V.style.width="0%"),q=null}let $=null;function _e(){try{const e=window.AudioContext||window.webkitAudioContext;if(!e)return;(!$||$.state==="closed")&&($=new e),$.state==="suspended"&&$.resume()}catch{}}function Bt(){try{const e=window.AudioContext||window.webkitAudioContext;if(!e)return;(!$||$.state==="closed")&&($=new e),$.state==="suspended"&&$.resume();const t=$,s=t.currentTime;[{freq:659.25,start:0,duration:.14,gain:.22},{freq:830.61,start:.09,duration:.14,gain:.22},{freq:987.77,start:.18,duration:.16,gain:.25},{freq:1318.51,start:.27,duration:.42,gain:.28}].forEach(({freq:r,start:i,duration:l,gain:n})=>{const o=t.createOscillator(),d=t.createGain();o.type="sine",o.frequency.setValueAtTime(r,s+i),d.gain.setValueAtTime(1e-4,s+i),d.gain.exponentialRampToValueAtTime(n,s+i+.02),d.gain.exponentialRampToValueAtTime(1e-4,s+i+l),o.connect(d),d.connect(t.destination),o.start(s+i),o.stop(s+i+l)})}catch(e){console.warn("[newNewton] Could not play completion chime:",e)}}async function Pt(){try{const e=await chrome.storage.local.get(["nst_lazy_submit_enabled","nst_lazy_submit_delay","nst_lazy_submit_entropy"]);T=!!e.nst_lazy_submit_enabled,M=typeof e.nst_lazy_submit_delay=="number"?e.nst_lazy_submit_delay:15,C=typeof e.nst_lazy_submit_entropy=="number"?e.nst_lazy_submit_entropy:5,C>M&&(C=M),Me&&(Me.checked=T),O&&(O.textContent=T?"Active":"Off",O.classList.toggle("active",T)),se&&(se.style.display=T?"flex":"none"),ae&&(ae.value=J(M,1,1e3)),ne&&(ne.textContent=it(M)),N&&(N.value=J(C,0,1e3)),F&&(F.textContent=xe(C))}catch(e){console.warn("[newNewton] Failed to load lazy submit settings:",e)}}Me?.addEventListener("change",async e=>{T=!!e.target.checked,O&&(O.textContent=T?"Active":"Off",O.classList.toggle("active",T)),se&&(se.style.display=T?"flex":"none");try{await chrome.storage.local.set({nst_lazy_submit_enabled:T})}catch{}}),ae?.addEventListener("input",e=>{M=De(e.target.value,1,1e3),ne&&(ne.textContent=it(M)),C>M&&(C=M,N&&(N.value=J(C,0,1e3)),F&&(F.textContent=xe(C)))}),ae?.addEventListener("change",async()=>{try{await chrome.storage.local.set({nst_lazy_submit_delay:M,nst_lazy_submit_entropy:C})}catch{}}),N?.addEventListener("input",e=>{const t=De(e.target.value,0,1e3);t>M?(C=M,N.value=J(M,0,1e3)):C=t,F&&(F.textContent=xe(C))}),N?.addEventListener("change",async()=>{try{await chrome.storage.local.set({nst_lazy_submit_entropy:C})}catch{}}),w?.addEventListener("click",async()=>{w.classList.contains("is-paused")?(await chrome.runtime.sendMessage({action:"RESUME_SUBMISSION"}),w.classList.remove("is-paused"),w.title="Pause submission",w.innerHTML=`
      <svg class="live-action-icon icon-pause" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1.5"></rect>
        <rect x="14" y="4" width="4" height="16" rx="1.5"></rect>
      </svg>
    `,E&&(E.textContent="Resuming submission...")):(await chrome.runtime.sendMessage({action:"PAUSE_SUBMISSION"}),w.classList.add("is-paused"),w.title="Resume submission",w.innerHTML=`
      <svg class="live-action-icon icon-play" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="6 4 20 12 6 20 6 4"></polygon>
      </svg>
    `,E&&(E.textContent="Submission paused"))}),ft?.addEventListener("click",async()=>{confirm("Are you sure you want to fast-forward? All remaining questions will be submitted immediately without human-like delays.")&&(await chrome.runtime.sendMessage({action:"FAST_FORWARD_SUBMISSION"}),Lt())}),gt?.addEventListener("click",async()=>{await chrome.runtime.sendMessage({action:"STOP_SUBMISSION"}),Dt()});async function It(e,t=null,s=!1){const a=document.getElementById(`quiz-card-${e}`);if(a){a.classList.add("card-slide-out"),await new Promise(n=>setTimeout(n,430));const r=a.closest(".mystery-cards-list"),i=a.closest(".mystery-component-group"),l=a.closest(".mystery-course-card");if(a.remove(),r&&i){const n=r.querySelectorAll(".mystery-quiz-card").length,o=i.querySelector(".mystery-count-circle");o&&(o.textContent=n),n===0&&i.remove()}if(l){const n=l.querySelectorAll(".mystery-quiz-card").length,o=l.querySelector(".mystery-count-circle");o&&(o.textContent=n);const d=l.querySelector(".mystery-subject-submit-btn"),h=l.querySelectorAll(".mystery-btn-submit").length;d&&h===0&&d.remove(),n===0&&(l.classList.add("card-slide-out"),await new Promise(c=>setTimeout(c,350)),l.remove())}}if(m){const r=(m.quizzes||[]).find(i=>i.hash===e);r&&(r.isSubmitted=!0),m.quizzes=(m.quizzes||[]).filter(i=>i.hash!==e&&!i.isSubmitted),m.totalCount=m.quizzes.length,m.solvableCount=m.quizzes.filter(i=>i.hasAnswersInDb).length,m.groupedBySubject&&Object.keys(m.groupedBySubject).forEach(i=>{const l=m.groupedBySubject[i];l&&(l.quizzes=(l.quizzes||[]).filter(n=>n.hash!==e&&!n.isSubmitted),l.lectures=(l.lectures||[]).filter(n=>n.hash!==e&&!n.isSubmitted),l.labs=(l.labs||[]).filter(n=>n.hash!==e&&!n.isSubmitted),l.quizzes.length===0&&delete m.groupedBySubject[i])});try{await chrome.storage.local.set({nst_mystery_data:m})}catch{}}me()}function me(){if(!m)return;const e=(m.quizzes||[]).filter(s=>!s.isSubmitted),t=e.length;if(m.totalCount=t,m.solvableCount=e.filter(s=>s.hasAnswersInDb).length,U&&(U.textContent=t),j&&(j.textContent=t===0?"All Completed":`${t} ${t===1?"Quiz":"Quizzes"}`),_&&(t===0?_.textContent="All caught up!":_.textContent=`${t} unsubmitted ${t===1?"quiz":"quizzes"}`),b)if(t===0)b.style.display="none";else{b.style.display="inline-flex",b.disabled=m.solvableCount===0||S;const s=m.solvableCount===t?"Submit All":`Submit ${m.solvableCount}`,a=b.querySelector("span");a&&(a.textContent=s),b.title=m.solvableCount===0?"No answers in database for remaining quizzes":m.solvableCount===t?`Submit all ${t} unsolved quizzes with answers in database`:`Submit ${m.solvableCount} unsolved quizzes with available answers`}document.querySelectorAll(".mystery-subject-submit-btn").forEach(s=>{const a=s.getAttribute("data-subject"),r=(m.quizzes||[]).filter(l=>(l.subjectKey===a||l.subjectLabel===a)&&!l.isSubmitted),i=r.filter(l=>l.hasAnswersInDb).length;if(i===0)s.remove();else{s.style.display="inline-flex",s.disabled=S;const l=i===r.length?"Submit All":`Submit ${i}`,n=s.querySelector("span");n&&(n.textContent=l),s.title=`Submit ${i} unsolved quizzes for ${a}`}}),t===0&&x&&(x.innerHTML=`
      <div class="attendance-empty-card mystery-empty-card">
        <div class="empty-icon-circle">\u{1F389}</div>
        <h3>All Caught Up!</h3>
        <p>No unsubmitted quizzes found across your courses. Great job staying on top of your coursework!</p>
      </div>
    `)}async function ye(e,t=null,s="quizzes"){if(_e(),S)return;if(!Array.isArray(e)||e.length===0){f("No quizzes to submit",!1);return}const a=e.filter(i=>i.hasAnswersInDb&&!i.isSubmitted);if(a.length===0){f(`No database solutions available for ${s}`,!1);return}if(!T&&!confirm("Lazy Submit is turned OFF. Quizzes will be submitted instantly to Newton School without any human-like delays. Are you sure you want to proceed?"))return;S=!0,Oe=!1,Fe=!1;const r=t?t.innerHTML:"";t&&(t.disabled=!0,t.classList.add("is-loading"),t.innerHTML=`
      <div class="loading-spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></div>
      <span>0/${a.length}</span>
    `),document.querySelectorAll(".mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery").forEach(i=>{i.disabled=!0}),T&&A&&(A.style.display="flex"),ot(a[0]?.title||"Quiz Assessment",`Connecting to background worker (0/${a.length})...`);try{const i=await de();if(!i||!i.token)throw new Error("No authentication token found. Please log in to Newton School.");const l=await chrome.runtime.sendMessage({action:"START_SUBMISSION",token:i.token,quizzes:a,lazySettings:{enabled:T,delay:M,entropy:C},batchName:s});l&&l.state&&Ae(l.state)}catch(i){console.error("[newNewton] Failed to initiate background submission:",i),f("Submission failed: "+(i.message||"Error"),!1),S=!1,$e(),A&&(A.style.display="none"),t&&(t.classList.remove("is-loading"),t.innerHTML=r),document.querySelectorAll(".mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery").forEach(l=>{l.disabled=!1}),me()}}function Ae(e){if(e){if(e.status==="running"||e.status==="paused"){if(S=!0,ot(e.currentQuiz?.title||"Quiz Assessment",e.currentProgress?.message||(e.isPaused?"Submission paused":"Submitting in background...")),e.lazySettings?.enabled&&A&&(A.style.display="flex"),w&&(e.isPaused?(w.classList.add("is-paused"),w.title="Resume submission",w.innerHTML=`
          <svg class="live-action-icon icon-play" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 4 20 12 6 20 6 4"></polygon>
          </svg>
        `):(w.classList.remove("is-paused"),w.title="Pause submission",w.innerHTML=`
          <svg class="live-action-icon icon-pause" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1.5"></rect>
            <rect x="14" y="4" width="4" height="16" rx="1.5"></rect>
          </svg>
        `)),V&&e.currentProgress?.total){const t=e.currentProgress,s=t.delaySec?Math.max(0,1-t.remainingSec/t.delaySec):0,a=Math.min(99,Math.round((t.current-1+s)/t.total*100));V.style.width=`${a}%`}if(e.currentQuiz?.hash){const t=document.getElementById(`quiz-status-${e.currentQuiz.hash}`);t&&(t.style.display="inline-flex",t.className="quiz-status-feedback status-progress",t.textContent=e.currentProgress?.message||"Auto-submitting...")}document.querySelectorAll(".mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery").forEach(t=>{t.disabled=!0})}else if(e.status==="completed"){const t=S;S=!1,$e(),A&&(A.style.display="none"),t&&e.successCount>0&&(Bt(),f(`Submitted ${e.successCount} quizzes!`)),document.querySelectorAll(".mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery").forEach(s=>{s.disabled=!1}),me()}else if(e.status==="stopped"){if(S=!1,$e(),A&&(A.style.display="none"),e.currentQuiz?.hash){const t=document.getElementById(`quiz-status-${e.currentQuiz.hash}`);t&&(t.style.display="inline-flex",t.className="quiz-status-feedback status-error",t.textContent="Submission stopped")}f("Submission stopped by user",!1),document.querySelectorAll(".mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery").forEach(t=>{t.disabled=!1}),me()}}}chrome.runtime.onMessage.addListener(e=>{if(e.action==="SUBMISSION_STATE_UPDATE")Ae(e.state);else if(e.action==="QUIZ_SUBMITTED_SUCCESS")It(e.quizHash,e.subjectLabel,e.isPractical);else if(e.action==="QUIZ_SUBMITTED_ERROR"){const t=document.getElementById(`quiz-status-${e.quizHash}`);t&&(t.style.display="inline-flex",t.className="quiz-status-feedback status-error",t.textContent=`Failed: ${e.error||"Error"}`)}});async function qt(){try{const e=await chrome.runtime.sendMessage({action:"GET_SUBMISSION_STATE"});e&&e.state&&Ae(e.state)}catch{}}te?.addEventListener("click",()=>{at(!0)}),b?.addEventListener("click",async()=>{if(_e(),b.disabled||S)return;const e=(m?.quizzes||[]).filter(t=>!t.isSubmitted);await ye(e,b,"all quizzes")}),x?.addEventListener("click",async e=>{const t=e.target.closest(".clickable-quiz-title");if(t){const i=t.getAttribute("data-url");i&&chrome.tabs.create({url:i});return}const s=e.target.closest(".mystery-btn-solve");if(s){const i=s.getAttribute("data-url");i&&chrome.tabs.create({url:i});return}const a=e.target.closest(".mystery-subject-submit-btn");if(a){if(e.preventDefault(),e.stopPropagation(),_e(),a.disabled||S)return;const i=a.getAttribute("data-subject"),n=(m?.groupedBySubject?.[i]?.quizzes||(m?.quizzes||[]).filter(o=>o.subjectKey===i||o.subjectLabel===i)).filter(o=>!o.isSubmitted);await ye(n,a,i);return}const r=e.target.closest(".mystery-btn-submit");if(r&&!r.disabled&&!S){const i=r.getAttribute("data-hash"),l=r.getAttribute("data-course");if(!i||!l)return;const n=(m?.quizzes||[]).find(o=>o.hash===i);if(!n)return;await ye([n],r,n.title||"quiz");return}});function Nt(e,t){const s=(e||"").replace(/^v/i,"").trim(),a=(t||"").replace(/^v/i,"").trim(),r=s.split(".").map(n=>parseInt(n,10)||0),i=a.split(".").map(n=>parseInt(n,10)||0),l=Math.max(r.length,i.length);for(let n=0;n<l;n++){const o=r[n]||0,d=i[n]||0;if(o>d)return 1;if(o<d)return-1}return 0}async function Ht(){const e=document.getElementById("extVersionBadge");if(!e)return;const t=chrome.runtime?.getManifest?.()?.version||"1.2.2";e.textContent=`v${t}`,e.title=`newNewton v${t} (Click for release notes)`;const s="newnewton_update_check",a=3600*1e3;try{const i=(await chrome.storage.local.get([s]))[s],l=Date.now();let n=null;if(i&&l-i.timestamp<a&&i.latestVersion)n=i;else{const o=await fetch("https://api.github.com/repos/suwupnil/newNewton/releases?per_page=1",{headers:{Accept:"application/vnd.github.v3+json"}});if(o.ok){const d=await o.json();if(Array.isArray(d)&&d.length>0){const h=d[0],y=(h.tag_name||h.name||"").replace(/^v/i,"").trim(),u=h.assets?.find(g=>g.name?.endsWith(".zip")),p=h.assets?.find(g=>g.name?.endsWith(".crx")),k=u?.browser_download_url||p?.browser_download_url||h.html_url||"https://github.com/suwupnil/newNewton/releases/latest";n={timestamp:l,latestVersion:y,releaseUrl:h.html_url||"https://github.com/suwupnil/newNewton/releases/latest",downloadUrl:k},await chrome.storage.local.set({[s]:n})}}}n&&n.latestVersion&&Nt(n.latestVersion,t)>0&&(e.classList.add("badge-update-available"),e.href=n.releaseUrl,e.title=`Update available: v${n.latestVersion}! Click to install update (.zip/.crx)`,e.innerHTML=`
          <svg class="badge-update-icon" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          <span>v${n.latestVersion} Update</span>
        `)}catch(r){console.debug("[newNewton] Update check skipped or failed:",r)}}Je(),et(),nt(),Pt(),Ht();
