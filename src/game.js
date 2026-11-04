import * as B from '@babylonjs/core';

const TOWERS = Object.freeze({
  gunner: { name:'Gunner', cost:50, range:6, damage:8, reload:0.3, projectileSpeed:18, color:'#9eafb5' },
  mortar: { name:'Мортира', cost:100, range:9, damage:50, reload:3, projectileSpeed:10, splash:2.5, color:'#7f8990' },
  magic: { name:'Магическая', cost:90, range:4, damage:15, reload:1, chain:3, color:'#9d7be8' }
});
const CONFIG = Object.freeze({
  startingGold:100, baseHealth:20,
  enemiesPerWave:wave=>8+wave*2, spawnInterval:0.85,
  enemy:{hp:40,speed:2,reward:10,baseDamage:1},
  upgradeCosts:[40,60], sellRate:0.5
});

export function attachGame({B:Babylon,scene,engine,curve,pads}) {
  const $=id=>document.getElementById(id);
  const ui={
    gold:$('goldValue'),base:$('baseValue'),wave:$('waveValue'),kills:$('killsValue'),
    start:$('startWave'),pause:$('pauseGame'),speed:$('gameSpeed'),
    selected:$('selectedPad'),message:$('gameMessage'),
    menu:$('contextMenu'),menuTitle:$('contextTitle'),menuInfo:$('contextInfo'),
    buildButtons:[...document.querySelectorAll('[data-build]')],
    upgrade:$('upgradeTower'),sell:$('sellTower'),close:$('closeContext')
  };
  const path=curve.map(p=>p.clone()), lengths=[0];
  for(let i=1;i<path.length;i++)lengths.push(lengths[i-1]+B.Vector3.Distance(path[i-1],path[i]));
  const pathLength=lengths.at(-1), enemies=[],towers=[],projectiles=[],effects=[];
  let gold=CONFIG.startingGold,baseHealth=CONFIG.baseHealth,wave=0,kills=0;
  let spawnLeft=0,spawnTimer=0,active=false,paused=false,speed=1,selectedPad=-1,gameOver=false,started=false,intermissionLeft=0,intermissionShown=0;
  const materials={},visualAnimations=[];
  function material(name,color,emissive=false,alpha=1){
    const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);
    if(emissive)m.emissiveColor=B.Color3.FromHexString(color);m.alpha=alpha;materials[name]=m;return m;
  }
  const enemyMat=material('tdefEnemyMat','#a83232');
  const bulletMat=material('tdefBulletMat','#ffd36a',true);
  const darkMat=material('towerDark','#303b43'), metalMat=material('towerMetal','#aeb9bb');
  const magicMat=material('magicGlow','#9e68ff',true),magicCoreMat=material('magicCore','#d8c7ff',true);
  const mortarMat=material('mortarMetal','#596b70'), gunnerMat=material('gunnerMetal','#a9b5b8');
  function say(text){ui.message.textContent=text;}
  function refresh(){
    ui.gold.textContent=gold;ui.base.textContent=baseHealth;ui.wave.textContent=wave;ui.kills.textContent=kills;
    ui.start.hidden=started;ui.start.disabled=started||gameOver;ui.pause.disabled=!active;ui.pause.textContent=paused?'Продолжить':'Пауза';
    ui.speed.disabled=!active;ui.selected.textContent=selectedPad<0?'—':String(selectedPad+1);
  }
  function pointAt(distance){
    const d=Math.max(0,Math.min(pathLength,distance));let lo=0,hi=lengths.length-1;
    while(lo<hi-1){const mid=(lo+hi)>>1;if(lengths[mid]<d)lo=mid;else hi=mid;}
    const span=lengths[hi]-lengths[lo];return B.Vector3.Lerp(path[lo],path[hi],span>0?(d-lengths[lo])/span:0);
  }
  function mesh(parent,name,kind,opts,mat,pos){
    const m=kind==='sphere'?B.MeshBuilder.CreateSphere(name,opts,scene):
      kind==='torus'?B.MeshBuilder.CreateTorus(name,opts,scene):
      kind==='box'?B.MeshBuilder.CreateBox(name,opts,scene):
      B.MeshBuilder.CreateCylinder(name,opts,scene);
    m.parent=parent;m.position.set(...pos);m.material=mat;m.isPickable=false;return m;
  }
  function createGunner(root,id){
    // Concentric, rotationally symmetric pedestal and compact coaxial turret.
    mesh(root,'gunnerFoot'+id,'cylinder',{diameter:1.5,height:.18,tessellation:32},darkMat,[0,.12,0]);
    mesh(root,'gunnerBaseRing'+id,'torus',{diameter:1.24,thickness:.07,tessellation:48},metalMat,[0,.24,0]);
    mesh(root,'gunnerColumn'+id,'cylinder',{diameter:.72,height:.56,tessellation:32},gunnerMat,[0,.52,0]);
    const head=new B.TransformNode('gunnerTraverse'+id,scene);head.parent=root;head.position.y=.88;
    mesh(head,'gunnerShoulder'+id,'sphere',{diameter:1,segments:24},darkMat,[0,0,0]).scaling.set(1.12,.62,1.12);
    mesh(head,'gunnerMantlet'+id,'cylinder',{diameter:.78,height:.48,tessellation:32},metalMat,[0,.12,0]);
    const barrel=mesh(head,'gunnerAxialBarrel'+id,'cylinder',{diameter:.22,height:1.12,tessellation:24},gunnerMat,[0,.2,.58]);
    barrel.rotation.x=Math.PI/2;
    mesh(head,'gunnerMuzzle'+id,'torus',{diameter:.25,thickness:.035,tessellation:24},darkMat,[0,.2,1.12]).rotation.x=Math.PI/2;
    return {head,barrel};
  }
  function createMortar(root,id){
    mesh(root,'mortarFoot'+id,'cylinder',{diameter:1.55,height:.2,tessellation:32},darkMat,[0,.12,0]);
    mesh(root,'mortarRing'+id,'torus',{diameter:1.3,thickness:.08,tessellation:40},metalMat,[0,.25,0]);
    const mount=mesh(root,'mortarMount'+id,'sphere',{diameter:1.05,segments:20},mortarMat,[0,.7,0]);mount.scaling.y=.68;
    const tube=mesh(root,'mortarTube'+id,'cylinder',{diameter:.48,height:1.05,tessellation:24},metalMat,[0,.96,.18]);
    tube.rotation.x=Math.PI/2-.42;
    mesh(root,'mortarBreech'+id,'sphere',{diameter:.58,segments:20},darkMat,[0,.75,-.18]);
    return {head:mount,barrel:tube};
  }
  function createMagic(root,id){
    mesh(root,'magicFoot'+id,'cylinder',{diameter:1.5,height:.2,tessellation:32},darkMat,[0,.12,0]);
    mesh(root,'magicRing'+id,'torus',{diameter:1.25,thickness:.07,tessellation:48},magicMat,[0,.27,0]);
    mesh(root,'magicSpire'+id,'cylinder',{diameterTop:.32,diameterBottom:.72,height:.92,tessellation:8},darkMat,[0,.78,0]);
    mesh(root,'magicCrown'+id,'torus',{diameter:.82,thickness:.06,tessellation:32},metalMat,[0,1.25,0]);
    const orb=mesh(root,'magicOrb'+id,'sphere',{diameter:.58,segments:24},magicCoreMat,[0,1.68,0]);
    const halo=mesh(root,'magicHalo'+id,'torus',{diameter:.95,thickness:.045,tessellation:40},magicMat,[0,1.68,0]);halo.rotation.x=Math.PI/2;
    return {head:orb,barrel:halo};
  }
  function animateScale(node,from,to,duration=.38){
    node.scaling.setAll(from);
    visualAnimations.push({node,from,to,duration,elapsed:0});
  }
  function addUpgradeVisual(tower,level){
    const node=new B.TransformNode('upgradeVisual_'+tower.index+'_'+level,scene);
    node.parent=tower.root;
    const accent=material('upgradeAccent_'+tower.index+'_'+level,level===2?'#d6b66d':'#8fd4d1',true);
    const steel=level===2?metalMat:gunnerMat;
    mesh(node,'upgradeCollar_'+tower.index+'_'+level,'torus',{diameter:1.48+level*.08,thickness:.09,tessellation:48},accent,[0,.3,0]);
    if(tower.type==='gunner'){
      const count=level===2?2:4;
      for(let i=0;i<count;i++){
        const offset=(i-(count-1)/2)*.22;
        const barrel=mesh(node,'upgradeBarrel_'+tower.index+'_'+level+'_'+i,'cylinder',{diameter:level===2?.13:.16,height:level===2?1.28:1.48,tessellation:20},steel,[offset,.2,.7]);
        barrel.rotation.x=Math.PI/2;
        mesh(node,'upgradeMuzzle_'+tower.index+'_'+level+'_'+i,'torus',{diameter:level===2?.16:.19,thickness:.025,tessellation:20},darkMat,[offset,.2,level===2?1.35:1.46]).rotation.x=Math.PI/2;
      }
      for(const side of [-1,1]){
        mesh(node,'gunnerArmor_'+tower.index+'_'+level+'_'+side,'box',{width:.16,height:.48,depth:.62},accent,[side*.58,.05,-.05]);
      }
    }else if(tower.type==='mortar'){
      tower.barrel.scaling.set(level===2?1.18:1.34,level===2?1.16:1.28,1);
      for(const side of [-1,1]){
        mesh(node,'mortarAmmo_'+tower.index+'_'+level+'_'+side,'cylinder',{diameter:level===2?.34:.42,height:.48,tessellation:20},accent,[side*.72,.82,-.18]);
        mesh(node,'mortarArmor_'+tower.index+'_'+level+'_'+side,'box',{width:.18,height:.46,depth:.72},steel,[side*.64,.48,-.05]);
      }
      mesh(node,'mortarMuzzle_'+tower.index+'_'+level,'torus',{diameter:.56,thickness:.07,tessellation:28},accent,[0,.96,.68]).rotation.x=Math.PI/2-.42;
    }else{
      for(let i=0;i<(level===2?3:5);i++){
        const angle=i/(level===2?3:5)*Math.PI*2;
        const crystal=mesh(node,'magicCrystal_'+tower.index+'_'+level+'_'+i,'sphere',{diameter:level===2?.25:.31,segments:12},accent,[Math.cos(angle)*.78,1.35,Math.sin(angle)*.78]);
        crystal.scaling.y=1.7;
      }
      const halo=mesh(node,'magicHaloUpgrade_'+tower.index+'_'+level,'torus',{diameter:level===2?1.75:2.05,thickness:.055,tessellation:48},accent,[0,1.68,0]);
      halo.rotation.x=Math.PI/2;
    }
    animateScale(node,.02,1,.42);
    tower.upgradeVisuals.push(node);
  }
  function createTower(index,type){
    const def=TOWERS[type],p=pads[index],root=new B.TransformNode(type+'Root'+index,scene);
    root.position.set(p[0],p[1]+.5,p[2]);
    let parts;
    if(type==='gunner')parts=createGunner(root,index);
    else if(type==='mortar')parts=createMortar(root,index);
    else parts=createMagic(root,index);
    const ring=mesh(root,'rangeRing'+index,'torus',{diameter:def.range*2,thickness:.025,tessellation:72},material('range'+index,def.color,true,.25),[0,.035,0]);
    ring.isVisible=false;
    const tower={index,type,root,head:parts.head,barrel:parts.barrel,ring,cooldown:0,level:1,invested:def.cost,upgradeVisuals:[]};
    animateScale(root,.04,1,.46);
    return tower;
  }
  function hideMenu(){ui.menu.hidden=true;}
  function openMenu(index){
    selectedPad=index;
    const tower=towers.find(t=>t.index===index);
    ui.menuTitle.textContent='Площадка '+(index+1);
    ui.selected.textContent=String(index+1);
    ui.buildButtons.forEach(button=>{
      const type=button.dataset.build,def=TOWERS[type];
      button.hidden=!!tower;
      button.disabled=gold<def.cost;
      button.querySelector('[data-price]').textContent=def.cost+' золота';
    });
    ui.upgrade.hidden=!tower;ui.sell.hidden=!tower;
    if(tower){
      towers.forEach(t=>{t.ring.isVisible=t===tower;});
      const def=TOWERS[tower.type],upgradeCost=CONFIG.upgradeCosts[tower.level-1];
      ui.menuTitle.textContent=def.name+' · уровень '+tower.level;
      ui.menuInfo.textContent='Урон '+Math.round(def.damage*(1+.5*(tower.level-1)))+' · дальность '+(def.range*(1+.1*(tower.level-1))).toFixed(1);
      ui.upgrade.textContent=tower.level>=3?'Максимальный уровень':'Улучшить · '+upgradeCost;
      ui.upgrade.disabled=tower.level>=3||gold<upgradeCost;
      ui.sell.textContent='Продать · '+Math.floor(tower.invested*CONFIG.sellRate);
      tower.ring.isVisible=true;
    }else{
      ui.menuInfo.textContent='Выберите тип башни для строительства';
      towers.forEach(t=>t.ring.isVisible=false);
    }
    ui.menu.hidden=false;
    refresh();
  }
  function build(index,type){
    const def=TOWERS[type];if(!def||towers.some(t=>t.index===index))return;
    if(gold<def.cost){say('Недостаточно золота для '+def.name+'.');return;}
    gold-=def.cost;towers.push(createTower(index,type));say(def.name+' построена.');
    hideMenu();selectedPad=-1;refresh();
  }
  function upgrade(){
    const tower=towers.find(t=>t.index===selectedPad);if(!tower||tower.level>=3)return;
    const cost=CONFIG.upgradeCosts[tower.level-1];if(gold<cost){say('Недостаточно золота для улучшения.');return;}
    gold-=cost;tower.invested+=cost;tower.level++;
    const def=TOWERS[tower.type];tower.ring.dispose();
    tower.range=def.range*(1+.1*(tower.level-1));
    tower.damage=def.damage*(1+.5*(tower.level-1));
    tower.reload=def.reload/(1+.12*(tower.level-1));
    tower.ring=mesh(tower.root,'rangeRingUp'+tower.index,'torus',{diameter:tower.range*2,thickness:.025,tessellation:72},material('rangeUp'+tower.index,def.color,true,.25),[0,.035,0]);
    addUpgradeVisual(tower,tower.level);
    tower.root.scaling.setAll(1+(tower.level-1)*.035);
    say(def.name+' улучшена до уровня '+tower.level+'. Новые модули установлены.');
    hideMenu();selectedPad=-1;refresh();
  }
  function sell(){
    const i=towers.findIndex(t=>t.index===selectedPad);if(i<0)return;
    const tower=towers[i],refund=Math.floor(tower.invested*CONFIG.sellRate);
    gold+=refund;tower.root.dispose();towers.splice(i,1);hideMenu();
    say('Башня продана. Возвращено '+refund+' золота.');refresh();
  }
  function spawnEnemy(){
    const body=B.MeshBuilder.CreateSphere('normalEnemy'+(kills+enemies.length),{diameter:.72,segments:10},scene);
    body.position.copyFrom(pointAt(0));body.position.y=.62;body.material=enemyMat;body.isPickable=false;
    const back=B.MeshBuilder.CreateBox('enemyHealthBack',{width:.9,height:.09,depth:.07},scene);
    const fill=B.MeshBuilder.CreateBox('enemyHealthFill',{width:.86,height:.07,depth:.08},scene);
    const backMat=material('enemyBack'+enemies.length,'#351e1e'),fillMat=material('enemyFill'+enemies.length,'#68d36e');
    back.material=backMat;fill.material=fillMat;back.isPickable=fill.isPickable=false;
    enemies.push({mesh:body,barBack:back,barFill:fill,hp:CONFIG.enemy.hp,distance:0,dead:false});
  }
  function removeEnemy(enemy,reachedBase=false){
    if(enemy.dead)return;enemy.dead=true;
    enemy.mesh.dispose();enemy.barBack.dispose();enemy.barFill.dispose();
    const i=enemies.indexOf(enemy);if(i>=0)enemies.splice(i,1);
    if(reachedBase){baseHealth=Math.max(0,baseHealth-CONFIG.enemy.baseDamage);if(baseHealth===0){gameOver=true;active=false;say('Поражение: база уничтожена.');}}
    else{gold+=CONFIG.enemy.reward;kills++;}
    refresh();
  }
  function addBolt(from,to,color='#9e68ff'){
    const points=[];const steps=7;
    for(let i=0;i<=steps;i++){
      const t=i/steps,base=B.Vector3.Lerp(from,to,t);
      if(i>0&&i<steps)base.addInPlace(new B.Vector3((Math.random()-.5)*.45,(Math.random()-.5)*.35,(Math.random()-.5)*.45));
      points.push(base);
    }
    const line=B.MeshBuilder.CreateLines('magicArc',{points,updatable:false},scene);line.color=B.Color3.FromHexString(color);
    effects.push({mesh:line,life:.16});
  }
  function fire(tower,target){
    const def=TOWERS[tower.type],origin=tower.root.position.add(new B.Vector3(0,tower.type==='magic'?1.7:1.05,0));
    const damage=tower.damage??def.damage,range=tower.range??def.range;
    tower.cooldown=tower.reload??def.reload;
    const direction=target.mesh.position.subtract(origin);
    if(tower.head)tower.head.rotation.y=Math.atan2(direction.x,direction.z);
    if(tower.type==='magic'){
      const candidates=enemies.filter(e=>!e.dead&&B.Vector3.Distance(e.mesh.position,target.mesh.position)<3)
        .sort((a,b)=>B.Vector3.Distance(a.mesh.position,target.mesh.position)-B.Vector3.Distance(b.mesh.position,target.mesh.position)).slice(0,def.chain);
      let previous=origin;
      candidates.forEach((enemy,i)=>{addBolt(previous,enemy.mesh.position);enemy.hp-=damage*Math.pow(.7,i);previous=enemy.mesh.position.clone();if(enemy.hp<=0)removeEnemy(enemy);});
    }else{
      const projectile=B.MeshBuilder.CreateSphere(tower.type+'Projectile',{diameter:tower.type==='mortar'?.34:.19,segments:10},scene);
      projectile.position.copyFrom(origin);projectile.material=tower.type==='mortar'?mortarMat:bulletMat;projectile.isPickable=false;
      projectiles.push({mesh:projectile,target,damage,speed:tower.type==='mortar'?def.projectileSpeed:def.projectileSpeed,type:tower.type,origin:origin.clone(),elapsed:0});
    }
  }
  function update(dt){
    for(const animation of [...visualAnimations]){
      animation.elapsed=Math.min(animation.duration,animation.elapsed+dt);
      const t=animation.elapsed/animation.duration;
      const eased=1-Math.pow(1-t,3);
      const scale=animation.from+(animation.to-animation.from)*eased;
      animation.node.scaling.setAll(scale);
      if(t>=1)visualAnimations.splice(visualAnimations.indexOf(animation),1);
    }
    if(paused||gameOver)return;const delta=dt*speed;
    if(!active){
      if(intermissionLeft>0){
        intermissionLeft=Math.max(0,intermissionLeft-dt);
        const seconds=Math.ceil(intermissionLeft);
        if(seconds!==intermissionShown){intermissionShown=seconds;say('Следующая волна через '+seconds+' сек.');}
        if(intermissionLeft===0)startWave();
      }
      return;
    }
    if(spawnLeft>0){spawnTimer-=delta;while(spawnLeft>0&&spawnTimer<=0){spawnEnemy();spawnLeft--;spawnTimer+=CONFIG.spawnInterval;}}
    for(const enemy of [...enemies]){
      enemy.distance+=CONFIG.enemy.speed*delta;
      if(enemy.distance>=pathLength){removeEnemy(enemy,true);continue;}
      const p=pointAt(enemy.distance);enemy.mesh.position.set(p.x,.62,p.z);
      enemy.barBack.position.set(p.x,1.18,p.z);enemy.barFill.position.set(p.x-.02,1.18,p.z);
      enemy.barFill.scaling.x=Math.max(.01,enemy.hp/CONFIG.enemy.hp);
    }
    for(const tower of towers){
      tower.cooldown-=delta;const def=TOWERS[tower.type],range=tower.range??def.range;
      const center=tower.root.position;
      const target=enemies.filter(e=>!e.dead).filter(e=>B.Vector3.Distance(new B.Vector3(e.mesh.position.x,0,e.mesh.position.z),new B.Vector3(center.x,0,center.z))<=range)
        .sort((a,b)=>b.distance-a.distance)[0];
      if(target&&tower.cooldown<=0)fire(tower,target);
    }
    for(const shot of [...projectiles]){
      if(!shot.target||shot.target.dead){shot.mesh.dispose();projectiles.splice(projectiles.indexOf(shot),1);continue;}
      shot.elapsed+=delta;
      const destination=shot.target.mesh.position.add(new B.Vector3(0,.12,0));
      if(shot.type==='mortar'){
        const distance=B.Vector3.Distance(shot.origin,destination);
        const duration=Math.max(.55,distance/shot.speed);
        const t=Math.min(1,shot.elapsed/duration);
        const pos=B.Vector3.Lerp(shot.origin,destination,t);
        pos.y+=Math.sin(Math.PI*t)*Math.min(2.8,distance*.24);
        shot.mesh.position.copyFrom(pos);
        if(t>=1){
          const impact=destination.clone();
          const nearby=enemies.filter(e=>!e.dead&&B.Vector3.Distance(e.mesh.position,impact)<=TOWERS.mortar.splash);
          nearby.forEach(e=>{e.hp-=shot.damage;if(e.hp<=0)removeEnemy(e);});
          shot.mesh.dispose();projectiles.splice(projectiles.indexOf(shot),1);
        }
      }else{
        const diff=destination.subtract(shot.mesh.position),step=shot.speed*delta;
        if(diff.length()<=step){
          shot.target.hp-=shot.damage;if(shot.target.hp<=0)removeEnemy(shot.target);
          shot.mesh.dispose();projectiles.splice(projectiles.indexOf(shot),1);
        }else shot.mesh.position.addInPlace(diff.normalize().scale(step));
      }
    }
    for(const effect of [...effects]){effect.life-=delta;if(effect.life<=0){effect.mesh.dispose();effects.splice(effects.indexOf(effect),1);}}
    if(active&&spawnLeft===0&&enemies.length===0){
      active=false;gold+=20+5*wave;hideMenu();
      intermissionLeft=5;intermissionShown=5;
      say('Волна '+wave+' отражена. Награда: '+(20+5*wave)+'. Следующая волна через 5 сек.');refresh();
    }
  }
  function startWave(){
    if(active||gameOver)return;
    started=true;intermissionLeft=0;intermissionShown=0;hideMenu();
    wave++;spawnLeft=CONFIG.enemiesPerWave(wave);spawnTimer=0;active=true;paused=false;
    say('Волна '+wave+': противник приближается.');refresh();
  }
  scene.onPointerObservable.add(info=>{
    if(info.type!==B.PointerEventTypes.POINTERPICK)return;
    if(!info.pickInfo?.hit){hideMenu();return;}
    const index=info.pickInfo.pickedMesh?.metadata?.tdefPadIndex;
    if(Number.isInteger(index)&&!gameOver)openMenu(index);else hideMenu();
  });
  ui.buildButtons.forEach(button=>button.addEventListener('click',()=>build(selectedPad,button.dataset.build)));
  ui.upgrade.addEventListener('click',upgrade);ui.sell.addEventListener('click',sell);
  ui.close.addEventListener('click',hideMenu);
  ui.start.addEventListener('click',startWave);
  ui.pause.addEventListener('click',()=>{paused=!paused;refresh();say(paused?'Пауза.':'Волна продолжается.');});
  ui.speed.addEventListener('change',()=>{speed=Number(ui.speed.value)||1;});
  scene.onBeforeRenderObservable.add(()=>update(Math.min(engine.getDeltaTime()/1000,.05)));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){paused=true;refresh();say('Пауза: вкладка неактивна.');}});
  refresh();say('Нажмите на свободную площадку, чтобы выбрать башню.');
  window.__TDEF_GAME__={startWave,getState:()=>({gold,baseHealth,wave,kills,enemies:enemies.length,towers:towers.length})};
}
