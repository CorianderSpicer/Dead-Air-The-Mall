// Browser end-to-end tests (needs Playwright: `npm i playwright && npx playwright install chromium`).
// Serve this folder (e.g. `python3 -m http.server 8766`) then: `node e2e.mjs [solo|mp] [players=2] [baseURL]`
// solo: scripted run-through of a seeded match (collect, complete every objective, escape) — logic, not skill.
// mp:   N browser contexts on THIS machine joined through the manual WebRTC offer/answer path. Proves the protocol
//       and sync work over loopback; it does NOT prove real devices on real networks connect (NAT/TURN). See README.
import { chromium } from 'playwright';
const mode = process.argv[2] || 'solo', N = +(process.argv[3] || 2), BASE = (process.argv[4] || 'http://localhost:8766/').replace(/\/?$/, '/');
const seed = 1234, q = 'low';
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
if (mode === 'solo') {
// full solo run-through using debug hooks: collect, complete objectives, escape. Plus forced jumpscare + death.
const p = await b.newPage({ viewport: { width: 1024, height: 700 } });
const errs=[]; p.on('pageerror', e => errs.push('PAGEERR '+e.message+' @ '+(e.stack||'').split('\n').slice(1,3).join(' '))); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto(''+BASE+'index.html?q='+q);
await p.click('#bSolo'); await p.fill('#seed', String(seed)); await p.click('#go');
await p.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 120000 });
await p.waitForTimeout(3000); await p.screenshot({ path: './e2e-r0.png' });
const out = await p.evaluate(async () => {
  const g = window.__game, log = []; const wait = ms => new Promise(r => setTimeout(r, ms));
  const tp = (x, y, z, lv) => { Object.assign(g.me, { x, y, z, lv }); };
  // collect everything that matters
  for (const it of [...g.items.values()]) { const d = g.match && it; const cat = (await import('./items.js')).ITEMS[it.item].cat; if (!['key', 'part', 'quest', 'tool'].includes(cat) && !['firstaid'].includes(it.item)) continue; tp(it.x, it.y, it.z, it.lv); g.handleAct(g.myId, { a: 'take', id: it.id }); }
  log.push('keys ' + g.me.keys.join(','), 'inv ' + g.me.inv.map(e => e.id + 'x' + e.n).join(','));
  for (let round = 0; round < 25; round++) {
    const act = g.match.objectives.filter(o => g.objActive(o)); if (!act.length) break;
    for (const o of act) { const s = o.steps[o.stage]; if (!s) continue;
      if (s.at) { const it = g.match.inter.find(i => i.id === s.at); tp(it.x + 0.5, it.y, it.z, it.lv); g.handleAct(g.myId, { a: 'inter', id: it.id }); log.push(`${o.id}:${s.kind}@${s.at} -> stage ${o.stage}${o.done ? ' DONE' : ''}`); }
      else if (s.kind === 'door') { const d = g.P.exits.alleyW; const pos = g.doorPos(d.id); tp(pos.x + 1, 0, pos.z, 'G'); g.handleAct(g.myId, { a: 'door', id: d.id }); log.push(`door -> ${o.stage} locked=${d.locked}`); }
      else if (s.kind === 'wait') { g.S.waitT = s.seconds + 1; await wait(400); log.push('waited'); }
      else if (s.kind === 'collect') log.push('collect pending ' + s.items.join(',') + ' ' + JSON.stringify(g.collected));
      else if (s.kind === 'reach') { const rm = g.P.room(s.zone); const pad = g.match.inter.find(i => i.id === 'flarepad'); if (s.zone === 'roof') tp(pad.x, pad.y, pad.z, 'R'); else tp((rm.r[0] + rm.r[2]) / 2, 0, (rm.r[1] + rm.r[3]) / 2, rm.lv[0]); await wait(800); log.push('reach ' + s.zone + ' st=' + g.me.st); }
    }
    await wait(50);
  }
  log.push('objs: ' + g.objView().map(o => `${o.id}:${o.done ? 'done' : o.active ? 'act' : 'wait'}`).join(' '));
  log.push('power ' + g.S.power + ' ended ' + g.ended + ' me ' + g.me.st);
  return log;
});
console.log(out.join('\n'));
await p.waitForTimeout(2500); await p.screenshot({ path: './e2e-r1.png' });

} else {
// N browser contexts on one machine, connected through the MANUAL WebRTC offer/answer path (no broker).
const pages = []; const errs = [];
for (let i = 0; i < N; i++) { const ctx = await b.newContext({ viewport: { width: 800, height: 560 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(`[p${i}] ` + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' '))); p.on('console', m => { if (m.type() === 'error') errs.push(`[p${i}] ` + m.text()); }); await p.goto(BASE + 'index.html?q=low'); await p.fill('#nm', 'Ofc' + i); pages.push(p); }
const H = pages[0];
await H.evaluate(() => window.__app.hostLobby('manual'));
for (let i = 1; i < N; i++) {
  await H.evaluate(() => window.__app.makeInvite()); await H.waitForTimeout(500);
  const offer = await H.evaluate(i => window.__app.lobby.invites[i - 1].text, i);
  const C = pages[i]; await C.evaluate(() => window.__app.joinManual()); await C.fill('#offer', offer); await C.click('#mk');
  await C.waitForFunction(() => window.__lastReply, null, { timeout: 15000 }); const reply = await C.evaluate(() => window.__lastReply);
  console.log(`invite ${i}: offer ${offer.length} chars, reply ${reply.length} chars`);
  await H.evaluate(([i, r]) => window.__app.acceptAnswer(i - 1, r), [i, reply]);
  await C.waitForFunction(() => window.__app.lobby && window.__app.lobby.me, null, { timeout: 15000 });
  await C.waitForTimeout(400); await C.click('#rdy');
}
await H.waitForTimeout(1200);
console.log('host lobby:', JSON.stringify(await H.evaluate(() => window.__app.lobby.players.map(p => [p.name, p.slot, p.ready]))));
await H.screenshot({ path: './e2e-lobby.png' });
await H.click('#start');
await Promise.all(pages.map(p => p.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 180000 })));
console.log('all running');
await H.waitForTimeout(2000);
// host walks; check a client sees the host move. Client picks up an item; host sees it gone.
const before = await pages[1].evaluate(() => { const g = window.__game; const h = g.players.get('h'); return [h.x, h.z]; });
await H.evaluate(() => { const g = window.__game; g.me.x += 2; g.me.z -= 3; });
await H.waitForTimeout(1500);
const after = await pages[1].evaluate(() => { const g = window.__game; const h = g.players.get('h'); return [h.x, h.z, g.mon.x, g.mon.z, g.mon.st]; });
const hostMon = await H.evaluate(() => [window.__game.AI.x, window.__game.AI.z]);
console.log('client view of host before', before, 'after', after, 'host monster', hostMon);
const pick = await pages[1].evaluate(async () => { const g = window.__game; const it = [...g.items.values()][0]; Object.assign(g.me, { x: it.x, y: it.y, z: it.z, lv: it.lv }); await new Promise(r => setTimeout(r, 3500)); g.act({ a: 'take', id: it.id }); await new Promise(r => setTimeout(r, 3500)); return { id: it.id, item: it.item, stillThere: g.items.has(it.id), myInv: [...g.me.inv.map(e => e.id), ...g.me.keys] }; });
const hostSees = await H.evaluate(id => { const g = window.__game; const c = [...g.players.values()].find(p => p.id !== 'h'); return { itemGone: !g.items.has(id), clientInv: [...c.inv.map(e => e.id), ...c.keys], clientPos: [c.x, c.z] }; }, pick.id);
console.log('client pickup', JSON.stringify(pick), 'host sees', JSON.stringify(hostSees));
// door sync
const door = await H.evaluate(() => { const g = window.__game; const d = g.P.doors.find(d => !d.locked && d.kind !== 'elev' && d.lv === 'G'); const pos = g.doorPos(d.id); Object.assign(g.me, { x: pos.x + 0.8, z: pos.z, y: 0, lv: 'G' }); g.handleAct('h', { a: 'door', id: d.id }); g.flushEvs(); return [d.id, d.open]; });
await H.waitForTimeout(800); console.log('door', door, 'client sees open=', await pages[1].evaluate(id => window.__game.P.doors[id].open, door[0]));
// hit a client, check it goes injured on both sides and jumpscare runs on the victim only
const victim = await pages[1].evaluate(() => window.__game.myId);
await H.evaluate(v => { const g = window.__game; g.monsterEvent({ type: 'hit', pid: v, variant: 'grab' }); g.monsterEvent({ type: 'hit', pid: v, variant: 'lunge' }); g.flushEvs(); }, victim);
await H.waitForTimeout(500); await pages[1].screenshot({ path: './e2e-mp_victim.png' });
console.log('victim', JSON.stringify(await pages[1].evaluate(() => ({ st: window.__game.me.st, hp: window.__game.me.health, scare: !!window.__game.scare }))), 'host sees', await H.evaluate(v => window.__game.players.get(v).st, victim));
// revive by host
await H.evaluate(v => { const g = window.__game; const c = g.players.get(v); Object.assign(g.me, { x: c.x + 0.8, z: c.z, y: c.y, lv: c.lv }); g.handleAct('h', { a: 'revive', pid: v }); g.flushEvs(); }, victim);
await H.waitForTimeout(800); console.log('after revive', await pages[1].evaluate(() => window.__game.me.st + ' ' + window.__game.me.health));
await H.screenshot({ path: './e2e-mp_host.png' });
// disconnect last client
if (N > 2) { await pages[N - 1].close(); await H.waitForTimeout(14000); console.log('after drop', await H.evaluate(() => [...window.__game.players.values()].map(p => p.name + ':' + p.st).join(' '))); }

}
await b.close();
