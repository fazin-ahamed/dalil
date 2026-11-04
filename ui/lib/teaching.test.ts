import {describe,it} from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error node strip-types needs the extension
import {plainSpeech,readLesson,lessonFor,captionDuration,beatAtOffset,allowsDesktopActions} from "./teaching.ts";
// @ts-expect-error node strip-types needs the extension
import {EXAMPLE_TRIGONAL} from "./scene.ts";

describe("quiet teaching cues",()=>{
  it("removes Markdown and code from spoken text",()=>{
    assert.equal(plainSpeech("## Idea\n**Look here.** [A source](https://example.com)\n```js\nnot spoken();\n```"),"Idea Look here. A source");
  });
  it("splits prose into short captions without losing words",()=>{
    const text="This explanation teaches one useful idea at a time and shows the exact target as each new thought appears. ".repeat(8);
    const beats=readLesson([{text}]);assert.ok(beats.length>1);
    assert.ok(beats.every(beat=>beat.text.length<=120&&beat.text.split(/\s+/).length<=22));
    assert.equal(beats.map(beat=>beat.text).join(" "),text.trim());
    assert.equal(readLesson([{text:"These two axial bonds face opposite directions: 180 degrees."}]).length,1);
    assert.ok(readLesson([{text:"x".repeat(1200)}])[0].text.length<=120);
  });
  it("keeps only real part, diagram or angle targets",()=>{
    const beats=readLesson([{text:"Look at the centre.",target:"centre"},{text:"Read the angle.",target:"90"},{text:"Unknown target.",target:"not-a-part"}],EXAMPLE_TRIGONAL);
    assert.equal(beats[0].target,"centre");assert.equal(beats[1].target,"90");assert.ok(!("target"in beats[2]));
    assert.deepEqual(readLesson([{text:null},null,12]),[]);
    assert.equal(readLesson(Array(100).fill({text:"A short cue."})).length,32);
  });
  it("uses real geometry rather than angle ids to build a fallback lesson",()=>{
    const model={...EXAMPLE_TRIGONAL,angles:EXAMPLE_TRIGONAL.angles!.map((angle,index)=>({...angle,id:`angle-${index}`}))};
    const beats=lessonFor("A full answer kept in chat.",model);
    assert.ok(beats.some(beat=>beat.text.includes("90 degrees")&&beat.target==="angle-0"));
    assert.ok(beats.some(beat=>beat.text.includes("120 degrees")));
    assert.ok(beats.some(beat=>beat.text.includes("180 degrees")));
  });
  it("maps speech offsets to cues and gives fallback readers enough time",()=>{
    const beats=[{text:"First."},{text:"Second thought."}];
    assert.equal(beatAtOffset(beats,0),0);assert.equal(beatAtOffset(beats,7),1);assert.equal(beatAtOffset(beats,1000),1);
    assert.equal(captionDuration("One word."),2400);assert.equal(captionDuration("word ".repeat(100)),7500);
  });
});


it("keeps conceptual teaching on the custom pointer while allowing explicit app requests",()=>{
 for(const text of ["Explain trigonal bipyramidal", "How do I convert octal to binary?", "Please teach me chemistry", "Draw a diagram of this process"])
   assert.equal(allowsDesktopActions(text),false,text);
 for(const text of ["Open Chrome", "Select the field for me", "Explain this and open Chrome", "Fill this form"])
   assert.equal(allowsDesktopActions(text),true,text);
 assert.equal(plainSpeech("2 * 8 + 5 × 1"),"2 times 8 + 5 times 1");
});
