import * as B from '@babylonjs/core';

const TOWERS = Object.freeze({
  gunner: { name:'Gunner', cost:50, range:6, damage:8, reload:0.3, projectileSpeed:18, color:'#9eafb5' },
  mortar: { name:'Мортира', cost:100, range:9, damage:50, reload:3, projectileSpeed:10, splash:2.5, color:'#7f8990' },
  magic: { name:'Магическая', cost:90, range:4, damage:15, reload:1, chain:3, color:'#9d7be8' }
});
const ENEMY_TYPES = Object.freeze({
  goblin:{name:'Гоблин',hp:40,speed:2,reward:10,damage:1,armor:0,color:'#659b45'},
  orc:{name:'Орк',hp:115,speed:1.15,reward:18,damage:2,armor:.32,color:'#8c6843'},
  shaman:{name:'Шаман',hp:72,speed:1.35,reward:22,damage:1,armor:0,color:'#8e69bd',healer:true},
  troll:{name:'Тролль',hp:310,speed:.72,reward:35,damage:4,armor:.48,color:'#668b55',regen:5},
  flyer:{name:'Летучий налётчик',hp:58,speed:2.8,reward:16,damage:2,armor:0,color:'#b5a1cc',flying:true}
});
const CONFIG = Object.freeze({
  startingGold:190, baseHealth:25,
  enemiesPerWave:wave=>8+wave*2, spawnInterval:0.82,
  upgradeCosts:[55,85], sellRate:0.5, campaignWaves:10
});

export function attachGame({B:Babylon,scene,engine,curve,pads}) {
  const $=id=>document.getElementById(id);
  const ui={
    gold:$('goldValue'),base:$('baseValue'),wave:$('waveValue'),kills:$('killsValue'),
    start:$('startWave'),pause:$('pauseGame'),speed:$('gameSpeed'),
    intro:$('introScreen'),introButton:$('enterBattle'),countdown:$('waveCountdown'),countdownValue:$('countdownValue'),countdownLabel:$('countdownLabel'),
    selected:$('selectedPad'),message:$('gameMessage'),
    menu:$('contextMenu'),menuTitle:$('contextTitle'),menuInfo:$('contextInfo'),
    buildButtons:[...document.querySelectorAll('[data-build]')],
    upgrade:$('upgradeTower'),sell:$('sellTower'),close:$('closeContext'),
    targetPriority:$('targetPriority'),branchPanel:$('branchPanel'),
    branchA:$('branchA'),branchB:$('branchB'),wavePreview:$('wavePreview'),
    frost:$('frostSpell'),meteor:$('meteorSpell'),spellStatus:$('spellStatus'),
    campaign:$('campaignStatus'),victory:$('victoryScreen'),victoryNext:$('nextMap')
  };
  const path=curve.map(p=>p.clone()), lengths=[0];
  for(let i=1;i<path.length;i++)lengths.push(lengths[i-1]+B.Vector3.Distance(path[i-1],path[i]));
  const pathLength=lengths.at(-1), enemies=[],towers=[],projectiles=[],effects=[];
  let gold=CONFIG.startingGold,baseHealth=CONFIG.baseHealth,wave=0,kills=0;
  let spawnLeft=0,spawnTimer=0,active=false,paused=false,speed=1,selectedPad=-1,gameOver=false,started=false,intermissionLeft=0,intermissionShown=0,countdownLeft=0,countdownShown=0;
  let spawnQueue=[],frostCooldown=0,meteorCooldown=0,frostTime=0,selectedMap=Number(new URLSearchParams(location.search).get('map')||0);
  const maxCampaignWaves=CONFIG.campaignWaves,unlockedMap=Number(localStorage.getItem('tdefUnlockedMap')||0);
  const spellState={frost:0,meteor:0};
  const materials={},visualAnimations=[],enemyVisuals={};
  const enemyHealthBackMat=material('enemyHealthBackMat','#351e1e');
  const enemyHealthFillMat=material('enemyHealthFillMat','#68d36e');
  const enemyBossHealthMat=material('enemyBossHealthMat','#f04b55');
  function material(name,color,emissive=false,alpha=1){
    const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);
    if(emissive)m.emissiveColor=B.Color3.FromHexString(color);m.alpha=alpha;materials[name]=m;return m;
  }
  const enemyMat=material('tdefEnemyMat','#a83232');
  const goblinSkin=material('goblinSkin','#659b45');
  const goblinDark=material('goblinDark','#355b2e');
  const goblinCloth=material('goblinCloth','#8b4931');
  const goblinLeather=material('goblinLeather','#49382b');
  const goblinEye=material('goblinEye','#f1d66b',true);
  const goblinTooth=material('goblinTooth','#e7dfc5');
  const impactFlash=material('impactFlash','#ffd27a',true,.9);
  const impactEmber=material('impactEmber','#ff7a2f',true,.95);
  const impactDust=material('impactDust','#9a8060',false,.48);
  const impactStone=material('impactStone','#5c5144');
  const bulletMat=material('tdefBulletMat','#ffd36a',true);
  const darkMat=material('towerDark','#303b43'), metalMat=material('towerMetal','#aeb9bb');
  const magicMat=material('magicGlow','#9e68ff',true),magicCoreMat=material('magicCore','#d8c7ff',true);
  const mortarMat=material('mortarMetal','#596b70'), gunnerMat=material('gunnerMetal','#a9b5b8');
  function say(text){ui.message.textContent=text;}
  function refresh(){
    ui.gold.textContent=gold;ui.base.textContent=baseHealth;ui.wave.textContent=wave;ui.kills.textContent=kills;
    ui.start.hidden=true;ui.start.disabled=true;ui.pause.disabled=!active;ui.pause.textContent=paused?'Продолжить':'Пауза';
    ui.speed.disabled=!active;ui.selected.textContent=selectedPad<0?'—':String(selectedPad+1);
    if(ui.frost)ui.frost.disabled=frostCooldown>0||gameOver;
    if(ui.meteor)ui.meteor.disabled=meteorCooldown>0||gameOver;
    if(ui.spellStatus)ui.spellStatus.textContent=(frostCooldown>0?'Лёд '+Math.ceil(frostCooldown)+'с':'Лёд готов')+' · '+(meteorCooldown>0?'Метеор '+Math.ceil(meteorCooldown)+'с':'Метеор готов');
    if(ui.campaign)ui.campaign.textContent='Кампания · карта '+(selectedMap+1)+' · '+wave+'/'+maxCampaignWaves;
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
    const tower={index,type,root,head:parts.head,barrel:parts.barrel,ring,cooldown:0,level:1,invested:def.cost,upgradeVisuals:[],targetYaw:0,priority:'first',branch:null,splash:def.splash||0};
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
      if(ui.targetPriority){ui.targetPriority.value=tower.priority||'first';ui.targetPriority.hidden=false;}
      if(ui.branchPanel)ui.branchPanel.hidden=tower.level<2||!!tower.branch;
      if(ui.branchA&&ui.branchB){
        ui.branchA.textContent=tower.type==='gunner'?'Шквальный огонь':tower.type==='mortar'?'Осколочный заряд':'Цепная молния';
        ui.branchB.textContent=tower.type==='gunner'?'Снайперский ствол':tower.type==='mortar'?'Осадный заряд':'Ледяная печать';
      }
      ui.menuInfo.textContent='Урон '+Math.round(def.damage*(1+.5*(tower.level-1)))+' · дальность '+(def.range*(1+.1*(tower.level-1))).toFixed(1);
      ui.upgrade.textContent=tower.level>=3?'Максимальный уровень':'Улучшить · '+upgradeCost;
      ui.upgrade.disabled=tower.level>=3||gold<upgradeCost;
      ui.sell.textContent='Продать · '+Math.floor(tower.invested*CONFIG.sellRate);
      tower.ring.isVisible=true;
    }else{
      if(ui.targetPriority)ui.targetPriority.hidden=true;
      if(ui.branchPanel)ui.branchPanel.hidden=true;
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
    animateScale(tower.root,tower.root.scaling.x,1+(tower.level-1)*.035,.32);
    say(def.name+' улучшена до уровня '+tower.level+'. Новые модули установлены.');
    hideMenu();selectedPad=-1;refresh();
  }
  function sell(){
    const i=towers.findIndex(t=>t.index===selectedPad);if(i<0)return;
    const tower=towers[i],refund=Math.floor(tower.invested*CONFIG.sellRate);
    gold+=refund;tower.root.dispose();towers.splice(i,1);hideMenu();selectedPad=-1;
    say('Башня продана. Возвращено '+refund+' золота.');refresh();
  }
  function waveComposition(w){
    const count=CONFIG.enemiesPerWave(w),queue=[];
    for(let i=0;i<count;i++){
      let type='goblin';
      if(w>=2&&i%5===4)type='orc';
      if(w>=3&&i%7===5)type='shaman';
      if(w>=4&&i%6===3)type='flyer';
      if(w>=5&&i%9===7)type='troll';
      if(w>=6&&i%4===2)type=['orc','shaman','flyer','troll'][(i+w)%4];
      queue.push(type);
    }
    if(w%5===0)queue.splice(Math.floor(queue.length*.55),0,'boss');
    return queue;
  }
  function updateWavePreview(w){
    if(!ui.wavePreview)return;
    const composition=waveComposition(w);
    const counts=composition.reduce((acc,type)=>(acc[type]=(acc[type]||0)+1,acc),{});
    ui.wavePreview.textContent='Следующая волна '+w+': '+Object.entries(counts).map(([type,count])=>(type==='boss'?'Босс':ENEMY_TYPES[type].name)+' ×'+count).join(' · ');
  }
  function spawnEnemy(type='goblin'){
    const boss=type==='boss',baseType=boss?'troll':type,def=ENEMY_TYPES[baseType]||ENEMY_TYPES.goblin;
    const id=kills+enemies.length+wave*100,root=new B.TransformNode('enemy_'+baseType+'_'+id,scene);
    const part=(name,kind,opts,mat,pos)=>{
      const m=kind==='sphere'?B.MeshBuilder.CreateSphere(name,opts,scene):kind==='box'?B.MeshBuilder.CreateBox(name,opts,scene):B.MeshBuilder.CreateCylinder(name,opts,scene);
      m.parent=root;m.position.set(...pos);m.material=mat;m.isPickable=false;return m;
    };
    const paletteKey=boss?'boss':baseType;
    if(!enemyVisuals[paletteKey]){
      enemyVisuals[paletteKey]={
        skin:material('enemySkin_'+paletteKey,boss?'#a85d45':def.color,boss),
        dark:material('enemyDark_'+paletteKey,boss?'#292b36':baseType==='orc'?'#40352d':'#35432f'),
        cloth:material('enemyCloth_'+paletteKey,boss?'#6d2634':baseType==='orc'?'#65462f':baseType==='shaman'?'#514078':'#75412f'),
        eye:material('enemyEye_'+paletteKey,boss?'#ffb24a':'#f1d66b',true),
        wing:material('enemyWing_'+paletteKey,'#6e587d')
      };
    }
    const {skin,dark,cloth,eye,wing}=enemyVisuals[paletteKey];
    const scale=boss?1.75:baseType==='troll'?1.35:baseType==='flyer'?.82:baseType==='orc'?1.18:1;
    part('enemyTorso'+id,'sphere',{diameter:1,segments:10},cloth,[0,.55,0]).scaling.set(.5*scale,.6*scale,.36*scale);
    part('enemyBelly'+id,'sphere',{diameter:.55,segments:8},skin,[0,.57*scale,.22*scale]).scaling.set(.8*scale,.8*scale,.55*scale);
    part('enemyHead'+id,'sphere',{diameter:.62,segments:10},skin,[0,1.13*scale,.02]).scaling.set(scale,scale,scale);
    for(const side of [-1,1]){
      const ear=part('enemyEar'+id+'_'+side,'cylinder',{diameterTop:0,diameterBottom:.28*scale,height:.52*scale,tessellation:5},skin,[side*.4*scale,1.2*scale,.02]);
      ear.rotation.z=-side*.95;
      part('enemyEye'+id+'_'+side,'sphere',{diameter:.11*scale,segments:8},eye,[side*.15*scale,1.18*scale,.29*scale]);
      const arm=part('enemyArm'+id+'_'+side,'cylinder',{diameter:.22*scale,height:.62*scale,tessellation:7},skin,[side*.48*scale,.67*scale,.02]);arm.rotation.z=side*.42;
    }
    part('enemyNose'+id,'sphere',{diameter:.17*scale,segments:6},dark,[0,1.05*scale,.37*scale]);
    part('enemyFang'+id,'cylinder',{diameterTop:0,diameterBottom:.1*scale,height:.2*scale,tessellation:5},eye,[.12*scale,.91*scale,.3*scale]);
    const legs=[];
    for(const side of [-1,1]){
      legs.push(part('enemyLeg'+id+'_'+side,'cylinder',{diameter:.22*scale,height:.43*scale,tessellation:7},dark,[side*.18*scale,.2*scale,0]));
      part('enemyFoot'+id+'_'+side,'box',{width:.28*scale,height:.13*scale,depth:.35*scale},cloth,[side*.18*scale,.045*scale,.1]);
    }
    if(baseType==='orc'||baseType==='troll'||boss){
      part('enemyShoulderL'+id,'box',{width:.42*scale,height:.28*scale,depth:.48*scale},dark,[-.48*scale,.92*scale,0]);
      part('enemyShoulderR'+id,'box',{width:.42*scale,height:.28*scale,depth:.48*scale},dark,[.48*scale,.92*scale,0]);
      part('enemyWeapon'+id,'cylinder',{diameter:.2*scale,height:.95*scale,tessellation:7},dark,[.62*scale,.62*scale,.12]).rotation.z=-.5;
    }else if(baseType==='shaman'){
      part('shamanStaff'+id,'cylinder',{diameter:.09,height:1.5,tessellation:7},dark,[.58,.72,.05]).rotation.z=-.15;
      part('shamanOrb'+id,'sphere',{diameter:.28,segments:8},eye,[.58,1.5,.05]);
    }else{
      part('enemyClub'+id,'cylinder',{diameter:.14,height:.72,tessellation:7},dark,[.52,.65,.12]).rotation.z=-.5;
    }
    if(def.flying){
      for(const side of [-1,1]){
        const wingMesh=part('enemyWing'+id+'_'+side,'box',{width:.72,height:.08,depth:.42},wing,[side*.48,.92,-.08]);
        wing.rotation.z=side*.45;
      }
    }
    if(baseType==='shaman'){
      const aura=B.MeshBuilder.CreateTorus('shamanAura'+id,{diameter:1.15,thickness:.035,tessellation:24},scene);
      aura.parent=root;aura.position.y=.18;aura.material=eye;aura.isPickable=false;
    }
    const p=pointAt(0);root.position.set(p.x,def.flying?1.7:.18,p.z);
    root.scaling.setAll(1);
    const back=B.MeshBuilder.CreateBox('enemyHealthBack'+id,{width:boss?1.7:.95,height:.1,depth:.07},scene);
    const fill=B.MeshBuilder.CreateBox('enemyHealthFill'+id,{width:boss?1.66:.91,height:.075,depth:.08},scene);
    back.material=enemyHealthBackMat;fill.material=boss?enemyBossHealthMat:enemyHealthFillMat;back.isPickable=fill.isPickable=false;
    const hp=def.hp*(1+wave*.12)*(boss?4.5:1);
    const enemy={mesh:root,barBack:back,barFill:fill,legs,hp,maxHp:hp,distance:0,dead:false,phase:Math.random()*Math.PI*2,type:baseType,boss,flying:!!def.flying,armor:def.armor||0,regen:def.regen||0,heal:def.healer||false,healTimer:1.5,speed:def.speed*(1+wave*.012),baseDamage:def.damage,reward:def.reward*(boss?5:1),slow:0,scale};
    enemies.push(enemy);
    spawnBurst(new B.Vector3(p.x,.25,p.z),'spawn');
    if(boss)say('БОСС-ВОЛНА '+wave+'! На дороге появился вожак орков!');
  }
  function applyDamage(enemy,amount,ignoreArmor=false){
    if(!enemy||enemy.dead)return;
    const actual=amount*(ignoreArmor?1:1-(enemy.armor||0));
    enemy.hp-=actual;
    if(enemy.hp<=0)removeEnemy(enemy);
  }
  function removeEnemy(enemy,reachedBase=false){
    if(enemy.dead)return;enemy.dead=true;
    const deathPoint=enemy.mesh.position.clone();
    enemy.mesh.dispose();enemy.barBack.dispose();enemy.barFill.dispose();
    if(!reachedBase)spawnBurst(deathPoint,'goblin');
    const i=enemies.indexOf(enemy);if(i>=0)enemies.splice(i,1);
    if(reachedBase){baseHealth=Math.max(0,baseHealth-enemy.baseDamage);spawnBurst(deathPoint,'base');if(baseHealth===0){gameOver=true;active=false;say('Поражение: база уничтожена.');}}
    else{gold+=enemy.reward;kills++;}
    refresh();
  }
  function spawnBurst(position,kind='mortar'){
    const mortar=kind==='mortar',spawn=kind==='spawn',count=mortar?18:8;
    const flash=B.MeshBuilder.CreateSphere('impactFlash',{diameter:mortar?1.05:.48,segments:10},scene);
    flash.position.copyFrom(position);flash.position.y+=.12;flash.material=spawn?goblinEye:impactFlash;flash.isPickable=false;
    effects.push({mesh:flash,life:mortar?.22:.14,maxLife:mortar?.22:.14,kind:'flash'});
    const ring=B.MeshBuilder.CreateTorus('impactShockwave',{diameter:.45,thickness:mortar?.12:.055,tessellation:28},scene);
    ring.position.set(position.x,.12,position.z);ring.material=spawn?goblinEye:impactEmber;ring.isPickable=false;
    effects.push({mesh:ring,life:mortar?.58:.34,maxLife:mortar?.58:.34,kind:'ring'});
    for(let i=0;i<count;i++){
      const angle=Math.random()*Math.PI*2,v=(mortar?2.2:1.1)+Math.random()*(mortar?4.2:1.8);
      const mesh=mortar&&i%3===0?B.MeshBuilder.CreateBox('impactDebris',{size:.16+Math.random()*.16},scene):B.MeshBuilder.CreateSphere('impactParticle',{diameter:.09+Math.random()*.13,segments:6},scene);
      mesh.position.set(position.x+(Math.random()-.5)*.28,.18+Math.random()*.18,position.z+(Math.random()-.5)*.28);
      mesh.material=mortar?(i%3===0?impactStone:impactEmber):(spawn?goblinSkin:impactDust);mesh.isPickable=false;
      effects.push({mesh,life:.35+Math.random()*.42,maxLife:.77,kind:'particle',velocity:new B.Vector3(Math.cos(angle)*v,(mortar?2.2:1.1)+Math.random()*2,Math.sin(angle)*v),spin:(Math.random()-.5)*9});
    }
    if(mortar){
      const dust=B.MeshBuilder.CreateSphere('impactDustCloud',{diameter:1.2,segments:8},scene);
      dust.position.set(position.x,.28,position.z);dust.scaling.set(1,.25,1);dust.material=impactDust;dust.isPickable=false;
      effects.push({mesh:dust,life:.72,maxLife:.72,kind:'dust'});
    }
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
    const branch=tower.branch;
    const damage=(tower.damage??def.damage)*(branch==='precision'&&tower.type==='gunner'?2.1:1);
    const range=(tower.range??def.range)*(branch==='precision'&&tower.type==='gunner'?1.25:1);
    tower.cooldown=tower.reload??def.reload;
    const direction=target.mesh.position.subtract(origin);
    if(tower.head)tower.targetYaw=Math.atan2(direction.x,direction.z);
    if(tower.type==='magic'){
      const chainCount=branch==='storm'?5:def.chain;
      const candidates=enemies.filter(e=>!e.dead&&B.Vector3.Distance(e.mesh.position,target.mesh.position)<(branch==='frost'?4:3))
        .sort((a,b)=>B.Vector3.Distance(a.mesh.position,target.mesh.position)-B.Vector3.Distance(b.mesh.position,target.mesh.position)).slice(0,chainCount);
      let previous=origin;
      candidates.forEach((enemy,i)=>{addBolt(previous,enemy.mesh.position,branch==='frost'?'#78dfff':'#9e68ff');applyDamage(enemy,damage*Math.pow(.7,i));if(branch==='frost')enemy.slow=Math.max(enemy.slow,2.2);previous=enemy.mesh.position.clone();});
    }else{
      const projectile=B.MeshBuilder.CreateSphere(tower.type+'Projectile',{diameter:tower.type==='mortar'?.34:.19,segments:10},scene);
      projectile.position.copyFrom(origin);projectile.material=tower.type==='mortar'?mortarMat:bulletMat;projectile.isPickable=false;
      projectiles.push({mesh:projectile,target,damage,speed:def.projectileSpeed,type:tower.type,origin:origin.clone(),elapsed:0,splash:tower.splash||def.splash||0});
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
      if(countdownLeft>0){
        countdownLeft=Math.max(0,countdownLeft-dt);
        const seconds=Math.ceil(countdownLeft);
        if(seconds!==countdownShown){countdownShown=seconds;ui.countdownValue.textContent=String(seconds||'');}
        if(countdownLeft===0){hideCountdown();startWave();}
      }
      return;
    }
    frostCooldown=Math.max(0,frostCooldown-delta);meteorCooldown=Math.max(0,meteorCooldown-delta);frostTime=Math.max(0,frostTime-delta);
    if(spawnLeft>0){spawnTimer-=delta;while(spawnLeft>0&&spawnTimer<=0){spawnEnemy(spawnQueue.shift()||'goblin');spawnLeft--;spawnTimer+=CONFIG.spawnInterval;}}
    for(const enemy of [...enemies]){
      enemy.distance+=(enemy.speed*(enemy.slow>0?.48:1)*(frostTime>0?.42:1))*delta;
      if(enemy.distance>=pathLength){removeEnemy(enemy,true);continue;}
      if(enemy.regen>0)enemy.hp=Math.min(enemy.maxHp,enemy.hp+enemy.regen*delta);
      if(enemy.slow>0)enemy.slow=Math.max(0,enemy.slow-delta);
      const p=pointAt(enemy.distance),ahead=pointAt(Math.min(pathLength,enemy.distance+.12)),behind=pointAt(Math.max(0,enemy.distance-.12));
      const tangent=ahead.subtract(behind),gait=Math.sin(enemy.distance*5.8+enemy.phase);
      const healerNearby=enemies.some(other=>other!==enemy&&!other.dead&&other.heal&&B.Vector3.Distance(other.mesh.position,enemy.mesh.position)<3.2);
      if(enemy.heal&&Math.floor(performance.now()/1000)%2===0){
        enemy.healTimer-=delta;
      if(enemy.heal&&enemy.healTimer<=0){
        enemies.forEach(other=>{if(other!==enemy&&!other.dead&&B.Vector3.Distance(other.mesh.position,enemy.mesh.position)<3.2)other.hp=Math.min(other.maxHp,other.hp+14);});
        enemy.healTimer=1.8;
        spawnBurst(enemy.mesh.position,'spawn');
      }
      }
      const altitude=enemy.flying?1.75+Math.sin(performance.now()*.004+enemy.phase)*.14:.18;
      enemy.mesh.position.set(p.x,altitude+Math.abs(gait)*.045,p.z);
      enemy.mesh.rotation.y=Math.atan2(tangent.x,tangent.z);
      enemy.legs.forEach((leg,index)=>{leg.rotation.x=(index===0?1:-1)*gait*.62;});
      enemy.barBack.position.set(p.x,altitude+1.55*enemy.scale,p.z);enemy.barFill.position.set(p.x-.02,altitude+1.55*enemy.scale,p.z);
      enemy.barFill.scaling.x=Math.max(.01,enemy.hp/enemy.maxHp);
    }
    for(const tower of towers){
      if(tower.head){const turn=Math.atan2(Math.sin(tower.targetYaw-tower.head.rotation.y),Math.cos(tower.targetYaw-tower.head.rotation.y));tower.head.rotation.y+=turn*Math.min(1,delta*8);}
      tower.cooldown-=delta;const def=TOWERS[tower.type],range=tower.range??def.range;
      const center=tower.root.position;
      const target=enemies.filter(e=>!e.dead).filter(e=>!e.flying||tower.type!=='mortar').filter(e=>B.Vector3.Distance(new B.Vector3(e.mesh.position.x,0,e.mesh.position.z),new B.Vector3(center.x,0,center.z))<=range)
        .sort((a,b)=>tower.priority==='strongest'?b.hp-a.hp:tower.priority==='weakest'?a.hp-b.hp:tower.priority==='last'?a.distance-b.distance:b.distance-a.distance)[0];
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
          const nearby=enemies.filter(e=>!e.dead&&B.Vector3.Distance(e.mesh.position,impact)<=(shot.splash||TOWERS.mortar.splash));
          spawnBurst(impact,'mortar');
          nearby.forEach(e=>applyDamage(e,shot.damage));
          shot.mesh.dispose();projectiles.splice(projectiles.indexOf(shot),1);
        }
      }else{
        const diff=destination.subtract(shot.mesh.position),step=shot.speed*delta;
        if(diff.length()<=step){
          applyDamage(shot.target,shot.damage);
          shot.mesh.dispose();projectiles.splice(projectiles.indexOf(shot),1);
        }else shot.mesh.position.addInPlace(diff.normalize().scale(step));
      }
    }
    for(const effect of [...effects]){
      effect.life-=delta;const t=1-Math.max(0,effect.life)/effect.maxLife;
      if(effect.kind==='ring'){const scale=1+t*(effect.maxLife>.5?5.5:3.2);effect.mesh.scaling.set(scale,scale,scale);effect.mesh.visibility=Math.max(0,1-t);}
      else if(effect.kind==='flash'){effect.mesh.scaling.setAll(1+t*2.8);effect.mesh.visibility=Math.max(0,1-t);}
      else if(effect.kind==='dust'){effect.mesh.scaling.set(1+t*3,.25+t*.8,1+t*3);effect.mesh.visibility=Math.max(0,1-t);}
      else if(effect.kind==='particle'){effect.mesh.position.addInPlace(effect.velocity.scale(delta));effect.velocity.y-=5.5*delta;effect.mesh.rotation.x+=effect.spin*delta;effect.mesh.rotation.z+=effect.spin*.7*delta;effect.mesh.visibility=Math.max(0,1-t);}
      if(effect.life<=0){effect.mesh.dispose();effects.splice(effects.indexOf(effect),1);}
    }
    if(active&&spawnLeft===0&&enemies.length===0){
      active=false;gold+=25+8*wave;hideMenu();
      if(wave>=maxCampaignWaves){
        gameOver=true;const next=Math.min(2,selectedMap+1);localStorage.setItem('tdefUnlockedMap',String(Math.max(unlockedMap,next)));
        if(ui.victory)ui.victory.hidden=false;
        if(ui.victoryNext){ui.victoryNext.disabled=next<=selectedMap;ui.victoryNext.textContent=next<=selectedMap?'Кампания завершена':'Открыта следующая карта · перейти';}
        say('Победа! Кампания на этой карте завершена.');
      }else{
        intermissionLeft=5;intermissionShown=5;updateWavePreview(wave+1);beginCountdown(5,'Следующая волна');
        say('Волна '+wave+' отражена. Награда: '+(25+8*wave)+'.');
      }
      refresh();
    }
  }
  function showCountdown(seconds,label){
    countdownLeft=seconds;countdownShown=seconds;ui.countdownValue.textContent=String(seconds);ui.countdownLabel.textContent=label;ui.countdown.hidden=false;
  }
  function hideCountdown(){ui.countdown.hidden=true;countdownLeft=0;countdownShown=0;}
  function beginCountdown(seconds,label){showCountdown(seconds,label);say(label+' через '+seconds+' сек.');}
  function enterBattle(){
    if(started||gameOver)return;
    started=true;ui.intro.hidden=true;beginCountdown(3,'Первая волна');refresh();
  }
  function startWave(){
    if(active||gameOver)return;
    started=true;intermissionLeft=0;intermissionShown=0;hideCountdown();hideMenu();
    wave++;spawnQueue=waveComposition(wave);spawnLeft=spawnQueue.length;spawnTimer=0;active=true;paused=false;
    updateWavePreview(wave);
    spawnBurst(pointAt(0),'spawn');
    say('Волна '+wave+': гоблины идут к крепости!');refresh();
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
  ui.start.addEventListener('click',enterBattle);
  ui.introButton.addEventListener('click',enterBattle);
  ui.pause.addEventListener('click',()=>{paused=!paused;refresh();say(paused?'Пауза.':'Волна продолжается.');});
  ui.speed.addEventListener('change',()=>{speed=Number(ui.speed.value)||1;});
  if(ui.targetPriority)ui.targetPriority.addEventListener('change',()=>{const t=towers.find(x=>x.index===selectedPad);if(t)t.priority=ui.targetPriority.value;});
  function specialize(branch){
    const t=towers.find(x=>x.index===selectedPad);if(!t||t.level<2||t.branch)return;
    if(gold<45){say('Для специализации требуется 45 золота.');return;}
    t.branch=branch;t.invested+=45;gold-=45;
    if(t.type==='gunner'&&branch==='barrage'){t.damage*=.78;t.reload*=.48;}
    if(t.type==='gunner'&&branch==='precision'){t.damage*=2.1;t.reload*=1.65;}
    if(t.type==='mortar'&&branch==='shrapnel'){t.damage*=.72;t.range*=1.12;t.splash=3.6;}
    if(t.type==='mortar'&&branch==='siege'){t.damage*=1.65;t.reload*=1.45;t.range*=1.2;t.splash=1.8;}
    if(t.type==='magic'&&branch==='storm'){t.damage*=.82;}
    if(t.type==='magic'&&branch==='frost'){t.damage*=.9;}
    if(t.type==='mortar'||t.type==='gunner'){
      t.ring.dispose();
      t.ring=mesh(t.root,'rangeRingSpecial_'+t.index,'torus',{diameter:t.range*2,thickness:.025,tessellation:72},material('rangeSpecial_'+t.index,TOWERS[t.type].color,true,.25),[0,.035,0]);
    }
    if(ui.branchPanel)ui.branchPanel.hidden=true;
    say('Специализация башни установлена.');refresh();openMenu(selectedPad);
  }
  if(ui.branchA)ui.branchA.addEventListener('click',()=>specialize(({gunner:'barrage',mortar:'shrapnel',magic:'storm'})[towers.find(t=>t.index===selectedPad)?.type]));
  if(ui.branchB)ui.branchB.addEventListener('click',()=>specialize(({gunner:'precision',mortar:'siege',magic:'frost'})[towers.find(t=>t.index===selectedPad)?.type]));
  function castFrost(){
    if(frostCooldown>0||gameOver)return;frostCooldown=28;frostTime=5.5;
    const center=pointAt(pathLength*.55);spawnBurst(center,'mortar');say('Ледяная буря! Все наземные враги замедлены.');
    enemies.forEach(e=>{if(!e.flying)e.slow=Math.max(e.slow,5.5);});refresh();
  }
  function castMeteor(){
    if(meteorCooldown>0||gameOver)return;meteorCooldown=36;
    const center=pointAt(pathLength*.62);spawnBurst(center,'mortar');
    enemies.filter(e=>!e.dead&&B.Vector3.Distance(e.mesh.position,center)<4.2).forEach(e=>applyDamage(e,95,true));
    say('Метеоритный удар! Урон по области.');refresh();
  }
  if(ui.frost)ui.frost.addEventListener('click',castFrost);
  if(ui.meteor)ui.meteor.addEventListener('click',castMeteor);
  if(ui.victoryNext)ui.victoryNext.addEventListener('click',()=>{if(selectedMap<2){location.href=location.pathname+'?map='+(selectedMap+1);}});
  if(ui.campaign)ui.campaign.textContent='Кампания · карта '+(selectedMap+1)+' · 0/'+maxCampaignWaves;
  scene.onBeforeRenderObservable.add(()=>update(Math.min(engine.getDeltaTime()/1000,.05)));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){paused=true;refresh();say('Пауза: вкладка неактивна.');}});
  refresh();updateWavePreview(1);say('Разместите башни на площадках и защитите крепость.');
  window.__TDEF_GAME__={startWave,enterBattle,getState:()=>({gold,baseHealth,wave,kills,enemies:enemies.length,towers:towers.length,spawnQueue:spawnQueue.length}),debugSpawn:spawnEnemy};
}
