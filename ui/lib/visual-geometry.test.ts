import {describe,it} from "node:test";
import assert from "node:assert/strict";
import type {Angle3D} from "./contracts";
// @ts-expect-error node strip-types needs the extension
import {angleArc,bondPart,placeAngleLabels} from "./visual-geometry.ts";
// @ts-expect-error node strip-types needs the extension
import {sanitizeScene,EXAMPLE_TRIGONAL} from "./scene.ts";
// @ts-expect-error node strip-types needs the extension
import {readAnnotations} from "./annotations.ts";

describe("teaching geometry",()=>{
  it("constructs correct trigonal bipyramidal arcs at 90, 120 and 180 degrees",()=>{
    assert.deepEqual(EXAMPLE_TRIGONAL.angles!.map(a=>angleArc(a)!.degrees),[90,120,180]);
    for(const a of EXAMPLE_TRIGONAL.angles!) {
      const arc=angleArc(a);assert.ok(arc);assert.equal(arc.points.length,33);
      assert.ok(arc.points.flat().every(Number.isFinite));assert.ok(arc.label.every(Number.isFinite));
    }
    assert.deepEqual(sanitizeScene(EXAMPLE_TRIGONAL),EXAMPLE_TRIGONAL);
  });
  it("rejects zero-length, coincident and invalid angle arms",()=>{
    for(const from of [[0,0,0],[NaN,0,0],[Infinity,0,0]] as Angle3D["from"][])assert.equal(angleArc({id:"invalid",from,vertex:[0,0,0],to:[1,0,0]}),null);
    assert.equal(angleArc({id:"coincident",from:[1,0,0],vertex:[0,0,0],to:[2,0,0]}),null);
  });
  it("resolves model angle references and drops unknown or degenerate references",()=>{
    const scene=sanitizeScene({...EXAMPLE_TRIGONAL,angles:[
      {id:"real",from:"atom-3",vertex:"centre",to:"atom-0"},
      {id:"bad",from:"missing",vertex:"centre",to:"atom-0"},
      {id:"zero",from:"centre",vertex:"centre",to:"atom-0"},
    ]});
    assert.ok(scene?.type==="model3d");assert.equal(scene.angles!.length,1);assert.equal(angleArc(scene.angles![0])!.degrees,90);
  });
  it("bonds join endpoints in any direction using the renderer's XYZ Euler order",()=>{
    for(const to of [[2,0,0],[0,2,0],[0,0,2],[-1,2,-3]] as Angle3D["from"][]){
      const p=bondPart("bond",[0,0,0],to,0.08);assert.ok(p);const [,y,z]=p.rot!;
      const dir=[Math.cos(y)*Math.cos(z),Math.sin(z),-Math.sin(y)*Math.cos(z)];
      dir.forEach((x,i)=>assert.ok(Math.abs(x*p.length-to[i])<1e-7));
      assert.deepEqual(p.pos,to.map(x=>x/2));
      const scene=sanitizeScene({type:"model3d",parts:[{id:"bond",shape:"bond",from:[0,0,0],to,radius:0.08}]});assert.ok(scene?.type==="model3d");assert.equal(scene.parts.length,1);
    }
    assert.equal(bondPart("bad",[0,0,0],[0,0,0],0.08),null);
  });
});

describe("screen sketches",()=>{
  it("accepts bounded primitives and strips executable/unknown fields",()=>{
    const annotations=readAnnotations([
      {kind:"pen",points:[[1,2],[3,4]],onload:"bad"},
      {kind:"arrow",from:[-50,50],to:[5000,800]},
      {kind:"ellipse",x:900,y:900,w:500,h:500},
      {kind:"text",x:5,y:5,text:"<img onerror=bad>"},
      {kind:"svg",html:"<script>bad</script>"},
    ]);
    assert.equal(annotations.length,4);assert.ok(!("onload" in annotations[0]));
    const arrow=annotations[1];assert.ok(arrow.kind==="arrow");assert.deepEqual(arrow.from,[0,50]);assert.deepEqual(arrow.to,[1000,800]);
    const ellipse=annotations[2];assert.ok(ellipse.kind==="ellipse");assert.equal(ellipse.w,100);assert.equal(ellipse.h,100);
  });
  it("caps lists and ignores malformed or nonfinite coordinates",()=>{
    assert.deepEqual(readAnnotations(null),[]);
    assert.deepEqual(readAnnotations([{kind:"text",x:NaN,y:1,text:"bad"},{kind:"pen",points:[[2,3]]}]),[]);
    const [stroke]=readAnnotations([{kind:"pen",points:Array(1000).fill([1,2])}]);assert.ok(stroke.kind==="pen");assert.equal(stroke.points.length,160);
    assert.equal(readAnnotations(Array(100).fill({kind:"text",x:1,y:2,text:"x"})).length,24);
  });
});


it("keeps projected degree labels clear of nearby atoms and one another",()=>{
  const atoms=[{x:110,y:100,radius:20}];
  const labels=placeAngleLabels([{x:100,y:100},{x:105,y:105},{x:100,y:106}],atoms,{width:400,height:300});
  for(let i=0;i<labels.length;i++){
    assert.ok(Math.hypot(labels[i].x-110,labels[i].y-100)>=37);
    for(let j=0;j<i;j++)assert.ok(Math.abs(labels[i].x-labels[j].x)>=48||Math.abs(labels[i].y-labels[j].y)>=26);
  }
});
