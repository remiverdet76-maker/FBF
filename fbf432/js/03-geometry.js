/* ═══════════════════════════════════════════
   03-geometry.js — FX3D Flux · Mandala · Particules
   4 formes (Sphère · Torus · Métatron · Merkaba)
   ═══════════════════════════════════════════ */
'use strict';

// 4 formes — compat stubs pour 07-app.js / updateInfobar
const GEO_NAMES=['Sphère','Torus','Métatron','Merkaba'];
const GEO_IDS  =['sphere','torus','metatron','merkaba'];
let activeGeometry=1;   // Torus 3D par défaut (rotation auto active via V.autoRot)

const V={rx:.28,ry:0,trx:.28,try_:0,zoom:2.2,tzoom:2.2,drag:false,lmx:0,lmy:0,t:0,spd:.8,autoRot:true};
const HP={wi:6.0,ex:.18,tM:7,ns:200,br:true,pa:true,ma:true,la:true,gl:.65,f:1,breathe:1};
const TF={val:0,target:0};
const AE={on:false,spd:.3,phase:0,counter:0,baseWi:6.0,baseEx:.18,baseTM:7};

let _hpTarget=null;
var _gW=0,_gH=0,_gCx=0,_gCy=0;

// ── Palette neon 6 brins ──────────────────────────────────────────
const NS=6;
const SCOLS=[
  [[0,220,255],[0,255,160]],
  [[255,20,100],[200,80,255]],
  [[255,200,0],[255,100,0]],
  [[20,255,80],[0,200,200]],
  [[180,0,255],[60,120,255]],
  [[255,80,0],[255,220,60]],
];
var _SMID_BASE=SCOLS.map(c=>[(c[0][0]+c[1][0])>>1,(c[0][1]+c[1][1])>>1,(c[0][2]+c[1][2])>>1]);
var _SMID=[..._SMID_BASE];

// ── Teinte liée à la fréquence maître ────────────────────────────
function _rgb2hsl(r,g,b){
  r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  let h=0,s=0,l=(mx+mn)/2;
  if(d>0){s=l>0.5?d/(2-mx-mn):d/(mx+mn);if(mx===r)h=((g-b)/d+(g<b?6:0));else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}
  return[h,s,l];
}
function _hsl2rgb(h,s,l){
  h=((h%360)+360)%360;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  let r,g,b;
  if(h<60){r=c;g=x;b=0;}else if(h<120){r=x;g=c;b=0;}else if(h<180){r=0;g=c;b=x;}else if(h<240){r=0;g=x;b=c;}else if(h<300){r=x;g=0;b=c;}else{r=c;g=0;b=x;}
  return[Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
}
function masterHue(freq){return((freq-36)/(432-36))*270;}
let _lastMasterHueShift=0;
function applyMasterHueToFlux(freq){
  const targetShift=masterHue(freq)-135;
  _lastMasterHueShift+=(targetShift-_lastMasterHueShift)*0.015;
  _SMID=_SMID_BASE.map(c=>{const[h,s,l]=_rgb2hsl(c[0],c[1],c[2]);return _hsl2rgb(h+_lastMasterHueShift,s,l);});
}

// ── Projection (pour particules + centre) ────────────────────────
function proj(x,y,z){
  var crx=Math.cos(V.rx),srx=Math.sin(V.rx),cry=Math.cos(V.ry),sry=Math.sin(V.ry);
  var y2=y*crx-z*srx,z2=y*srx+z*crx,x2=x*cry+z2*sry,z3=-x*sry+z2*cry;
  var sc=V.zoom*(_gH*.38)*(1+(HP.ex-.18)*1.6)*HP.breathe;
  var fov=600/(600+z3*80);
  return{sx:_gCx+x2*sc*fov,sy:_gCy+y2*sc*fov,fov,z:z3};
}

// ── Mandala sacré (cache offscreen) ──────────────────────────────
var mandCache=null,mandRot=0;
function buildMC(){
  mandCache=document.createElement('canvas');
  mandCache.width=_gW;mandCache.height=_gH;
  var m=mandCache.getContext('2d'),base=Math.min(_gW,_gH)*.44;
  m.save();m.translate(_gCx,_gCy);
  var phi=1.6180339887;
  for(var a=0;a<3;a++){
    m.save();m.rotate(a*Math.PI*2/3);
    m.strokeStyle='rgba(232,160,32,.022)';m.lineWidth=.4;m.beginPath();
    var r0=5,fst=true;
    for(var ii=0;ii<550;ii++){var ang=ii*.055,r=r0*Math.pow(phi,ang/(Math.PI*2));if(r>base*1.3)break;fst?m.moveTo(r*Math.cos(ang),r*Math.sin(ang)):m.lineTo(r*Math.cos(ang),r*Math.sin(ang));fst=false;}
    m.stroke();m.restore();
  }
  for(var ri=1;ri<=9;ri++){
    var rr=base*ri/9,ra=.022*(1-ri/11);
    m.beginPath();m.arc(0,0,rr,0,Math.PI*2);
    m.strokeStyle='rgba(0,180,255,'+ra+')';m.lineWidth=.4;m.stroke();
    if(ri%3===0){
      m.strokeStyle='rgba(0,204,255,'+(ra*.55)+')';m.lineWidth=.25;
      for(var si=0;si<12;si++){var a1=si/12*Math.PI*2,a2=(si+5)/12*Math.PI*2;m.beginPath();m.moveTo(rr*Math.cos(a1),rr*Math.sin(a1));m.lineTo(rr*Math.cos(a2),rr*Math.sin(a2));m.stroke();}
    }
  }
  var pR=base*.135;
  for(var pi2=0;pi2<12;pi2++){var pa=pi2/12*Math.PI*2,px2=Math.cos(pa)*pR*.62,py2=Math.sin(pa)*pR*.62;m.save();m.translate(px2,py2);m.rotate(pa+Math.PI/2);m.beginPath();m.ellipse(0,0,pR*.21,pR*.48,0,0,Math.PI*2);m.strokeStyle='rgba(232,160,32,.038)';m.lineWidth=.5;m.stroke();m.restore();}
  var vR=base*.21;
  for(var vi=0;vi<6;vi++){var va=vi/6*Math.PI*2;m.beginPath();m.arc(Math.cos(va)*vR*.5,Math.sin(va)*vR*.5,vR,0,Math.PI*2);m.strokeStyle='rgba(0,204,255,.012)';m.lineWidth=.35;m.stroke();}
  m.beginPath();m.arc(0,0,base*.045,0,Math.PI*2);m.strokeStyle='rgba(232,160,32,.06)';m.lineWidth=.5;m.stroke();
  m.restore();
}

/* ════════════════════════════════════════════════════════════════
   FX3D — Réseau de lignes flux lumineuses
   4 formes : Sphère · Torus · Métatron · Merkaba
   Couleurs par ratio de fréquences. Caméra V partagée.
   ════════════════════════════════════════════════════════════════ */
const FX3D={
  form:'torus', ratio:'432/360',
  density:220, torsion:3.0, expansion:1.0, spread:1.0, glow:0.65, polarity:0.0,
  _pts:null, _pairs:null
};
const FX3D_RATIOS={
  '432/360':[[240,196,72],[0,214,200]],
  '360/432':[[0,214,200],[240,196,72]],
  '396/432':[[176,116,255],[240,196,72]],
  '432/396':[[240,196,72],[176,116,255]],
  '360/396':[[0,214,200],[176,116,255]],
  '396/360':[[176,116,255],[0,214,200]]
};
const _FX_ICO=(function(){
  const t=(1+Math.sqrt(5))/2,m=Math.sqrt(1+t*t),v=[
    [-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],
    [0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
  return v.map(p=>[p[0]/m,p[1]/m,p[2]/m]);
})();
const _FX_MERK=[
  [0,1,0],[0.943,-0.333,0],[-0.471,-0.333,0.816],[-0.471,-0.333,-0.816],
  [0,-1,0],[-0.943,0.333,0],[0.471,0.333,-0.816],[0.471,0.333,0.816]];

FX3D.proj=function(x,y,z){
  const crx=Math.cos(V.rx),srx=Math.sin(V.rx),cry=Math.cos(V.ry),sry=Math.sin(V.ry);
  const y2=y*crx-z*srx,z2=y*srx+z*crx,x2=x*cry+z2*sry,z3=-x*sry+z2*cry;
  const sc=V.zoom*(_gH*0.38),fov=600/(600+z3*240);
  return{sx:_gCx+x2*sc*fov,sy:_gCy+y2*sc*fov,fov,z:z3};
};
FX3D._build=function(t){
  const f=this.form,N=Math.max(40,Math.min(340,this.density|0)),E=0.42*this.expansion,pts=[];
  if(f==='sphere'){
    const ga=Math.PI*(3-Math.sqrt(5)),tw=this.torsion*0.15,sy=0.65+0.6*this.spread;
    for(let i=0;i<N;i++){
      const yy=1-(i/((N-1)||1))*2,rad=Math.sqrt(Math.max(0,1-yy*yy)),th=ga*i+t*0.2+yy*tw;
      pts.push([Math.cos(th)*rad*E,yy*E*sy*0.8,Math.sin(th)*rad*E]);
    }
    this._pairs=[1,Math.max(2,(N*0.382)|0),Math.max(3,(N*0.236)|0)];
  }else if(f==='torus'){
    const R=0.34*this.expansion,r=0.14*this.spread,tw=Math.max(1,this.torsion);
    for(let i=0;i<N;i++){
      const u=i/N*Math.PI*2+t*0.15,v=u*tw+t*0.1;
      pts.push([(R+r*Math.cos(v))*Math.cos(u),r*Math.sin(v),(R+r*Math.cos(v))*Math.sin(u)]);
    }
    this._pairs=[1,Math.max(2,(N/tw)|0)];
  }else if(f==='metatron'){
    const s=E*1.05;for(const p of _FX_ICO)pts.push([p[0]*s,p[1]*s,p[2]*s]);
    this._pairs=null;
  }else{
    const s=E*1.18;for(const p of _FX_MERK)pts.push([p[0]*s,p[1]*s,p[2]*s]);
    this._pairs=null;
  }
  this._pts=pts;
};
FX3D.render=function(ctx,t){
  this._build(t);
  const pts=this._pts,N=pts.length;
  const cols=FX3D_RATIOS[this.ratio]||FX3D_RATIOS['432/360'],c1=cols[0],c2=cols[1];
  const P=new Array(N);
  for(let i=0;i<N;i++)P[i]=this.proj(pts[i][0],pts[i][1],pts[i][2]);
  const gl=this.glow,pol=this.polarity;
  const tP=0.5+0.5*Math.sin(t*1.75);
  const tP2=0.5+0.5*Math.sin(t*2.8+1.1);
  const avgC=[(c1[0]+c2[0])>>1,(c1[1]+c2[1])>>1,(c1[2]+c2[2])>>1];

  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';

  // ── Bloom passes (chemin unique, 2 traits large→moyen) ──────────
  ctx.beginPath();
  if(this._pairs){
    for(const off of this._pairs){for(let i=0;i<N;i++){const A=P[i],B=P[(i+off)%N];if(A&&B){ctx.moveTo(A.sx,A.sy);ctx.lineTo(B.sx,B.sy);}}}
  }else{
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){const A=P[i],B=P[j];if(A&&B){ctx.moveTo(A.sx,A.sy);ctx.lineTo(B.sx,B.sy);}}
  }
  ctx.strokeStyle=`rgba(${avgC[0]},${avgC[1]},${avgC[2]},${(0.038*gl*tP).toFixed(3)})`;
  ctx.lineWidth=11;ctx.stroke();
  ctx.strokeStyle=`rgba(${avgC[0]},${avgC[1]},${avgC[2]},${(0.082*gl*tP).toFixed(3)})`;
  ctx.lineWidth=4.2;ctx.stroke();

  // ── Lignes principales (couleur interpolée par segment) ──────────
  {const dl=(a,b,p)=>{
    const A=P[a],B=P[b];if(!A||!B)return;
    const fov=(A.fov+B.fov)*0.5,al=gl*0.23*fov-0.02;if(al<=0.005)return;
    let q=p+pol*0.35;q=q<0?0:q>1?1:q;
    const r=(c1[0]+(c2[0]-c1[0])*q)|0,g=(c1[1]+(c2[1]-c1[1])*q)|0,bl=(c1[2]+(c2[2]-c1[2])*q)|0;
    ctx.strokeStyle=`rgba(${r},${g},${bl},${al.toFixed(3)})`;
    ctx.lineWidth=Math.max(0.5,1.15*fov);
    ctx.beginPath();ctx.moveTo(A.sx,A.sy);ctx.lineTo(B.sx,B.sy);ctx.stroke();
  };
  if(this._pairs){for(const off of this._pairs){for(let i=0;i<N;i++)dl(i,(i+off)%N,i/N);}}
  else{for(let i=0;i<N;i++)for(let j=i+1;j<N;j++)dl(i,j,(i+j)/(2*N));}}

  // ── Points lumineux — 3 couches (halo · mid · noyau) ────────────
  for(let i=0;i<N;i++){
    const A=P[i];if(!A)continue;
    const al=Math.min(1,gl*0.55*A.fov),rr=Math.max(0.8,1.9*A.fov);
    ctx.fillStyle=`rgba(255,255,255,${(al*0.08).toFixed(3)})`;
    ctx.beginPath();ctx.arc(A.sx,A.sy,rr*5.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(255,255,255,${(al*0.26).toFixed(3)})`;
    ctx.beginPath();ctx.arc(A.sx,A.sy,rr*2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(255,255,255,${(al*0.68).toFixed(3)})`;
    ctx.beginPath();ctx.arc(A.sx,A.sy,rr,0,Math.PI*2);ctx.fill();
  }

  // ── Centre — anneaux pulsants + gradient radial ──────────────────
  const c=this.proj(0,0,0);
  for(let ri=0;ri<5;ri++){
    const ph=((t*0.40+ri*0.2)%1);
    const rad=(52+ri*20)*ph*V.zoom;
    const al=(1-ph)*0.40*gl;
    ctx.strokeStyle=`rgba(${c2[0]},${c2[1]},${c2[2]},${al.toFixed(3)})`;
    ctx.lineWidth=1.5*(1-ph);
    ctx.beginPath();ctx.arc(c.sx,c.sy,rad,0,Math.PI*2);ctx.stroke();
  }
  const cRad=55*tP*V.zoom;
  const cg=ctx.createRadialGradient(c.sx,c.sy,0,c.sx,c.sy,cRad);
  cg.addColorStop(0,`rgba(255,252,238,${(0.95*tP).toFixed(2)})`);
  cg.addColorStop(0.26,`rgba(${c2[0]},${c2[1]},${c2[2]},${(0.55*tP).toFixed(2)})`);
  cg.addColorStop(0.60,`rgba(${c1[0]},${c1[1]},${c1[2]},${(0.24*tP2).toFixed(2)})`);
  cg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=cg;ctx.beginPath();ctx.arc(c.sx,c.sy,cRad,0,Math.PI*2);ctx.fill();

  ctx.restore();
};

function fx3dSetForm(f){
  FX3D.form=f;
  const idx=GEO_IDS.indexOf(f);
  if(idx>=0)activeGeometry=idx;
  document.querySelectorAll('.fx3d-form').forEach(b=>b.classList.toggle('on',b.dataset.f===f));
  document.querySelectorAll('.geometry-btn').forEach((b,i)=>b.classList.toggle('active',i===idx));
}
function fx3dSetRatio(r){FX3D.ratio=r;document.querySelectorAll('.fx3d-ratio').forEach(b=>b.classList.toggle('on',b.dataset.r===r));}
function fx3dSet(field,val,el){FX3D[field]=parseFloat(val);if(el){const o=document.getElementById(el);if(o)o.textContent=(field==='density')?Math.round(val):parseFloat(val).toFixed(2);}}

// ── Centre fractal pulsant ────────────────────────────────────────
function drawCenter(ctx){
  const p0=proj(0,0,0);
  const pulse=.6+.4*Math.sin(V.t*4.32*V.spd);
  for(let ri=0;ri<5;ri++){
    const ph=(V.t*.7*V.spd+ri*.21)%1;
    ctx.beginPath();ctx.arc(p0.sx,p0.sy,ph*82,0,Math.PI*2);
    ctx.strokeStyle=`rgba(0,204,255,${(1-ph)*.28})`;ctx.lineWidth=.65;ctx.globalAlpha=1;ctx.stroke();
  }
  const gph=(V.t*.9*V.spd)%1;
  ctx.beginPath();ctx.arc(p0.sx,p0.sy,gph*105,0,Math.PI*2);
  ctx.strokeStyle=`rgba(232,160,32,${(1-gph)*.32})`;ctx.lineWidth=.9;ctx.stroke();
  ctx.fillStyle='#ffffff';ctx.shadowColor='#00ccff';ctx.shadowBlur=22*pulse;
  ctx.globalAlpha=.92*pulse;
  ctx.beginPath();ctx.arc(p0.sx,p0.sy,4.2*pulse,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffd700';ctx.shadowColor='#ffd700';ctx.shadowBlur=11*pulse;
  ctx.globalAlpha=.7*pulse;
  ctx.beginPath();ctx.arc(p0.sx,p0.sy,2*pulse,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.globalAlpha=1;
}

// ── Particules orbitales ──────────────────────────────────────────
var PARTS=[];
function initParts(){
  PARTS=[];
  for(let i=0;i<72;i++){
    PARTS.push({
      strand:i%NS,r:.32+Math.random()*.10,
      phi:Math.acos(2*Math.random()-1),theta:Math.random()*Math.PI*2,
      dtheta:(Math.random()-.5)*.018,dphi:(Math.random()-.5)*.012,
      sz:1.2+Math.random()*2.4,pw:Math.random()*Math.PI*2
    });
  }
}
function drawParts(ctx){
  if(!HP.pa)return;
  const _src=((window.innerWidth<=900||window.innerHeight<=500)&&PARTS.length>90)?PARTS.slice(0,90):PARTS;
  const list=[];
  for(const pt of _src){
    pt.theta+=pt.dtheta*V.spd*HP.f;pt.phi+=pt.dphi*V.spd;
    const x=pt.r*Math.sin(pt.phi)*Math.cos(pt.theta),y=pt.r*Math.cos(pt.phi),z=pt.r*Math.sin(pt.phi)*Math.sin(pt.theta);
    const p=proj(x,y,z);list.push({sx:p.sx,sy:p.sy,fov:p.fov,z:p.z,pt});
  }
  list.sort((a,b)=>a.z-b.z);
  for(const{sx,sy,fov,pt}of list){
    const m=_SMID[pt.strand];
    const puls=.65+.35*Math.sin(V.t*4.8+pt.pw);
    const sz=pt.sz*fov*puls;const alpha=Math.max(.04,.52*fov);
    ctx.fillStyle=`rgba(${m},${(alpha*.12).toFixed(3)})`;ctx.globalAlpha=1;
    ctx.beginPath();ctx.arc(sx,sy,sz*3.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(${m},${alpha.toFixed(3)})`;
    ctx.beginPath();ctx.arc(sx,sy,sz,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
}

// ── Sélection géométrie (compat 07-app) ──────────────────────────
function setGeometry(g){
  activeGeometry=Math.max(0,Math.min(GEO_NAMES.length-1,g));
  fx3dSetForm(GEO_IDS[activeGeometry]);
}

// ── Callbacks sliders panGeo → FX3D ──────────────────────────────
function g3dSetWi(v){FX3D.torsion=v/10;const el=document.getElementById('sv-wi');if(el)el.textContent=FX3D.torsion.toFixed(1)+'×';}
function g3dSetNs(v){FX3D.density=parseInt(v);const el=document.getElementById('sv-ns');if(el)el.textContent=v;}
function g3dSetSpd(v){V.spd=v/10;const el=document.getElementById('sv-spd');if(el)el.textContent=V.spd.toFixed(1)+'×';}
function g3dSetEx(v){FX3D.expansion=v/100;const el=document.getElementById('sv-ex');if(el)el.textContent=parseFloat(v/100).toFixed(2);}
function g3dSetTM(v){FX3D.spread=v/100;const el=document.getElementById('sv-tm');if(el)el.textContent=parseFloat(v/100).toFixed(2);}
function g3dSetGlow(v){FX3D.glow=v/100;const el=document.getElementById('sv-glow');if(el)el.textContent=v+'%';}
function g3dToggleAE(on){
  AE.on=on;AE.phase=0;AE.counter=0;
  if(on){AE.baseWi=FX3D.torsion;AE.baseEx=FX3D.expansion;AE.baseTM=FX3D.spread;}
}
function g3dSetAESpd(v){AE.spd=v/10;const el=document.getElementById('sv-ae-spd');if(el)el.textContent=AE.spd.toFixed(1)+'×';}

// ── buildGeoGrid (4 formes) ───────────────────────────────────────
function buildGeoGrid(){
  const grid=document.getElementById('geo-grid');if(!grid)return;
  grid.innerHTML=GEO_NAMES.map((n,i)=>`<button class="geometry-btn fx3d-form${i===activeGeometry?' active on':''}" data-f="${GEO_IDS[i]}" onclick="setGeometry(${i})">${n}</button>`).join('');
}

// ── Boucle principale ─────────────────────────────────────────────
let _lastMeta=0;
function drawMetatron(){
  const _now=performance.now();if(_now-_lastMeta<32)return;_lastMeta=_now;
  const cv=document.getElementById('meta-canvas');if(!cv)return;
  const _mob=window.innerWidth<=900||window.innerHeight<=500;
  const dpr=Math.min(window.devicePixelRatio||1,_mob?1.5:2);
  const vw=window.innerWidth,vh=window.innerHeight;
  const nW=Math.round(vw*dpr),nH=Math.round(vh*dpr);
  if(cv.width!==nW||cv.height!==nH){cv.width=nW;cv.height=nH;cv.style.width=vw+'px';cv.style.height=vh+'px';mandCache=null;}
  const ctx=cv.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  _gW=vw;_gH=vh;_gCx=vw/2;_gCy=vh/2;
  ctx.clearRect(0,0,vw,vh);ctx.globalAlpha=1;

  if(!mandCache)buildMC();
  if(HP.ma&&mandCache){
    mandRot+=.00022;
    ctx.save();ctx.translate(_gCx,_gCy);ctx.rotate(mandRot);ctx.translate(-_gCx,-_gCy);
    ctx.globalAlpha=.14;ctx.drawImage(mandCache,0,0);ctx.restore();
  }
  ctx.globalAlpha=1;

  if(typeof masterFreq!=='undefined'&&masterFreq>0)HP.f=masterFreq/432;else HP.f=1;
  applyMasterHueToFlux(typeof masterFreq!=='undefined'?masterFreq:432);
  const bgEl=document.getElementById('cosmic-bg');
  if(bgEl)bgEl.style.filter=`hue-rotate(${_lastMasterHueShift.toFixed(1)}deg) saturate(1.15)`;

  V.rx+=(V.trx-V.rx)*.06;V.ry+=(V.try_-V.ry)*.06;V.zoom+=(V.tzoom-V.zoom)*.08;
  if(V.autoRot)V.try_+=.0025*V.spd;
  HP.breathe=1+.07*Math.sin(V.t*.5);
  TF.val+=(TF.target-TF.val)*.022;

  if(AE.on){
    AE.phase+=.016*AE.spd;AE.counter++;
    const fi=Math.round(Math.max(90,900/AE.spd));
    if(AE.counter>=fi){AE.counter=0;setGeometry((activeGeometry+1)%GEO_NAMES.length);}
  }

  FX3D.render(ctx,V.t);
  drawParts(ctx);
  drawCenter(ctx);
  V.t+=.016*V.spd;
}

// ── Drag / pinch / zoom ───────────────────────────────────────────
let _lastPinch=0;
function g3dInitDrag(){
  const cv=document.getElementById('meta-canvas');if(!cv||cv._g3dDrag)return;
  cv._g3dDrag=true;
  cv.addEventListener('mousedown',e=>{V.drag=true;V.lmx=e.clientX;V.lmy=e.clientY;V.autoRot=false;const ck=document.getElementById('ckRot');if(ck)ck.checked=false;cv.style.cursor='grabbing';});
  window.addEventListener('mouseup',()=>{V.drag=false;cv.style.cursor='grab';});
  window.addEventListener('mousemove',e=>{if(!V.drag)return;V.try_+=(e.clientX-V.lmx)*.008;V.trx=Math.max(-1.4,Math.min(1.4,V.trx+(e.clientY-V.lmy)*.008));V.lmx=e.clientX;V.lmy=e.clientY;});
  cv.addEventListener('wheel',e=>{e.preventDefault();V.tzoom=Math.max(.3,Math.min(3,V.tzoom*(e.deltaY>0?.92:1.09)));},{passive:false});
  cv.addEventListener('touchstart',e=>{
    if(e.touches.length===1){V.drag=true;V.lmx=e.touches[0].clientX;V.lmy=e.touches[0].clientY;V.autoRot=false;}
    else if(e.touches.length===2){V.drag=false;const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;_lastPinch=Math.sqrt(dx*dx+dy*dy);}
  },{passive:true});
  cv.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY,dist=Math.sqrt(dx*dx+dy*dy);if(_lastPinch>0)V.tzoom=Math.max(.3,Math.min(3,V.tzoom*dist/_lastPinch));_lastPinch=dist;}
    else if(e.touches.length===1&&V.drag){V.try_+=(e.touches[0].clientX-V.lmx)*.008;V.trx+=(e.touches[0].clientY-V.lmy)*.008;V.lmx=e.touches[0].clientX;V.lmy=e.touches[0].clientY;}
  },{passive:false});
  cv.addEventListener('touchend',()=>{V.drag=false;_lastPinch=0;});
  cv.style.cursor='grab';cv.style.pointerEvents='auto';
}

function animMetatron(){
  if(!masterRAF)masterTick();
  initParts();
  g3dInitDrag();
}
