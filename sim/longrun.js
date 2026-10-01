// From sim/endstate.json, do one long run (no prestige) and log growth.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const code=['js/util.js','js/data.js','js/game.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n')+'\n;this.G={get S(){return S},set S(v){S=v},D,tick,recompute,maxAll,buyAllUpgrades,clickStar,ignite,canIgnite,flare,canFlare,fmt,resetRun,perTen,pulseBase,flareReq,ignitionReq,lightExponent};';
const ctx={console,Math,Date,JSON,Object,Array,Number,String};vm.createContext(ctx);vm.runInContext(code,ctx);const G=ctx.G;
G.S=JSON.parse(fs.readFileSync(path.join(__dirname,'endstate.json')));
const S=G.S; S.auto.nova=false; S.auto.collapse=false; S.trial=null; G.resetRun(); G.recompute();
for(let t=0;t<=+(process.argv[2]||1800);t+=0.5){
  G.tick(0.5,true);
  if(t%1===0){G.maxAll();G.buyAllUpgrades();}
  if(t%30===0) console.log(t,'L='+G.fmt(S.light),'ign='+S.ignitions,'fl='+S.flares,'pul='+S.pulses,'q='+S.gens[7].bought,'perTen='+G.perTen().toFixed(2),'pB='+G.pulseBase().toFixed(3),'exp='+G.lightExponent().toFixed(3),'flReq='+G.flareReq(), 'tierShared='+G.fmt(G.D.tierShared), 'glob='+G.fmt(G.D.global));
}
