// measure time to reach thresholds with an extra global (G) or per-tier (T) multiplier
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
let code=['js/util.js','js/data.js','js/game.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n');
code=code.replace("function tierMult(k) {\n  let m = 1;","function tierMult(k) {\n  let m = EXT_T;").replace("const p = [];","const p = [['ext', EXT_G]];");
function run(G,T,cps){
  const ctx={console,Math,Date,JSON,Object,Array,Number,String,EXT_G:G,EXT_T:T};vm.createContext(ctx);
  vm.runInContext(code+'\n;this.G={get S(){return S},D,newState,tick,recompute,maxAll,buyAllUpgrades,clickStar,ignite,canIgnite,flare,canFlare,set S(v){S=v}};',ctx);const g=ctx.G;
  g.S=g.newState();g.recompute();const out={};
  for(let t=0;t<3600;t+=0.25){
    for(let i=0;i<cps/4;i++)g.clickStar();
    g.tick(0.25,true);
    if(t%1===0){g.maxAll();g.buyAllUpgrades();if(g.canFlare())g.flare();else if(g.canIgnite())g.ignite();}
    for(const th of [1e10,1e20,1e30,1e40,1e50,1e60,1e80]) if(!out[th]&&g.S.light>=th) out[th]=t;
  }
  return Object.entries(out).map(([k,v])=>'1e'+Math.log10(k).toFixed(0)+'@'+(v/60).toFixed(1)+'m').join(' ');
}
for (const [G,T] of [[1,1],[10,1],[1e3,1],[1e6,1],[1,2],[1,5],[1,10]]) console.log('G='+G,'T='+T, run(G,T,3));
