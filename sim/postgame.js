// From sim/endstate.json: siphon 100%, even core split, auto everything; check Mass and elements over time.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const code=['js/util.js','js/data.js','js/game.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n')+'\n;this.G={get S(){return S},set S(v){S=v},D,tick,recompute,fmt,totalCores,checkAchievements};';
const ctx={console,Math,Date,JSON,Object,Array,Number,String};vm.createContext(ctx);vm.runInContext(code,ctx);const G=ctx.G;
G.S=JSON.parse(fs.readFileSync(path.join(__dirname,'endstate.json')));
const S=G.S; S.siphon=1; S.auto.nova=true; S.auto.novaMode='time'; S.auto.novaValue=600; S.auto.collapse=false;
const n=G.totalCores(); S.fusion.cores=[0,0,0,0,0,0]; for(let i=0;i<n;i++) S.fusion.cores[i%6]++;
G.recompute();
for(let t=0;t<=3600;t+=0.5){ G.tick(0.5,true); if(t%300===0) console.log(t/60+'m','mass='+G.fmt(S.mass),'el='+S.fusion.el.map(x=>G.fmt(x)).join(','),'best='+G.fmt(S.run.best), 'cores='+S.fusion.cores.join('')); }
