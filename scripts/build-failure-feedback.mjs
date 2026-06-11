#!/usr/bin/env node
// build-failure-feedback.mjs — generate the per-agent PHASE_1_ISSUES_FILE fed to the
// NEXT phase. Includes TestSprite error + root-cause + recommended-fix + failed-step
// for each failing test (NOT just names) so agents get ACTIONABLE feedback.
// Run AFTER scoring + fetch-test-details. Usage: UPTO=<N> node scripts/build-failure-feedback.mjs
import fs from 'node:fs';
const N=process.env.UPTO||'5';
const led=JSON.parse(fs.readFileSync('scores/world-cup-2026-v3.verdicts.json','utf8')).agents;
const labels=JSON.parse(fs.readFileSync('scores/world-cup-2026-v3.json','utf8')).phase_labels;
const phs=Array.from({length:+N},(_,i)=>String(i+1));
const clip=(s,n)=>{s=(s==null?'':String(s)).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n)+'…':s;};
for(const slug of Object.keys(led)){
  let md=`# ${slug} — failures through phase ${N} (scored vs phase-${N} deploy)\n\nGrading re-runs ALL plans (phases 1..N) against the current deploy. For EACH failing test below you get TestSprite's actual error, the root-cause hypothesis, and the recommended fix — USE THEM to fix the feature. Do NOT regress tests that currently pass.\n`;
  let n=0;
  for(const p of phs){
    const bad=(led[slug]?.[p]??[]).filter(x=>x.verdict!=='passed');
    if(!bad.length)continue;
    md+=`\n## Phase ${p} · ${labels[p]} — ${bad.length} failing\n`;
    for(const b of bad){
      n++;
      md+=`\n### [${b.verdict}] ${b.name}\n`;
      if(b.error_message) md+=`- **Error:** ${clip(b.error_message,400)}\n`;
      if(b.root_cause_hypothesis) md+=`- **Root cause:** ${clip(b.root_cause_hypothesis,400)}\n`;
      if(b.recommended_fix_target){const rf=b.recommended_fix_target; const t=typeof rf==='object'?[rf.reference,rf.rationale].filter(Boolean).join(' — '):rf; md+=`- **Recommended fix:** ${clip(t,400)}\n`;}
      if(Array.isArray(b.recorded_steps)&&b.recorded_steps.length){const last=b.recorded_steps[b.recorded_steps.length-1]; md+=`- **Failed at step:** ${clip((last.action||'')+' → '+(last.observation||last.status||''),300)}\n`;}
      if(!b.error_message&&!b.root_cause_hypothesis&&!b.recommended_fix_target) md+=`- (no TestSprite analysis available for this one — inspect the assertion: "${b.name}")\n`;
    }
  }
  fs.writeFileSync(`/tmp/${slug}-thru-phase${N}.md`,md);
  console.log(`${slug}: ${n} failing thru phase ${N} (now WITH error/root-cause/fix)`);
}