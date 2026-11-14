import * as THREE from "three";
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;

// year + progress
const yy=$("#year"); if(yy) yy.textContent=new Date().getFullYear();
const bar=$("#progress-bar");
addEventListener("scroll",()=>{ const h=document.documentElement; const p=(h.scrollTop/(h.scrollHeight-h.clientHeight))*100; if(bar) bar.style.width=clamp(p,0,100)+"%" },{passive:true});

// loader
const loader=$("#loader");
const fill=document.querySelector("#loader .loader-line span");
let prog=0; const setP=v=>{ prog=clamp(v,0,100); if(fill) fill.style.width=prog+"%" };
let done=false;
function hide(){
  if(done) return; done=true;
  loader.style.opacity="0"; loader.style.pointerEvents="none"; loader.style.transition="opacity .7s ease";
  setTimeout(()=> loader.style.display="none", 800);
  gsap.from(".hero-title",{y:14,opacity:0,duration:.8,ease:"power2.out"});
  gsap.from(".hero-sub",{y:8,opacity:0,duration:.6,delay:.12});
  gsap.from("#enter-btn",{y:8,opacity:0,duration:.5,delay:.2});
  initScroll();
}
let p=0; const fake=setInterval(()=>{ p+=7+Math.random()*9; if(p>=86){clearInterval(fake); p=86} setP(p)},150);
Promise.all([document.fonts?document.fonts.ready:Promise.resolve(), new Promise(r=>setTimeout(r,650))]).then(()=>{
  clearInterval(fake);
  let cur=prog; const id=setInterval(()=>{ cur+=5; setP(cur); if(cur>=100){clearInterval(id); setTimeout(hide,220)}},26);
});
setTimeout(()=>{ if(!done){ setP(100); hide()}},3800);

// THREE helper
function mk(canvas){
  const r=new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  r.setPixelRatio(Math.min(devicePixelRatio,1.6));
  const rs=()=>{ const w=canvas.clientWidth||innerWidth, h=canvas.clientHeight||innerHeight; r.setSize(w,h,false); };
  rs(); addEventListener("resize",rs); return r;
}
function heartShape(s=1){
  const sh=new THREE.Shape();
  sh.moveTo(0,0.6*s); sh.bezierCurveTo(0.5*s,1.1*s,1.2*s,0.6*s,0,-0.8*s); sh.bezierCurveTo(-1.2*s,0.6*s,-0.5*s,1.1*s,0,0.6*s);
  return sh;
}

// hero 3D subtle
(()=>{ const c=$("#hero-canvas"); if(!c||reduced) return;
  c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio;
  const r=mk(c); const scene=new THREE.Scene();
  const cam=new THREE.PerspectiveCamera(40, c.clientWidth/c.clientHeight, .1, 100); cam.position.set(0,.4,8);
  addEventListener("resize",()=>{ cam.aspect=c.clientWidth/c.clientHeight; cam.updateProjectionMatrix(); });
  scene.add(new THREE.AmbientLight(0xfff0f0,.75));
  const pl=new THREE.PointLight(0xf8a6be,1.25,16); pl.position.set(1.2,1,3); scene.add(pl);
  const g=new THREE.ExtrudeGeometry(heartShape(1),{depth:.42,bevelEnabled:true,bevelThickness:.09,bevelSize:.06,bevelSegments:3,curveSegments:12});
  g.center();
  const m=new THREE.MeshPhysicalMaterial({color:0xc9405e, emissive:0x7a0f22, emissiveIntensity:.14, roughness:.42, clearcoat:.32, transparent:true, opacity:.92});
  const he=new THREE.Mesh(g,m); he.scale.set(1.05,1.05,1.05); he.rotation.set(.12,0,0); scene.add(he);
  let t=0; r.setAnimationLoop(()=>{ t+=.007; he.rotation.y+=.0025; he.position.y=Math.sin(t)*.06; r.render(scene,cam); });
})();

// scroll reveals
gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
function initScroll(){
  const line=document.querySelector(".tl-line span");
  if(line) gsap.fromTo(line,{height:"0%"},{height:"100%",ease:"none",scrollTrigger:{trigger:".timeline",start:"top 78%",end:"bottom 60%",scrub:.8}});
  gsap.utils.toArray(".tl-card").forEach(el=> gsap.from(el,{y:12,opacity:0,duration:.5,scrollTrigger:{trigger:el,start:"top 88%"}}));
  gsap.utils.toArray(".snap").forEach((el,i)=> gsap.from(el,{y:10,opacity:0,duration:.45,delay:(i%3)*.03,scrollTrigger:{trigger:el,start:"top 92%"}}));
  gsap.from(".feature",{y:12,opacity:0,duration:.6,scrollTrigger:{trigger:".feature",start:"top 88%"}});
  gsap.utils.toArray(".why-card").forEach(el=> gsap.from(el,{y:10,opacity:0,duration:.45,scrollTrigger:{trigger:el,start:"top 90%"}}));
  gsap.to("#bg-video",{yPercent:-5,ease:"none",scrollTrigger:{trigger:"#video-sec",start:"top bottom",end:"bottom top",scrub:1}});
  gsap.from("#envelope-wrap",{scale:.97,opacity:0,duration:.6,scrollTrigger:{trigger:"#letter",start:"top 82%"}});
}

// letter
const letterText=`Dear Fitri,

I don't know how to perfectly explain
what you mean to me.

But if I had to choose one person
to keep in my story,

I'd still choose you.`;
const typed=$("#typed-letter");
const env=$("#envelope");
const modal=$("#letter-modal");
const closeBtn=$("#letter-close");
let typedDone=false;
function typeIt(){
  if(typedDone||!typed) return; typedDone=true; typed.textContent=""; let i=0;
  (function s(){ typed.textContent=letterText.slice(0,++i); if(i<letterText.length) setTimeout(s, letterText[i-1]==="\n"?80:15+Math.random()*16); })();
}
function openLetter(){ env.classList.add("open"); setTimeout(()=>{ modal.classList.add("open"); modal.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden"; setTimeout(typeIt,280)},380); }
function closeLetter(){ modal.classList.remove("open"); modal.setAttribute("aria-hidden","true"); document.body.style.overflow=""; }
if(env) env.addEventListener("click", openLetter);
if(closeBtn) closeBtn.addEventListener("click", closeLetter);
document.querySelector(".letter-backdrop")?.addEventListener("click", closeLetter);
addEventListener("keydown",e=>{ if(e.key==="Escape") closeLetter() });

// surprise - gift box + confetti
const sSec=$("#surprise"), sBtn=document.getElementById("gift-box");
let sur=false;
function confetti(){
  const c=$("#confetti-canvas"); if(!c) return;
  const ctx=c.getContext("2d"); const dpr=Math.min(devicePixelRatio,1.6);
  const rs=()=>{ c.width=c.clientWidth*dpr; c.height=c.clientHeight*dpr }; rs();
  const cols=["#c9405e","#f8a6be","#fff","#f0abfc"];
  const ps=Array.from({length:64},()=>({x:Math.random()*c.width,y:-20*dpr,vy:2+Math.random()*4, vx:(Math.random()-.5)*2.8, r:2+Math.random()*3.5, col:cols[Math.floor(Math.random()*cols.length)], rot:Math.random()*6}));
  let t=0; (function loop(){ t+=.016; ctx.clearRect(0,0,c.width,c.height); let alive=false;
    for(const p of ps){ p.y+=p.vy; p.x+=p.vx; p.vy+=.11; p.rot+=.11; if(p.y<c.height+20){ alive=true; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle=p.col; ctx.globalAlpha=.88; ctx.fillRect(-p.r,-p.r,p.r*2,p.r); ctx.restore(); }}
    if(alive&&t<3.6) requestAnimationFrame(loop); else ctx.clearRect(0,0,c.width,c.height);
  })();
}
function flash(){ const f=document.querySelector(".surprise-flash"); if(!f) return; f.classList.add("on"); setTimeout(()=>f.classList.remove("on"),130); }
function boomHearts(){
  const host = sSec;
  for(let i=0;i<28;i++){
    const h=document.createElement("span");
    h.textContent=["♥","♡","💗","✦","🎀"][Math.floor(Math.random()*5)];
    h.style.cssText=`position:absolute;left:${45+Math.random()*10}%;top:52%;font-size:${14+Math.random()*18}px;color:${["#f8a6be","#fff","#fde8ec","#c9405e"][Math.floor(Math.random()*4)]};pointer-events:none;z-index:3`;
    host.appendChild(h);
    const dx=(Math.random()-0.5)*420, dy= -80 - Math.random()*220;
    gsap.fromTo(h,{x:0,y:0,scale:.6,opacity:0},{x:dx,y:dy,scale:1.2,opacity:1,duration:.55,delay:Math.random()*.12,ease:"power2.out",onComplete:()=>{
      gsap.to(h,{y:dy-40, opacity:0, duration:.5, delay:.2, onComplete:()=>h.remove()});
    }});
  }
}
function shake(){ gsap.fromTo(sSec,{x:0},{x:3,duration:.07,yoyo:true,repeat:7,ease:"none",onComplete:()=>gsap.set(sSec,{x:0})}); }
function bigPop(){
  const h=document.querySelector(".surprise-wait");
  if(h) gsap.fromTo(h,{scale:1},{scale:1.08,duration:.12,yoyo:true,repeat:1,ease:"power2.out"});
}
function goSurprise(){
  if(sur) return; sur=true;
  const lid=sBtn.querySelector(".gift-lid");
  sBtn.classList.add("open");
  if(lid) lid.style.opacity="0";
  // JUMPSCARE: flash + shake + boom
  flash(); setTimeout(flash,160);
  shake(); bigPop(); boomHearts(); confetti();
  gsap.to(sSec,{backgroundColor:"#2a1230",duration:.18,yoyo:true,repeat:1});
  // play boop sound via WebAudio
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC){ const ac=new AC(); const o=ac.createOscillator(), g=ac.createGain();
      o.type="sine"; o.frequency.setValueAtTime(620,ac.currentTime); o.frequency.exponentialRampToValueAtTimeAt(880,ac.currentTime+.12);
      g.gain.setValueAtTime(.18,ac.currentTime); g.gain.exponentialRampToValueAtTimeAt(0.01,ac.currentTime+.28);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+.3);
    }
  }catch(e){}
  sSec.classList.add("revealed");
  gsap.from("#surprise-reveal",{y:14,opacity:0,duration:.45,delay:.12, ease:"back.out(1.2)"});
  gsap.from(".reveal-photo",{y:18,opacity:0,scale:.88,rotation:-1,duration:.55,delay:.28, ease:"back.out(1.4)"});
  gsap.from("#choose",{y:10,opacity:0,duration:.4,delay:.6});
  setTimeout(()=>{ const ch=$("#choose"); if(ch){ ch.style.display="block"; requestAnimationFrame(()=> ch.classList.add("show")); }}, 500);
  setTimeout(()=>{ boomHearts(); confetti(); }, 420);
}

// AUTO JUMPSCARE when scrolling into surprise
ScrollTrigger.create({
  trigger:"#surprise",
  start:"top 72%",
  once:true,
  onEnter:()=> goSurprise()
});
if(sBtn) sBtn.addEventListener("click", goSurprise);
document.getElementById("surprise-btn")?.addEventListener("click", goSurprise);

// choose one
const chooseOut=$("#choose-out");
document.querySelectorAll(".choose-btn").forEach(b=>{
  b.addEventListener("click",()=>{
    const k=b.dataset.choose;
    if(!chooseOut) return;
    if(k==="memory"){
      chooseOut.innerHTML=`<div class="choose-card"><img src="https://i.ibb.co.com/Z6f80x6t/IMG-20261006-013840-882.jpg" alt=""><p>soft light, you without even trying — you looked like a dream i didn't want to wake up from. <em>my favorite hello ♡</em></p></div>`;
    } else if(k==="reason"){
      chooseOut.innerHTML=`<div class="choose-card"><p>because even doing nothing with you feels like my favorite adventure. you make boring feel like butterflies. <em>still you, cutie ♡</em></p></div>`;
    } else {
      chooseOut.innerHTML=`<div class="choose-card"><p>my secret? i fall for you a little more every single day — and i'm never ever stopping. you're stuck with me, pretty girl ♡ <em>— agis</em></p></div>`;
    }
    gsap.from("#choose-out .choose-card",{y:8,opacity:0,duration:.35});
  });
});

// love meter easter egg
const meter=$("#meter"), mval=$("#meter-val"), mmsg=$("#meter-msg");
if(meter){
  const msgs=["just a little? you deserve the universe ♡","a bit more? i'm just warming up!","that's more like it, cutie ♡","sooo much — like stars in the sky ♡","999% and still counting! ♡","∞ — and even that's not enough for you, pretty girl ♡"];
  const vals=["10%","30%","50%","100%","999%","∞"];
  meter.addEventListener("input",()=>{
    const v=parseInt(meter.value,10);
    if(mval) mval.textContent=vals[v]||"∞";
    if(mmsg) mmsg.textContent=msgs[v]||msgs[5];
    if(v===5){ mmsg.style.color="var(--pink)"; confetti(); }
    else mmsg.style.color="";
  });
}

// final 3D
(()=>{ const c=$("#final-canvas"); if(!c||reduced) return;
  c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio;
  const r=mk(c); const scene=new THREE.Scene();
  const cam=new THREE.PerspectiveCamera(38,c.clientWidth/c.clientHeight,.1,100); cam.position.set(0,.2,7);
  const g=new THREE.ExtrudeGeometry(heartShape(1),{depth:.38,bevelEnabled:true,bevelThickness:.08,bevelSize:.05,bevelSegments:3,curveSegments:12});
  g.center(); const m=new THREE.MeshPhysicalMaterial({color:0xc9405e, emissive:0x7a0f22, emissiveIntensity:.16, roughness:.44});
  const he=new THREE.Mesh(g,m); he.scale.set(.95,.95,.95); scene.add(he);
  scene.add(new THREE.AmbientLight(0xfff0f0,.72)); const pl=new THREE.PointLight(0xf8a6be,1.1,16); pl.position.set(1,1,3); scene.add(pl);
  let t=0; r.setAnimationLoop(()=>{ t+=.007; he.rotation.y+=.003; he.position.y=Math.sin(t)*.05; r.render(scene,cam); });
})();

// music
let yt=null, ytReady=false, ytOn=false;
const aud=$("#bg-audio"); const btn=$("#music-btn");
function ui(on){ if(btn) btn.classList.toggle("playing", on) }
window.onYouTubeIframeAPIReady=()=>{
  yt=new YT.Player("yt-player",{height:"1",width:"1",videoId:"cMPEd8m79Hw",playerVars:{playsinline:1,controls:0,loop:1,playlist:"cMPEd8m79Hw",modestbranding:1,rel:0},
    events:{onReady:()=> ytReady=true, onStateChange:e=>{ if(e.data===YT.PlayerState.PLAYING){ytOn=true; ui(true)} if(e.data===YT.PlayerState.PAUSED) {ytOn=false; ui(false)}}}});
};
if(btn){
  btn.addEventListener("click", async()=>{
    if(ytReady){ if(ytOn){ yt.pauseVideo(); ytOn=false; ui(false)} else { yt.setVolume(70); yt.playVideo(); if(aud) aud.pause(); ytOn=true; ui(true)} return; }
    if(!aud) return; try{ if(aud.paused){ await aud.play(); ui(true)} else { aud.pause(); ui(false)} }catch(e){}
  });
  let once=false; document.addEventListener("click",()=>{ if(once) return; once=true; if(ytReady&&!ytOn) { yt.setVolume(70); yt.playVideo(); } else if(aud&&aud.paused) aud.play().then(()=>ui(true)).catch(()=>{}); },{once:true});
}
aud?.addEventListener("ended",()=> ui(false));

// nav
$("#enter-btn")?.addEventListener("click",()=> gsap.to(window,{duration:.9,scrollTo:"#video-sec",ease:"power2.inOut"}));
$("#restart-btn")?.addEventListener("click",()=> gsap.to(window,{duration:.9,scrollTo:0}));
document.querySelector(".scroll-hint")?.addEventListener("click",e=> gsap.to(window,{duration:.9,scrollTo:e.currentTarget.dataset.scroll}));
console.log("%cfor fitri — still you.", "color:#f8a6be");

// loader dots
(()=>{ const c=$("#loader-canvas"); if(!c||reduced) return;
  const ctx=c.getContext("2d"); const dpr=Math.min(devicePixelRatio,1.4);
  const rs=()=>{ c.width=innerWidth*dpr; c.height=innerHeight*dpr }; rs(); addEventListener("resize",rs);
  const ds=Array.from({length:22},()=>({x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-.5)*.32*dpr,vy:(Math.random()-.5)*.32*dpr,r:1+Math.random()*1.2}));
  let alive=true;
  (function loop(){
    const loaderEl=$("#loader");
    if(!alive||!loaderEl||loaderEl.style.display==="none") return;
    if(parseFloat(getComputedStyle(loaderEl).opacity)<0.05) return;
    ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle="rgba(248,166,190,.38)";
    ds.forEach(d=>{ d.x+=d.vx; d.y+=d.vy; if(d.x<0||d.x>c.width) d.vx*=-1; if(d.y<0||d.y>c.height) d.vy*=-1; ctx.beginPath(); ctx.arc(d.x,d.y,d.r*dpr,0,6.28); ctx.fill(); });
    requestAnimationFrame(loop);
  })();
})();
