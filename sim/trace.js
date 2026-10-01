// quick trace of early game
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const code=['js/util.js','js/data.js','js/game.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n')+'\n;this.G={get S(){return S},set S(v){S=v},D,newState,tick,recompute,maxAll,buyAllUpgrades,clickStar,ignite,canIgnite,flare,canFlare,fmt,globalMultParts};';
const ctx={console,Math,Date,JSON,Object,Array,Number,String};vm.createContext(ctx);vm.runInContext(code,ctx);const G=ctx.G;
G.S=G.newState();G.recompute();
const CPS=+process.argv[2]||5, END=+process.argv[3]||300;
for(let t=0;t<END;t+=0.25){
  for(let i=0;i<CPS/4;i++)G.clickStar();
  G.tick(0.25,true);
  if(t%1===0){G.maxAll();G.buyAllUpgrades();if(G.canFlare())G.flare();else if(G.canIgnite())G.ignite();}
  if(t%10===0){const s=G.S;console.log(t, 'L='+G.fmt(s.light),'lps='+G.fmt(G.D.lps),'click='+G.fmt(G.D.clickValue),'heat='+s.heat.toFixed(0),'ign='+s.ignitions,'fl='+s.flares,'pul='+s.pulses,'gens='+s.gens.map(g=>g.bought).join('/'),'glob='+G.fmt(G.D.global),'upg='+Object.keys(s.upgrades).length);}
}
