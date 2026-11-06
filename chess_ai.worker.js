// Chess opponent for Marina's Lost Pups. Runs off the main thread.
// Rules match src/mode_chess.js (ChessRules). Easy: mostly random, sometimes a capture.
// Normal: depth-2 material. Hard: iterative alpha-beta with piece-square tables, capped at 200ms.
const R={};
const N=[-17,-15,-10,-6,6,10,15,17],KD=[-9,-8,-7,-1,1,7,8,9];
const isW=p=>p&&p===p.toUpperCase(),col=p=>p?(isW(p)?'w':'b'):null;
const rc=s=>[s>>3,s&7],on=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
R.START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
R.fromFEN=f=>{const [b,t,ca,ep,hm,fm]=f.trim().split(/\s+/),bd=[];for(const ch of b.replace(/\//g,''))if(/\d/.test(ch))for(let i=0;i<+ch;i++)bd.push(null);else bd.push(ch);
 const s={b:bd,turn:t||'w',cas:ca&&ca!=='-'?ca:'',ep:-1,hm:+hm||0,fm:+fm||1,hist:[]};if(ep&&ep!=='-')s.ep=(8-+ep[1])*8+(ep.charCodeAt(0)-97);s.hist.push(R.key(s));return s;};
R.key=s=>s.b.map(p=>p||'.').join('')+s.turn+s.cas+(R.epUsable(s)?s.ep:'');
R.epUsable=s=>{if(s.ep<0)return false;const [r,c]=rc(s.ep),pr=s.turn==='w'?r+1:r-1,P=s.turn==='w'?'P':'p';return [c-1,c+1].some(cc=>on(pr,cc)&&s.b[pr*8+cc]===P);};
R.attacked=(b,sq,by)=>{const [r,c]=rc(sq);
 const pd=by==='w'?1:-1;for(const dc of[-1,1]){const rr=r+pd,cc=c+dc;if(on(rr,cc)&&b[rr*8+cc]===(by==='w'?'P':'p'))return true;}
 for(const [dr,dc] of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){const rr=r+dr,cc=c+dc;if(on(rr,cc)&&b[rr*8+cc]===(by==='w'?'N':'n'))return true;}
 for(const [dr,dc] of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){const rr=r+dr,cc=c+dc;if(on(rr,cc)&&b[rr*8+cc]===(by==='w'?'K':'k'))return true;}
 const sl=(dirs,ps)=>{for(const [dr,dc] of dirs){let rr=r+dr,cc=c+dc;while(on(rr,cc)){const p=b[rr*8+cc];if(p){if(col(p)===by&&ps.includes(p.toUpperCase()))return true;break;}rr+=dr;cc+=dc;}}return false;};
 return sl([[-1,0],[1,0],[0,-1],[0,1]],'RQ')||sl([[-1,-1],[-1,1],[1,-1],[1,1]],'BQ');};
R.kingSq=(b,c)=>b.indexOf(c==='w'?'K':'k');
R.inCheck=(s,c=s.turn)=>R.attacked(s.b,R.kingSq(s.b,c),c==='w'?'b':'w');
R.pseudo=s=>{const b=s.b,me=s.turn,op=me==='w'?'b':'w',mv=[];
 for(let sq=0;sq<64;sq++){const p=b[sq];if(!p||col(p)!==me)continue;const [r,c]=rc(sq),T=p.toUpperCase();
  const add=(to,x={})=>mv.push(Object.assign({from:sq,to,p},x));
  if(T==='P'){const d=me==='w'?-1:1,st=me==='w'?6:1,last=me==='w'?0:7,pro=to=>(to>>3)===last;
   const push=(to,x)=>{if(pro(to))for(const q of'QRBN')add(to,Object.assign({promo:me==='w'?q:q.toLowerCase()},x));else add(to,x);};
   if(on(r+d,c)&&!b[(r+d)*8+c]){push((r+d)*8+c);if(r===st&&!b[(r+2*d)*8+c])add((r+2*d)*8+c,{dbl:true});}
   for(const dc of[-1,1]){const rr=r+d,cc=c+dc;if(!on(rr,cc))continue;const t=rr*8+cc;if(b[t]&&col(b[t])===op)push(t);else if(t===s.ep)add(t,{ep:true});}}
  else if(T==='N'||T==='K'){const ds=T==='N'?[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
   for(const [dr,dc] of ds){const rr=r+dr,cc=c+dc;if(on(rr,cc)&&col(b[rr*8+cc])!==me)add(rr*8+cc);}
   if(T==='K'){const home=me==='w'?60:4,K=me==='w'?'K':'k',Q=me==='w'?'Q':'q';
    if(sq===home&&!R.attacked(b,sq,op)){
     if(s.cas.includes(K)&&!b[sq+1]&&!b[sq+2]&&b[sq+3]===(me==='w'?'R':'r')&&!R.attacked(b,sq+1,op)&&!R.attacked(b,sq+2,op))add(sq+2,{castle:'K'});
     if(s.cas.includes(Q)&&!b[sq-1]&&!b[sq-2]&&!b[sq-3]&&b[sq-4]===(me==='w'?'R':'r')&&!R.attacked(b,sq-1,op)&&!R.attacked(b,sq-2,op))add(sq-2,{castle:'Q'});}}}
  else{const ds=T==='R'?[[-1,0],[1,0],[0,-1],[0,1]]:T==='B'?[[-1,-1],[-1,1],[1,-1],[1,1]]:[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
   for(const [dr,dc] of ds){let rr=r+dr,cc=c+dc;while(on(rr,cc)){const t=rr*8+cc;if(b[t]){if(col(b[t])===op)add(t);break;}add(t);rr+=dr;cc+=dc;}}}}
 return mv;};
R.apply=(s,m)=>{const b=s.b.slice(),me=s.turn;let cap=b[m.to];b[m.to]=m.promo||m.p;b[m.from]=null;
 if(m.ep){const cs=m.to+(me==='w'?8:-8);cap=b[cs];b[cs]=null;}
 if(m.castle==='K'){b[m.to-1]=b[m.to+1];b[m.to+1]=null;}if(m.castle==='Q'){b[m.to+1]=b[m.to-2];b[m.to-2]=null;}
 let cas=s.cas;const strip=sq=>{if(sq===60)cas=cas.replace(/[KQ]/g,'');if(sq===4)cas=cas.replace(/[kq]/g,'');if(sq===63)cas=cas.replace('K','');if(sq===56)cas=cas.replace('Q','');if(sq===7)cas=cas.replace('k','');if(sq===0)cas=cas.replace('q','');};
 strip(m.from);strip(m.to);
 const n={b,turn:me==='w'?'b':'w',cas,ep:m.dbl?(m.from+m.to)/2:-1,hm:(m.p.toUpperCase()==='P'||cap)?0:s.hm+1,fm:s.fm+(me==='b'?1:0),hist:s.hist,cap};
 n.hist=s.hist.concat([R.key(n)]);return n;};
R.legal=s=>R.pseudo(s).filter(m=>{const n=R.apply(s,m);return !R.attacked(n.b,R.kingSq(n.b,s.turn),n.turn);});
R.insufficient=b=>{const ps=[];b.forEach((p,i)=>{if(p&&p.toUpperCase()!=='K')ps.push([p.toUpperCase(),i]);});
 if(!ps.length)return true;if(ps.some(([t])=>'PRQ'.includes(t)))return false;
 if(ps.length===1)return true;// K+B or K+N vs K
 if(ps.every(([t])=>t==='B')){const sc=ps.map(([,i])=>((i>>3)+(i&7))%2);return sc.every(x=>x===sc[0]);}// bishops all on one colour
 return false;};
// status: {over, result:'w'|'b'|'draw'|null, why}
R.status=s=>{const lg=R.legal(s);
 if(!lg.length)return R.inCheck(s)?{over:true,result:s.turn==='w'?'b':'w',why:'Checkmate'}:{over:true,result:'draw',why:'Stalemate'};
 if(R.insufficient(s.b))return{over:true,result:'draw',why:'Insufficient material'};
 if(s.hm>=100)return{over:true,result:'draw',why:'50-move rule'};
 const k=s.hist[s.hist.length-1];if(s.hist.filter(x=>x===k).length>=3)return{over:true,result:'draw',why:'Threefold repetition'};
 return{over:false,result:null,why:R.inCheck(s)?'Check':''};};
R.fen=s=>{let o='';for(let r=0;r<8;r++){let e=0;for(let c=0;c<8;c++){const p=s.b[r*8+c];if(!p)e++;else{if(e)o+=e;e=0;o+=p;}}if(e)o+=e;if(r<7)o+='/';}
 const ep=s.ep>=0?String.fromCharCode(97+(s.ep&7))+(8-(s.ep>>3)):'-';return o+' '+s.turn+' '+(s.cas||'-')+' '+ep+' '+s.hm+' '+s.fm;};
R.sqName=i=>String.fromCharCode(97+(i&7))+(8-(i>>3));

const VAL={P:100,N:320,B:330,R:500,Q:900,K:20000};
function center(scale){const t=new Array(64);for(let i=0;i<64;i++){const r=i>>3,c=i&7;t[i]=Math.round((Math.min(r,7-r)+Math.min(c,7-c)-3)*scale);}return t;}
const PST={N:center(8),B:center(5),R:center(2),Q:center(1),K:center(-6),P:(()=>{const t=new Array(64);for(let i=0;i<64;i++){const r=i>>3,c=i&7;t[i]=r===0||r===7?0:Math.round((6-r)*6+Math.max(0,2-Math.abs(c-3.5)));}return t;})()};
function evaluate(s){let sc=0;for(let i=0;i<64;i++){const p=s.b[i];if(!p)continue;const T=p.toUpperCase(),white=p===T,pst=PST[T]?PST[T][white?i:(i^56)]:0,v=(VAL[T]||0)+pst;sc+=white?v:-v;}return s.turn==='w'?sc:-sc;}
let nodes=0;
function negamax(s,depth,alpha,beta,deadline){if((++nodes&255)===0&&performance.now()>deadline)throw 'time';
 const st=R.status(s);if(st.over){if(st.result==='draw')return 0;return -40000-depth;}
 if(depth<=0)return evaluate(s);
 const moves=R.legal(s);moves.sort((a,b)=>((s.b[b.to]||b.ep)?1:0)-((s.b[a.to]||a.ep)?1:0));
 let best=-1e9;for(const m of moves){const sc=-negamax(R.apply(s,m),depth-1,-beta,-alpha,deadline);if(sc>best)best=sc;if(sc>alpha)alpha=sc;if(alpha>=beta)break;}return best;}
function easyMove(s){const legal=R.legal(s);if(!legal.length)return null;const caps=legal.filter(m=>s.b[m.to]||m.ep);if(caps.length&&Math.random()<0.15)return caps[(Math.random()*caps.length)|0];return legal[(Math.random()*legal.length)|0];}
function choose(s,level,budgetMs){const legal=R.legal(s);if(!legal.length)return null;if(level==='easy')return{move:easyMove(s),score:0,depth:0};
 const maxDepth=level==='hard'?4:2,budget=Math.min(200,Math.max(20,+budgetMs||(level==='hard'?120:80))),deadline=performance.now()+budget;
 nodes=0;let best=legal[0],score=0,depthDone=0;
 const ordered=legal.slice().sort((a,b)=>((s.b[b.to]||b.ep)?1:0)-((s.b[a.to]||a.ep)?1:0));
 try{for(let depth=1;depth<=maxDepth;depth++){let localBest=ordered[0],localScore=-1e9,alpha=-1e9,beta=1e9;const seq=[best].concat(ordered.filter(m=>m!==best));
  for(const m of seq){if(depth>1&&performance.now()>deadline)throw 'time';const sc=-negamax(R.apply(s,m),depth-1,-beta,-alpha,deadline);if(sc>localScore){localScore=sc;localBest=m;}if(sc>alpha)alpha=sc;}
  best=localBest;score=localScore;depthDone=depth;const i=ordered.indexOf(best);if(i>0){ordered.splice(i,1);ordered.unshift(best);}}}catch(e){}
 return{move:best,score,depth:depthDone};}
function hintMoves(s,level,budgetMs){const legal=R.legal(s);if(!legal.length)return [];
 if(level==='easy'){const caps=legal.filter(m=>s.b[m.to]||m.ep);const bag=(caps.length?caps:legal).slice();bag.sort(()=>Math.random()-.5);return bag.slice(0,2);}
 const deadline=performance.now()+Math.min(200,+budgetMs||80);const scored=[];
 for(const m of legal){if(performance.now()>deadline&&scored.length)break;let sc=0;try{sc=-negamax(R.apply(s,m),level==='hard'?2:1,-1e9,1e9,deadline);}catch(e){sc=-1e8;}scored.push({m,sc});}
 scored.sort((a,b)=>b.sc-a.sc);const out=[];for(const x of scored){if(out.length>=2)break;if(!out.some(y=>y.to===x.m.to))out.push(x.m);}return out;}
self.onmessage=function(e){const msg=e.data||{},t0=performance.now();
 try{const s=R.fromFEN(msg.fen);if(msg.kind==='hint'){const hs=hintMoves(s,msg.level||'normal',msg.budgetMs);
  self.postMessage({id:msg.id,hints:hs.map(m=>({from:m.from,to:m.to,promo:m.promo||null})),ms:Math.round(performance.now()-t0)});return;}
  const picked=choose(s,msg.level||'normal',msg.budgetMs);const m=picked&&picked.move;if(!m){self.postMessage({id:msg.id,error:'no move'});return;}
  self.postMessage({id:msg.id,from:m.from,to:m.to,promo:m.promo||null,score:picked.score||0,depth:picked.depth||0,ms:Math.round(performance.now()-t0)});}
 catch(err){self.postMessage({id:msg.id,error:String(err&&err.message||err)});}};
