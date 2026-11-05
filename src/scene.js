import * as B from '@babylonjs/core';
import { attachGame } from './game.js';

(() => {
'use strict';
const canvas=document.getElementById('renderCanvas');
if(!canvas) throw new Error('Canvas #renderCanvas не найден');
const engine=new B.Engine(canvas,true,{antialias:true,stencil:true});
const scene=new B.Scene(engine);
scene.clearColor=new B.Color4(0.67,0.78,0.79,1);
scene.fogMode=B.Scene.FOGMODE_NONE;

const camera=new B.ArcRotateCamera('isometricCamera',-Math.PI/3.2,1.05,39,new B.Vector3(0,1,0),scene);
camera.mode=B.Camera.ORTHOGRAPHIC_CAMERA; camera.attachControl(canvas,true);
camera.lowerRadiusLimit=4; camera.upperRadiusLimit=65; camera.wheelDeltaPercentage=0.04;
camera.panningSensibility=85; camera.angularSensibilityX=700; camera.angularSensibilityY=700; camera.inertia=0.78;

const hemi=new B.HemisphericLight('skyLight',new B.Vector3(0.15,1,0.1),scene);
hemi.intensity=0.78; hemi.groundColor=new B.Color3(0.29,0.32,0.24);
const sun=new B.DirectionalLight('sun',new B.Vector3(-0.55,-1,0.42),scene);
sun.position=new B.Vector3(18,28,-16); sun.intensity=1.15;
const shadows=new B.ShadowGenerator(2048,sun); shadows.useBlurExponentialShadowMap=true; shadows.blurKernel=16; shadows.bias=0.0005;

const material=(name,color,roughness=0.9,metallic=0)=>{
 const m=new B.PBRMaterial(name,scene); m.albedoColor=B.Color3.FromHexString(color); m.roughness=roughness; m.metallic=metallic; return m;
};
const M={
 grass:material('grass',mapId===1?'#71808a':mapId===2?'#758b63':'#66834b'), soil:material('soil',mapId===1?'#555d64':mapId===2?'#75664d':'#75583a'), road:material('road',mapId===1?'#8e999d':mapId===2?'#b5a17c':'#b99a68'),
 edge:material('roadEdge','#756044'), stone:material('stone','#777b78'), lightStone:material('lightStone','#a3a69b'),
 wall:material('castleWall','#b7b8ae'), roof:material('roof','#344d70'), wood:material('wood','#65452c'),
 leaf:material('leaf','#31563b'), leaf2:material('leaf2','#496d43'), water:material('water','#287f91',0.24,0.18),
 gold:material('gold','#d4a84f',0.35,0.55), pad:material('pad','#776b53',0.72,0.12), glow:material('glow','#e4b65a',0.32,0.25),
 dark:material('dark','#282b2a')
};
function shadow(mesh){mesh.receiveShadows=true;shadows.addShadowCaster(mesh);return mesh;}
function box(name,x,y,z,w,h,d,mat,cast=true){
 const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
 m.position.set(x,y+h/2,z);m.material=mat;if(cast)shadow(m);return m;
}
function cylinder(name,x,y,z,diameter,height,mat,tess=12){
 const m=B.MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:tess},scene);
 m.position.set(x,y+height/2,z);m.material=mat;shadow(m);return m;
}
function sphere(name,x,y,z,diameter,mat){
 const m=B.MeshBuilder.CreateSphere(name,{diameter,segments:8},scene);
 m.position.set(x,y,z);m.material=mat;shadow(m);return m;
}

// Island terrain and rocky perimeter.
const island=B.MeshBuilder.CreateCylinder('islandBase',{diameter:35,height:1.8,tessellation:12},scene);
island.position.y=-0.95;island.scaling.z=0.73;island.material=M.soil;shadow(island);
const top=B.MeshBuilder.CreateCylinder('terrainTop',{diameter:34.4,height:0.35,tessellation:12},scene);
top.position.y=-0.05;top.scaling.z=0.73;top.material=M.grass;shadow(top);
for(let i=0;i<34;i++){
 const a=i/34*Math.PI*2,r=16.4+Math.sin(i*4.7)*0.55;
 const rock=B.MeshBuilder.CreatePolyhedron('rimRock'+i,{type:1,size:1.1+(i%3)*0.18},scene);
 rock.position.set(Math.cos(a)*r,-0.75+(i%4)*0.08,Math.sin(a)*r*0.72);
 rock.scaling.set(1.2,0.8+(i%3)*0.12,0.9);rock.material=i%3?M.stone:M.lightStone;shadow(rock);
}

// Winding road from spawn to castle.
const mapId=Math.max(0,Math.min(2,Number(new URLSearchParams(location.search).get('map')||0)));
const routePoints=[
 [
  [-15,0.17,4.9],[-11.4,0.17,4.7],[-8.4,0.17,2.9],[-7.8,0.17,-0.1],
  [-9.8,0.17,-3],[-7.4,0.17,-5.7],[-3.4,0.17,-5.5],[-0.4,0.17,-3],
  [2.7,0.17,-1],[6.5,0.17,-1.6],[9.2,0.17,0.8],[12.3,0.17,1.2],[14.1,0.17,-1.1]
 ],
 [
  [-15,0.17,4.9],[-12.5,0.17,7],[-9.2,0.17,7.2],[-7,0.17,4.2],
  [-5.7,0.17,.6],[-3.1,0.17,-1.2],[-1.8,0.17,-5.2],[1.4,0.17,-7],
  [5.1,0.17,-6.5],[7.4,0.17,-3.2],[10.2,0.17,-2],[12.6,0.17,-.1],[14.1,0.17,-1.1]
 ],
 [
  [-15,0.17,4.9],[-12.7,0.17,2],[-10.2,0.17,-1],[-7.2,0.17,-3.8],
  [-4.2,0.17,-4.3],[-1.8,0.17,-1.4],[1.2,0.17,2.4],[4.2,0.17,4.4],
  [7.3,0.17,3.2],[9.3,0.17,.4],[11.4,0.17,-1.8],[13.1,0.17,-1.2],[14.1,0.17,-1.1]
 ]
];
const points=routePoints[mapId].map(p=>new B.Vector3(...p));
const curve=B.Curve3.CreateCatmullRomSpline(points,12,false).getPoints();
const road=B.MeshBuilder.CreateRibbon('roadSurface',{pathArray:[
 curve.map(p=>new B.Vector3(p.x,p.y,p.z-1.15)),curve.map(p=>new B.Vector3(p.x,p.y,p.z+1.15))
],sideOrientation:B.Mesh.DOUBLESIDE},scene);
road.material=M.road;road.receiveShadows=true;
for(const side of [-1,1]){
 const edge=curve.map(p=>new B.Vector3(p.x,p.y+0.015,p.z+side*1.22));
 const border=B.MeshBuilder.CreateTube('roadBorder'+side,{path:edge,radius:0.11,tessellation:6},scene);border.material=M.edge;
}
// Staggered terracotta brick paving, dark joints and a worn stone kerb.
const brickMaterials=(mapId===1?['#747d82','#8a9293','#656f75','#a0a5a0','#5d686d']:mapId===2?['#9c7953','#b18d61','#84684b','#c1a176','#73583e']:['#a85d3e','#b66b48','#985239','#c17a51','#8f4a35']).map((c,i)=>material('roadBrickMat'+i,c,0.96));
let roadDistance=0,brickRow=0,brickIndex=0;
const roadSegments=[0];
for(let i=1;i<curve.length;i++)roadSegments.push(roadSegments[i-1]+B.Vector3.Distance(curve[i-1],curve[i]));
const roadLength=roadSegments[roadSegments.length-1];
for(let d=.32;d<roadLength;d+=.72,brickRow++){
 const targetDistance=d+(brickRow%2)*.36;
 let seg=0;while(seg<roadSegments.length-2&&roadSegments[seg+1]<targetDistance)seg++;
 const span=roadSegments[seg+1]-roadSegments[seg],t=span?(targetDistance-roadSegments[seg])/span:0;
 const center=B.Vector3.Lerp(curve[seg],curve[seg+1],t),tangent=curve[seg+1].subtract(curve[seg]).normalize();
 const lateral=new B.Vector3(-tangent.z,0,tangent.x),yaw=Math.atan2(tangent.x,tangent.z);
 for(let col=-1;col<=1;col++){
  const p=center.add(lateral.scale(col*.69));
  const brick=B.MeshBuilder.CreateBox('roadBrick'+brickIndex,{width:.66,height:.105,depth:.62},scene);
  brick.position.set(p.x,.205,p.z);brick.rotation.y=yaw+(Math.random()-.5)*.025;
  brick.material=brickMaterials[(brickIndex*7+brickRow*3+col+5)%brickMaterials.length];brick.receiveShadows=true;brick.isPickable=false;brickIndex++;
 }
}

// Eight future tower pads.
const padSets=[
 [[-12.4,0.2,0],[-10.5,0.2,-6.4],[-5.2,0.2,-8.4],[0.1,0.2,-7.2],[4.5,0.2,2.8],[8.8,0.2,4.8],[12.1,0.2,-4.2],[-2.5,0.2,6.8]],
 [[-12.2,0.2,-1.5],[-9.8,0.2,9],[-5.7,0.2,-7.8],[-1.8,0.2,1.8],[2.2,0.2,-9],[5.8,0.2,-2.1],[9.8,0.2,4.8],[13.1,0.2,-5.2]],
 [[-13.2,0.2,-1.2],[-10.4,0.2,-7.3],[-6.2,0.2,6.5],[-3.4,0.2,-7.8],[2.1,0.2,-6.2],[5.8,0.2,7.2],[10.1,0.2,4.9],[12.4,0.2,-5.4]]
];
const pads=padSets[mapId];
pads.forEach((p,i)=>{
 const padBase=cylinder('towerPadBase'+i,p[0],p[1],p[2],2.55,0.28,M.edge,12);
 padBase.metadata={tdefPadIndex:i};
 const padTop=cylinder('towerPad'+i,p[0],p[1]+0.28,p[2],2.28,0.12,M.pad,12);
 padTop.metadata={tdefPadIndex:i};
 const ring=B.MeshBuilder.CreateTorus('padRing'+i,{diameter:2.05,thickness:0.055,tessellation:32},scene);
 ring.position.set(p[0],p[1]+0.48,p[2]);ring.material=M.glow;ring.metadata={tdefPadIndex:i};
 const marker=B.MeshBuilder.CreateCylinder('padMarker'+i,{diameter:0.55,height:0.035,tessellation:4},scene);
 marker.position.set(p[0],p[1]+0.49,p[2]);marker.rotation.y=Math.PI/4;marker.material=M.gold;marker.metadata={tdefPadIndex:i};
});

// Castle at the route endpoint.
box('castleKeep',12.3,0.18,-7,7.2,5,5.8,M.wall);
box('castleGateDark',12.3,0.18,-3.98,2.25,3.1,0.25,M.dark,false);
const arch=B.MeshBuilder.CreateCylinder('gateArch',{diameter:2.55,height:0.35,tessellation:16},scene);
arch.position.set(12.3,3.1,-4);arch.rotation.x=Math.PI/2;arch.material=M.wall;shadow(arch);
box('gateDoorLeft',11.2,0.18,-3.85,1,2.65,0.25,M.wood);
box('gateDoorRight',12.4,0.18,-3.85,1,2.65,0.25,M.wood);
for(const x of [9,15.6]){
 box('castleFrontTower'+x,x,0.18,-4.9,2.15,6,2.2,M.wall);
 const cap=B.MeshBuilder.CreateCylinder('frontRoof'+x,{diameterTop:0,diameterBottom:2.65,height:2.1,tessellation:4},scene);
 cap.position.set(x,6.18,-4.9);cap.rotation.y=Math.PI/4;cap.material=M.roof;shadow(cap);
 cylinder('towerTop'+x,x,5.9,-4.9,1,0.25,M.gold,12);
}
for(let i=0;i<5;i++){
 box('crenel'+i,10+i*1.15,5.2,-9.95,0.55,0.75,0.55,M.wall);
 box('window'+i,10.15+i*1.05,2.1,-4.02,0.28,0.9,0.08,M.dark,false);
}
const banner=material('bannerBlue','#244c82',0.8);
[9,15.6].forEach((x,i)=>{
 cylinder('bannerPole'+i,x,4,-3.55,0.08,2,M.gold,8);
 const flag=B.MeshBuilder.CreatePlane('banner'+i,{width:0.85,height:1.35,sideOrientation:B.Mesh.DOUBLESIDE},scene);
 flag.position.set(x+0.45,5.1,-3.55);flag.material=banner;
});

// Spawn gate and unmistakable red direction arrow.
box('spawnGateLeft',-15.1,0.18,3.6,0.75,2.9,0.8,M.stone);
box('spawnGateRight',-15.1,0.18,6.2,0.75,2.9,0.8,M.stone);
box('spawnLintel',-15.1,3,4.9,0.8,0.55,3.4,M.stone);
const cave=B.MeshBuilder.CreateBox('spawnOpening',{width:0.2,height:2.1,depth:2},scene);
cave.position.set(-14.68,1.25,4.9);cave.material=M.dark;
const arrowMat=new B.StandardMaterial('arrowRed',scene);arrowMat.emissiveColor=new B.Color3(0.85,0.12,0.07);
const arrow=B.MeshBuilder.CreateCylinder('spawnArrow',{diameter:1.45,height:0.08,tessellation:3},scene);
arrow.position.set(-12.7,0.38,4.9);arrow.rotation.y=Math.PI/2;arrow.material=arrowMat;
const shaft=box('spawnArrowShaft',-13.75,0.36,4.9,1.65,0.08,0.36,arrowMat,false);

// Water channels, bridge and low-poly forest.
const water1=B.MeshBuilder.CreateBox('stream1',{width:18,height:0.08,depth:1.25},scene);
water1.position.set(0.4,-0.04,8.4);water1.rotation.y=-0.12;water1.material=M.water;
const water2=B.MeshBuilder.CreateBox('stream2',{width:1.4,height:0.08,depth:12},scene);
water2.position.set(-16,-0.04,-3);water2.material=M.water;
box('bridgeDeck1',1,0.12,8.4,4,0.28,1.8,M.wood);
for(let i=0;i<5;i++)box('bridgePlank'+i,-0.55+i*0.78,0.41,8.4,0.12,0.04,1.72,M.road,false);
function pine(x,z,s=1){
 cylinder('pineTrunk',x,0.12,z,0.34*s,1.35*s,M.wood,7);
 for(let i=0;i<3;i++){
  const crown=B.MeshBuilder.CreateCylinder('pineCrown',{diameterTop:0,diameterBottom:(2-i*0.35)*s,height:1.75*s,tessellation:7},scene);
  crown.position.set(x,1.05*s+i*0.88*s,z);crown.material=i%2?M.leaf:M.leaf2;shadow(crown);
 }
}
[[-13,-8,1],[-10,-10,.85],[-6,-11,1.05],[-2,-11,.9],[3,-10,.95],[7,-10,1.1],[17,-8,.9],[17,-3,1],[17,5,.9],[13,8,.85],[8,9,1],[-8,8,.9],[-13,8,.8],[-17,-7,.85],[-17,0,1],[5,6,.7]].forEach(t=>pine(...t));
for(let i=0;i<42;i++){
 const a=i*2.399,r=7.5+(i%7)*1.05,x=Math.cos(a)*r,z=Math.sin(a)*r*0.68;
 if(Math.abs(x)<7&&Math.abs(z)<5)continue;
 const rock=B.MeshBuilder.CreatePolyhedron('sceneryRock'+i,{type:1,size:0.35+(i%4)*0.12},scene);
 rock.position.set(x,0.18,z);rock.scaling.set(1.2,0.75,0.9);rock.material=i%3?M.stone:M.lightStone;
}
for(let i=0;i<34;i++){
 const x=Math.sin(i*8.1)*13.5,z=Math.cos(i*4.7)*8.3;
 if(Math.abs(x)<7&&Math.abs(z)<5)continue;
 sphere('bush'+i,x,0.35,z,0.75+(i%3)*0.18,i%2?M.leaf:M.grass);
}

// Warm path lanterns.
const flame=new B.StandardMaterial('lanternGlow',scene);flame.emissiveColor=new B.Color3(1,0.55,0.16);
[[-12,2.2],[-5,-7.2],[6,3.8],[14,-3]].forEach((p,i)=>{
 cylinder('lanternPost'+i,p[0],0.18,p[1],0.12,1.8,M.wood,8);
 box('lanternFrame'+i,p[0],1.8,p[1],0.38,0.48,0.38,M.dark);
 sphere('lanternLight'+i,p[0],2.05,p[1],0.22,flame);
 const light=new B.PointLight('lanternPoint'+i,new B.Vector3(p[0],2.1,p[1]),scene);
 light.diffuse=new B.Color3(1,0.58,0.26);light.intensity=0.45;light.range=5;
});
const ground=B.MeshBuilder.CreateGround('backgroundGround',{width:200,height:200},scene);
ground.position.y=-2.05;ground.material=material('backgroundGroundMat','#34483a');ground.receiveShadows=true;

function resizeCamera(){
 const aspect=engine.getRenderWidth()/Math.max(1,engine.getRenderHeight());
 const halfHeight=Math.max(10.8,18.8/Math.max(0.35,aspect))*1.06;
 const zoom=Math.max(0.1,camera.radius/39);
 const visibleHeight=halfHeight*zoom;
 camera.orthoLeft=-visibleHeight*aspect;camera.orthoRight=visibleHeight*aspect;
 camera.orthoTop=visibleHeight;camera.orthoBottom=-visibleHeight;
}
engine.onResizeObservable.add(resizeCamera);resizeCamera();
scene.onBeforeRenderObservable.add(()=>{
 resizeCamera();
 const t=performance.now()*0.0005;
 water1.position.y=-0.04+Math.sin(t)*0.018;water2.position.y=-0.04+Math.sin(t+1)*0.018;
});
engine.runRenderLoop(()=>scene.render());
window.addEventListener('resize',()=>{engine.resize();resizeCamera();});
const mapSelect=document.getElementById('mapSelect');
if(mapSelect){
 const unlocked=Math.max(0,Math.min(2,Number(localStorage.getItem('tdefUnlockedMap')||0)));
 [...mapSelect.options].forEach(option=>{option.disabled=Number(option.value)>unlocked;});
 mapSelect.value=String(mapId);
 mapSelect.addEventListener('change',()=>{location.href=location.pathname+'?map='+mapSelect.value;});
}
attachGame({B,scene,engine,curve,pads});
window.__TDEF_SCENE_STARTED=true;
})();
