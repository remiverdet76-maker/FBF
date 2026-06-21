/* ═══════════════════════════════════════════
   03-geometry.js — 9 Géométries Sacrées 3D · Flux Neon · T(Fréquences)
   ═══════════════════════════════════════════ */
'use strict';

// 9 géométries sacrées 3D
const GEO_NAMES=['Cube Métatron','Dodécaèdre','Icosaèdre','Double Pyramide','Merkaba','Graine de Vie','Fleur de Vie','Arbre de Vie','Sphère Organique'];
const GEO_IDS  =['metatron','dodeca','icosa','bipyramid','merkaba','graine','fleur','arbre','sphere'];
let activeGeometry=0;

const V={rx:.28,ry:0,trx:.28,try_:0,zoom:2.5,tzoom:2.5,drag:false,lmx:0,lmy:0,t:0,spd:1,autoRot:true};

// HP: wi=vitesse flux · ex=échelle géo · f=couplage fréquence audio
const HP={wi:6.0,ex:.18,tM:7,ns:200,br:true,pa:true,ma:true,la:true,gl:.65,f:1,breathe:1};
const TF={val:0,target:0};
const AE={on:false,spd:.3,phase:0,counter:0,baseWi:6.0,baseEx:.18,baseTM:7};

const GEO_PRESETS={
  metatron: {wi:6.0, ex:.22,tM:9, ns:200,tf:0.0 },
  dodeca:   {wi:6.0, ex:.20,tM:8, ns:180,tf:0.3 },
  icosa:    {wi:9.0, ex:.28,tM:11,ns:240,tf:0.45},
  bipyramid:{wi:4.0, ex:.15,tM:6, ns:140,tf:0.1 },
  merkaba:  {wi:4.5, ex:.20,tM:6, ns:150,tf:0.3 },
  graine:   {wi:6.0, ex:.12,tM:5, ns:120,tf:0.0 },
  fleur:    {wi:6.0, ex:.16,tM:7, ns:170,tf:0.05},
  arbre:    {wi:5.5, ex:.17,tM:8, ns:155,tf:0.12},
  sphere:   {wi:6.0, ex:.28,tM:10,ns:200,tf:0.5 },
};

let _hpTarget=null;
var _gW=0,_gH=0,_gCx=0,_gCy=0;

// ── Palette 6 brins neon ──────────────────────────────────────────
const NS=6;
const SCOLS=[
  [[0,220,255],[0,255,160]],   // 0 Cyan→Aqua
  [[255,20,100],[200,80,255]], // 1 Rose→Violet
  [[255,200,0],[255,100,0]],   // 2 Or→Orange
  [[20,255,80],[0,200,200]],   // 3 Vert→Turquoise
  [[180,0,255],[60,120,255]],  // 4 Mauve→Bleu
  [[255,80,0],[255,220,60]],   // 5 Rouge→Ambre
];
const _SMID=SCOLS.map(c=>[(c[0][0]+c[1][0])>>1,(c[0][1]+c[1][1])>>1,(c[0][2]+c[1][2])>>1]);
function colA(p){const t=p<0?0:p>1?1:p,c=SCOLS[0];return`rgb(${c[0][0]+(c[1][0]-c[0][0])*t|0},${c[0][1]+(c[1][1]-c[0][1])*t|0},${c[0][2]+(c[1][2]-c[0][2])*t|0})`;}
function colB(p){const t=p<0?0:p>1?1:p,c=SCOLS[1];return`rgb(${c[0][0]+(c[1][0]-c[0][0])*t|0},${c[0][1]+(c[1][1]-c[0][1])*t|0},${c[0][2]+(c[1][2]-c[0][2])*t|0})`;}

// ── Projection — HP.ex module l'échelle globale ───────────────────
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

// ── Géométries sacrées 3D ─────────────────────────────────────────
const PHI=(1+Math.sqrt(5))/2;
const _geoCACHE={};

function _nrm(v,r=.38){
  let m=0;v.forEach(p=>{const d=Math.sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2]);if(d>m)m=d;});
  return m<1e-10?v:v.map(p=>[p[0]*r/m,p[1]*r/m,p[2]*r/m]);
}
function _d2(a,b){return(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;}
function _edgesByMin(verts,mul=1.05){
  let m=Infinity;
  for(let i=0;i<verts.length;i++) for(let j=i+1;j<verts.length;j++){const d=_d2(verts[i],verts[j]);if(d<m)m=d;}
  const thr=m*mul*mul+1e-6;
  const e=[];
  for(let i=0;i<verts.length;i++) for(let j=i+1;j<verts.length;j++)if(_d2(verts[i],verts[j])<=thr)e.push([i,j]);
  return e;
}

function _buildGeo(id){
  const P=PHI;let v=[],e=[];
  switch(id){
    case'metatron':{
      // Cuboctaèdre (12 sommets) + centre = 13 = Cube de Métatron
      v=[[0,0,0],[0,1,1],[0,1,-1],[0,-1,1],[0,-1,-1],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],[1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0]];
      v=_nrm(v,.38);
      for(let i=1;i<13;i++) e.push([0,i]); // rayon centre→sommet
      const out=v.slice(1);
      let md=Infinity;
      for(let i=0;i<out.length;i++) for(let j=i+1;j<out.length;j++){const d=_d2(out[i],out[j]);if(d<md)md=d;}
      const thr=md*1.05+1e-6;
      for(let i=0;i<out.length;i++) for(let j=i+1;j<out.length;j++)if(_d2(out[i],out[j])<=thr)e.push([i+1,j+1]);
      break;
    }
    case'dodeca':{
      const p=1/P;
      for(let a of[-1,1]) for(let b of[-1,1]) for(let c of[-1,1]) v.push([a,b,c]);
      for(let a of[-1,1]) for(let b of[-1,1]){v.push([0,a*P,b*p]);v.push([a*p,0,b*P]);v.push([a*P,b*p,0]);}
      v=_nrm(v,.38);e=_edgesByMin(v,1.04);
      break;
    }
    case'icosa':{
      for(let a of[-1,1]) for(let b of[-1,1]){v.push([0,a,b*P]);v.push([a,b*P,0]);v.push([a*P,0,b]);}
      v=_nrm(v,.38);e=_edgesByMin(v,1.04);
      break;
    }
    case'bipyramid':{
      // Bipyramide triangulaire — 5 sommets, 9 arêtes
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;v.push([Math.cos(a)*.32,0,Math.sin(a)*.32]);}
      v.push([0,.36,0]);v.push([0,-.36,0]);
      e=[[0,1],[1,2],[2,0],[0,3],[1,3],[2,3],[0,4],[1,4],[2,4]];
      break;
    }
    case'merkaba':{
      // Étoile tétraédrique — 2 tétraèdres imbriqués
      const r=.38/Math.sqrt(3);
      [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1],[-1,-1,-1],[1,1,-1],[1,-1,1],[-1,1,1]].forEach(p=>v.push([p[0]*r,p[1]*r,p[2]*r]));
      for(let a=0;a<4;a++) for(let b=a+1;b<4;b++){e.push([a,b]);e.push([a+4,b+4]);}
      e.push([0,5],[1,7],[2,6],[3,4]); // ponts étoile
      break;
    }
    case'graine':{
      // Graine de Vie — 7 cercles hexagonaux
      const rc=.19;
      v.push([0,0,0]);
      for(let i=0;i<6;i++){const a=i*Math.PI/3;v.push([rc*2*Math.cos(a),0,rc*2*Math.sin(a)]);}
      for(let i=1;i<=6;i++){e.push([0,i]);e.push([i,i%6+1]);}
      break;
    }
    case'fleur':{
      // Fleur de Vie — 19 centres (3 anneaux hexagonaux)
      const rc=.082;
      v.push([0,0,0]);
      for(let i=0;i<6;i++){const a=i*Math.PI/3;v.push([rc*2*Math.cos(a),0,rc*2*Math.sin(a)]);}
      for(let i=0;i<6;i++){const a=i*Math.PI/3+Math.PI/6;v.push([rc*2*Math.sqrt(3)*Math.cos(a),0,rc*2*Math.sqrt(3)*Math.sin(a)]);}
      for(let i=0;i<6;i++){const a=i*Math.PI/3;v.push([rc*4*Math.cos(a),0,rc*4*Math.sin(a)]);}
      for(let i=1;i<=6;i++){e.push([0,i]);e.push([i,i%6+1]);}
      for(let i=7;i<=12;i++){e.push([i-6,i]);e.push([i,i%6+7]);}
      for(let i=13;i<=18;i++){e.push([i-6,i]);e.push([i,i%6+13]);}
      break;
    }
    case'arbre':{
      // Arbre de Vie — 10 sephirot + 22 chemins
      const s=.36;
      v=[[0,s,0],[s*.55,s*.58,0],[-s*.55,s*.58,0],[s*.65,s*.08,0],[-s*.65,s*.08,0],[0,0,0],[s*.6,-s*.5,0],[-s*.6,-s*.5,0],[0,-s*.65,0],[0,-s,0]];
      e=[[0,1],[0,2],[0,5],[1,2],[1,3],[2,4],[3,4],[3,5],[3,6],[4,5],[4,7],[5,6],[5,7],[5,8],[5,9],[6,7],[6,8],[7,8],[8,9],[1,5],[2,5],[6,9]];
      break;
    }
    case'sphere':{
      // Sphère géodésique — icosaèdre + anneaux de latitude
      for(let a of[-1,1]) for(let b of[-1,1]){v.push([0,a,b*P]);v.push([a,b*P,0]);v.push([a*P,0,b]);}
      v=_nrm(v,.38);e=_edgesByMin(v,1.04);
      for(let lat=1;lat<8;lat++){
        const y=.38*Math.cos(lat*Math.PI/8),r=.38*Math.sin(lat*Math.PI/8);
        const np=Math.max(8,Math.round(r/.38*24));
        const st=v.length;
        for(let i=0;i<np;i++){const a=i*2*Math.PI/np;v.push([r*Math.cos(a),y,r*Math.sin(a)]);}
        for(let i=0;i<np;i++) e.push([st+i,st+(i+1)%np]);
      }
      break;
    }
  }
  return{verts:v,edges:e};
}
function _getGeo(id){return _geoCACHE[id]||(_geoCACHE[id]=_buildGeo(id));}

// ── Wireframe 3 passes bloom ──────────────────────────────────────
function drawGeoWire(ctx,verts,edges){
  const gl=HP.gl;
  const pv=verts.map(v=>proj(v[0],v[1],v[2]));
  const N=edges.length;
  // Tri back-to-front
  const idx=[...Array(N).keys()].sort((a,b)=>{
    const za=(pv[edges[a][0]].z+pv[edges[a][1]].z)/2;
    const zb=(pv[edges[b][0]].z+pv[edges[b][1]].z)/2;
    return zb-za;
  });
  const draw=(ei,lw,al,colFn)=>{
    const[ai,bi]=edges[ei];
    const pa=pv[ai],pb=pv[bi],af=(pa.fov+pb.fov)/2;
    ctx.lineWidth=lw*af*V.zoom;
    ctx.globalAlpha=Math.min(.98,al*af);
    ctx.strokeStyle=colFn(ei%NS);
    ctx.beginPath();ctx.moveTo(pa.sx,pa.sy);ctx.lineTo(pb.sx,pb.sy);ctx.stroke();
  };
  ctx.globalAlpha=1;
  idx.forEach(ei=>draw(ei,9*gl, gl*.10, ci=>`rgb(${SCOLS[ci][0]})`));
  idx.forEach(ei=>draw(ei,3*gl, gl*.32, ci=>`rgb(${_SMID[ci]})`));
  idx.forEach(ei=>draw(ei,.9,   .86,    ci=>`rgb(${SCOLS[ci][1]})`));
  ctx.globalAlpha=1;
}

// ── Flux style sphere432-maxexp — comètes le long des arêtes ──────
var FLUX_T=0;
var _edgeFlux=[];
var _prevGeoId='';

function _syncFlux(geoId,edges){
  if(_prevGeoId===geoId) return;
  _prevGeoId=geoId;
  _edgeFlux=edges.map((e,i)=>({
    phase:i/Math.max(1,edges.length),
    speed:.006+Math.random()*.016,
    col:i%NS
  }));
}

function drawFluxEdge(ctx,verts,edges){
  if(!HP.br) return;
  // HP.wi module la vitesse (6.0=normal, 9.0=rapide), HP.f=freq binaural/432
  FLUX_T+=.012*V.spd*(HP.wi/6.0)*HP.f;
  for(let ei=0;ei<edges.length;ei++){
    const flx=_edgeFlux[ei];if(!flx)continue;
    const[ai,bi]=edges[ei];
    const A=verts[ai],B=verts[bi];
    const m=_SMID[flx.col];
    const t=(FLUX_T*flx.speed+flx.phase)%1;
    const tLen=.30,t0=Math.max(0,t-tLen);
    // Traîne de comète (18 points, smooth quadraticCurveTo)
    const PTS=[];
    for(let j=0;j<=18;j++){
      const tj=t0+(t-t0)*j/18;
      PTS.push(proj(A[0]+(B[0]-A[0])*tj,A[1]+(B[1]-A[1])*tj,A[2]+(B[2]-A[2])*tj));
    }
    const alpha=.44*(0.5+0.5*Math.sin(FLUX_T*3.8+flx.phase*6.28));
    ctx.strokeStyle=`rgb(${m})`;
    ctx.lineWidth=1.6;
    ctx.globalAlpha=alpha;
    ctx.beginPath();
    ctx.moveTo(PTS[0].sx,PTS[0].sy);
    for(let j=1;j<PTS.length-1;j++){
      const mx=(PTS[j].sx+PTS[j+1].sx)/2,my=(PTS[j].sy+PTS[j+1].sy)/2;
      ctx.quadraticCurveTo(PTS[j].sx,PTS[j].sy,mx,my);
    }
    ctx.lineTo(PTS[PTS.length-1].sx,PTS[PTS.length-1].sy);
    ctx.stroke();
    // Pointe lumineuse (tip)
    const tp=PTS[PTS.length-1];
    ctx.shadowColor=`rgb(${m})`;ctx.shadowBlur=9;
    ctx.fillStyle=`rgb(${m})`;ctx.globalAlpha=.88*tp.fov;
    ctx.beginPath();ctx.arc(tp.sx,tp.sy,2.8,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
  }
  ctx.globalAlpha=1;
}

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

// ── Particules — orbite sphérique (style sphere432) ───────────────
var PARTS=[];
function initParts(){
  PARTS=[];
  for(let i=0;i<72;i++){
    PARTS.push({
      strand:i%NS,
      r:.32+Math.random()*.10,
      phi:Math.acos(2*Math.random()-1),
      theta:Math.random()*Math.PI*2,
      dtheta:(Math.random()-.5)*.018,
      dphi:(Math.random()-.5)*.012,
      sz:1.2+Math.random()*2.4,
      pw:Math.random()*Math.PI*2
    });
  }
}

function drawParts(ctx){
  if(!HP.pa) return;
  // Mobile : plafonne le nombre de particules rendues (CPU → audio stable).
  const _src=((window.innerWidth<=900||window.innerHeight<=500)&&PARTS.length>90)?PARTS.slice(0,90):PARTS;
  const list=[];
  for(const pt of _src){
    pt.theta+=pt.dtheta*V.spd*HP.f;
    pt.phi+=pt.dphi*V.spd;
    const x=pt.r*Math.sin(pt.phi)*Math.cos(pt.theta);
    const y=pt.r*Math.cos(pt.phi);
    const z=pt.r*Math.sin(pt.phi)*Math.sin(pt.theta);
    const p=proj(x,y,z);
    list.push({sx:p.sx,sy:p.sy,fov:p.fov,z:p.z,pt});
  }
  list.sort((a,b)=>a.z-b.z);
  for(const{sx,sy,fov,pt}of list){
    const m=_SMID[pt.strand];
    const puls=.65+.35*Math.sin(V.t*4.8+pt.pw);
    const sz=pt.sz*fov*puls;
    const alpha=Math.max(.04,.52*fov);
    ctx.fillStyle=`rgba(${m},${(alpha*.12).toFixed(3)})`;
    ctx.globalAlpha=1;
    ctx.beginPath();ctx.arc(sx,sy,sz*3.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(${m},${alpha.toFixed(3)})`;
    ctx.beginPath();ctx.arc(sx,sy,sz,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
}

// ── Labels positionnés sur les sommets de la géométrie ───────────
function drawLabels(ctx){
  if(!HP.la) return;
  const geo=_geoCACHE[GEO_IDS[activeGeometry]];
  if(!geo||geo.verts.length<2) return;
  const lbs=[['· 432 ·','rgba(232,160,32,.88)'],['72 Ω','rgba(0,220,255,.65)'],['∞','rgba(255,20,100,.55)'],['360','rgba(255,215,0,.42)']];
  ctx.font="10px 'IM Fell English'";
  lbs.forEach(([txt,col],i)=>{
    const vi=Math.floor(i*geo.verts.length/lbs.length);
    const v=geo.verts[vi];
    const p=proj(v[0]+.02,v[1],v[2]);
    ctx.fillStyle=col;
    ctx.globalAlpha=Math.max(0,.88*p.fov);
    ctx.fillText(txt,p.sx+8,p.sy-5);
  });
  ctx.globalAlpha=1;
}

// ── Sélection géométrie ───────────────────────────────────────────
function setGeometry(g){
  if(g===activeGeometry&&!AE.on) return;
  activeGeometry=g;
  const preset=GEO_PRESETS[GEO_IDS[g]];
  if(preset){
    _hpTarget={...preset};
    if(AE.on){AE.baseWi=preset.wi;AE.baseEx=preset.ex;AE.baseTM=preset.tM;}
  }
  document.querySelectorAll('.geometry-btn').forEach((btn,i)=>{
    btn.classList.toggle('active',i===g);
  });
}

// ── Callbacks sliders ─────────────────────────────────────────────
function g3dSetWi(v){
  HP.wi=v/10;
  const el=document.getElementById('sv-wi');if(el)el.textContent=HP.wi.toFixed(1)+'×';
  if(_hpTarget)_hpTarget.wi=HP.wi;
  if(AE.on)AE.baseWi=HP.wi;
}
function g3dSetNs(v){HP.ns=parseInt(v);const el=document.getElementById('sv-ns');if(el)el.textContent=v;}
function g3dSetSpd(v){V.spd=v/10;const el=document.getElementById('sv-spd');if(el)el.textContent=V.spd.toFixed(1)+'×';}
function g3dSetEx(v){
  HP.ex=v/100;
  const el=document.getElementById('sv-ex');if(el)el.textContent=HP.ex.toFixed(2);
  if(_hpTarget)_hpTarget.ex=HP.ex;
  if(AE.on)AE.baseEx=HP.ex;
}
function g3dSetTM(v){
  HP.tM=v/10;
  const el=document.getElementById('sv-tm');if(el)el.textContent=HP.tM.toFixed(1);
  if(_hpTarget)_hpTarget.tM=HP.tM;
  if(AE.on)AE.baseTM=HP.tM;
}
function g3dSetGlow(v){HP.gl=v/100;const el=document.getElementById('sv-glow');if(el)el.textContent=v+'%';}
function g3dToggleAE(on){
  AE.on=on;AE.phase=0;AE.counter=0;
  if(on){AE.baseWi=HP.wi;AE.baseEx=HP.ex;AE.baseTM=HP.tM;}
}
function g3dSetAESpd(v){AE.spd=v/10;const el=document.getElementById('sv-ae-spd');if(el)el.textContent=AE.spd.toFixed(1)+'×';}

// ── Boucle principale ─────────────────────────────────────────────
let _lastMeta=0;
function drawMetatron(){
  // Cap ~30 fps : morphing lent → invisible à l'œil, mais l'audio récupère
  // le CPU → zéro underrun, zéro déchirement.
  const _now=performance.now();
  if(_now-_lastMeta<32) return;
  _lastMeta=_now;
  const cv=document.getElementById('meta-canvas');
  if(!cv) return;
  // Cap du devicePixelRatio (rétina ×3 mobile = CPU brutal → craquement)
  const _mob=window.innerWidth<=900||window.innerHeight<=500;
  const dpr=Math.min(window.devicePixelRatio||1, _mob?1.5:2);
  const vw=window.innerWidth,vh=window.innerHeight;
  const nW=Math.round(vw*dpr),nH=Math.round(vh*dpr);
  if(cv.width!==nW||cv.height!==nH){
    cv.width=nW;cv.height=nH;
    cv.style.width=vw+'px';cv.style.height=vh+'px';
    mandCache=null;
  }
  const ctx=cv.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  _gW=vw;_gH=vh;_gCx=vw/2;_gCy=vh/2;

  // Canvas transparent : le fond #cosmic-bg (DOM, z-index -1) passe au travers.
  // On NE re-blitte PLUS l'image 2,2 MB plein écran chaque frame (gain CPU majeur).
  ctx.clearRect(0,0,vw,vh);
  ctx.globalAlpha=1;

  // Mandala
  if(!mandCache) buildMC();
  if(HP.ma&&mandCache){
    mandRot+=.00022;
    ctx.save();ctx.translate(_gCx,_gCy);ctx.rotate(mandRot);ctx.translate(-_gCx,-_gCy);
    ctx.globalAlpha=.14;ctx.drawImage(mandCache,0,0);ctx.restore();
  }
  ctx.globalAlpha=1;

  // T(Fréquences) — couplage binaural
  if(typeof masterFreq!=='undefined'&&masterFreq>0) HP.f=masterFreq/432;
  else HP.f=1;

  // Rotation douce
  V.rx+=(V.trx-V.rx)*.06;V.ry+=(V.try_-V.ry)*.06;V.zoom+=(V.tzoom-V.zoom)*.08;
  if(V.autoRot) V.try_+=.0025*V.spd;

  // Respiration et morphing
  HP.breathe=1+.07*Math.sin(V.t*.5);
  TF.val+=(TF.target-TF.val)*.022;

  if(_hpTarget&&!AE.on){
    const lr=.025;
    HP.wi+=(_hpTarget.wi-HP.wi)*lr;
    HP.ex+=(_hpTarget.ex-HP.ex)*lr;
    HP.tM+=(_hpTarget.tM-HP.tM)*lr;
    TF.target+=(_hpTarget.tf-TF.target)*lr;
    if(Math.abs(HP.wi-_hpTarget.wi)<.005)_hpTarget=null;
  }

  // Auto-Évolution
  if(AE.on){
    AE.phase+=.016*AE.spd;
    HP.wi=AE.baseWi*(1+.30*Math.sin(AE.phase*.70));
    HP.ex=AE.baseEx*(1+.24*Math.sin(AE.phase*1.10+1.2));
    TF.target=Math.max(0,Math.min(1,.35+.40*Math.sin(AE.phase*.30)));
    AE.counter++;
    const fi=Math.round(Math.max(90,900/AE.spd));
    if(AE.counter>=fi){
      AE.counter=0;
      const next=(activeGeometry+1)%GEO_NAMES.length;
      activeGeometry=next;_prevGeoId=''; // force reinit flux
      document.querySelectorAll('.geometry-btn').forEach((btn,i)=>btn.classList.toggle('active',i===next));
    }
  }

  // Géométrie active
  const gId=GEO_IDS[activeGeometry];
  const geo=_getGeo(gId);
  _syncFlux(gId,geo.edges);

  // Rendu : wireframe → flux arêtes → centre → particules → labels
  drawGeoWire(ctx,geo.verts,geo.edges);
  drawFluxEdge(ctx,geo.verts,geo.edges);
  drawCenter(ctx);
  drawParts(ctx);
  drawLabels(ctx);

  V.t+=.016*V.spd;
}

// ── Drag / zoom canvas ────────────────────────────────────────────
let _lastPinch=0;
function g3dInitDrag(){
  const cv=document.getElementById('meta-canvas');
  if(!cv||cv._g3dDrag) return;
  cv._g3dDrag=true;
  cv.addEventListener('mousedown',e=>{
    V.drag=true;V.lmx=e.clientX;V.lmy=e.clientY;
    V.autoRot=false;
    const ck=document.getElementById('ckRot');if(ck)ck.checked=false;
    cv.style.cursor='grabbing';
  });
  window.addEventListener('mouseup',()=>{V.drag=false;cv.style.cursor='grab';});
  window.addEventListener('mousemove',e=>{
    if(!V.drag) return;
    V.try_+=(e.clientX-V.lmx)*.008;
    V.trx=Math.max(-1.4,Math.min(1.4,V.trx+(e.clientY-V.lmy)*.008));
    V.lmx=e.clientX;V.lmy=e.clientY;
  });
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    V.tzoom=Math.max(.3,Math.min(3,V.tzoom*(e.deltaY>0?.92:1.09)));
  },{passive:false});
  cv.addEventListener('touchstart',e=>{
    if(e.touches.length===1){
      V.drag=true;V.lmx=e.touches[0].clientX;V.lmy=e.touches[0].clientY;V.autoRot=false;
    } else if(e.touches.length===2){
      V.drag=false;
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      _lastPinch=Math.sqrt(dx*dx+dy*dy);
    }
  },{passive:true});
  cv.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length===2){
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(_lastPinch>0) V.tzoom=Math.max(.3,Math.min(3,V.tzoom*dist/_lastPinch));
      _lastPinch=dist;
    } else if(e.touches.length===1&&V.drag){
      V.try_+=(e.touches[0].clientX-V.lmx)*.008;
      V.trx+=(e.touches[0].clientY-V.lmy)*.008;
      V.lmx=e.touches[0].clientX;V.lmy=e.touches[0].clientY;
    }
  },{passive:false});
  cv.addEventListener('touchend',()=>{V.drag=false;_lastPinch=0;});
  cv.style.cursor='grab';cv.style.pointerEvents='auto';
}

function animMetatron(){
  if(!masterRAF) masterTick();
  initParts();
  g3dInitDrag();
}
