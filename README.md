# DEAD AIR: THE MALL

A first-person co-op survival horror game for iPad Safari and desktop browsers. You play a police officer whose bodycam is still recording inside Hollowbrook Galleria, a shopping mall that has been abandoned for nine years. Something the officers call **the Tenant** lives there now. Play solo, or with up to 4 officers over peer-to-peer WebRTC. No game server is involved.

Everything is in **one flat folder**: no build step, no subfolders, no Node server, and every path is relative. All models, textures and sounds are generated in code when the game runs.

---

## Deploy to GitHub Pages

1. Create a new repository on GitHub (for example `dead-air`).
2. Upload **every file in this folder** to the root of the repository. On GitHub that's *Add file → Upload files*: drag them all in, then commit. Keep them flat. Do not put them in a subfolder.
3. Go to **Settings → Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**, then **Branch: `main` / `(root)`**, and Save.
4. After a minute or so the game is live at `https://<your-user>.github.io/dead-air/`.
5. On an iPad: open that URL in Safari, then *Share → Add to Home Screen*. This gives you a fullscreen, app-like launch. Play in landscape and wear headphones.

If you use git instead of the web upload:
```bash
git init && git add . && git commit -m "DEAD AIR" && git branch -M main
git remote add origin https://github.com/<you>/dead-air.git && git push -u origin main
```

**Running it locally.** ES modules don't load from `file://`, so serve the folder with any static server. For example: `python3 -m http.server 8000`, then open `http://localhost:8000/`.

---

## Controls

| | iPad (touch) | Keyboard + mouse |
|---|---|---|
| Move | Left thumb anywhere on the left side (floating joystick) | WASD / arrow keys |
| Look | Drag on the right side | Mouse (click the view to lock the pointer) |
| Sprint | **» RUN** (hold, or set to toggle) | Shift |
| Crouch | **▾ CROUCH** (toggle) | Ctrl or C |
| Interact | **✋ USE** (tap, or hold for longer actions; a ring shows progress) | E (tap / hold) |
| Flashlight | **◐ LIGHT** | F |
| Belt (inventory) | ▤ top bar, or tap the hotbar | Tab / I, keys 1–6 use a slot, G drops |
| Map & objectives | ⌖ | M |
| Ping a spot for your team | ◎ | Q |
| Quick battery / quick heal | — | R / H |
| Menu | ❚❚ | Esc / P |

In Settings you can change touch and mouse sensitivity, joystick size, button size, left-handed layout, invert Y, sprint-toggle, sprint at the joystick edge, hold-to-crouch, FOV, head bob, VHS filter strength, the volume of each sound channel, graphics quality (Low, Medium or High) and reduced-intensity jumpscares.

---

## What's in the game

- **The mall.** It is fully 3D across four levels:
  - **Basement:** parking, loading dock, generator, electrical and maintenance tunnels.
  - **Ground floor:** atrium with fountain, supermarket, 20+ named shops, food court, restrooms, security office and customer service.
  - **Upper floor:** cinema with projection booth, arcade, department store, management offices, security control and first aid.
  - **Roof:** helipad.
  - The levels are joined by stairwells, twin escalators and a working elevator. All of it is walkable geometry, and the node tests check it with the real player controller.
  - **Uneven decay.** Each room rolls a condition: *intact*, *worn*, *damaged*, *wrecked* or *strangely untouched*. That condition drives the clutter, fallen ceiling tiles, broken glass, puddles, flickering lights and shutters left open, half-open or closed.
  - **Moving details.** Rain falls at the entrance. Signs and lights flicker, and power can come back on. You hear drips, creaks and HVAC hum, and the PA plays warped muzak once the power is back.
- **Bodycam presentation.** A VHS/bodycam post-process adds:
  - barrel distortion, chroma bleed, scanlines and a rolling tracking band;
  - noise, and "dead air" static that rises when the Tenant is near.

  The overlay shows REC, a timestamp, and your badge and unit. The filter strength is adjustable.
- **The Tenant.** An original 2.7 m creature, procedurally built and animated: an eyeless skull with a hinged jaw, a rusted PA horn grown through its throat, and the rags of a night-guard vest.
  - **AI states:** roam, patrol, listen, investigate, search, stalk, hunt, chase, attack, lost, retreat, flinch and seek-hide.
  - **What it reacts to:**
    - footsteps (crouch, walk or sprint, louder on metal and quieter on carpet);
    - doors, shutters, dropped items, machinery and flares;
    - your flashlight, and whether you're standing in light.
  - **Fair rules:**
    - it needs real line of sight;
    - it attacks only within reach after a telegraphed wind-up, never through walls (the tests check this);
    - you hear footfalls, horn static and a scream before it strikes;
    - holding your beam on its face can make it flinch.
  - If it sees you get into a locker, it checks that locker.
- **Objectives.** Each match is randomised with 3–6 objectives, built from these templates:
  - restore power (fuses, a generator part, then a loud generator start-up);
  - security cameras (which then show the monster on the map), optionally needing three coloured keycards;
  - emergency comms (which add teammate ranges to your HUD);
  - the entrance access code.

  Optional risk/reward objectives: the missing guard (who drops a keycard and keys), a heavy classified container (no sprinting while you carry it), research documents, and restoring the elevator.

  There are 5 escape routes: main entrance keypad, loading dock, parking gate (vehicle keys), rooftop helicopter (flare, then survive the wait), and the chained west emergency exit.

  Items are placed with progressive reachability, so every chain is solvable. This is verified across 150 seed/route combinations.
- **Items.** Spawns are weighted and synced, and every item sits physically in the world with a glint.
  - **Batteries:** AA, large pack, emergency cell, and a rechargeable that refills itself once the power is on.
  - **Medical:** bandage, first aid kit, painkillers, medical supplies.
  - **Keys and keycards.**
  - **Tools:** crowbar (loud), wire cutters, lockpick, screwdriver.
  - **Other:** radio, map, motion detector, flares.

  You have a 6-slot belt plus a keyring for keys and evidence. You can drop items (which makes noise), give them to a teammate, and inspect them; the code note shows the code.
- **Health.** Healthy, then injured, then downed, then dead. Teammates can revive you; a first aid kit makes it faster. Solo, you can patch yourself up once if you carry a first aid kit. Otherwise the run ends and you can retry the same mall or start a new one.
- **Jumpscares.** They depend on context (lunge, grab, doorway, from behind, lifted, pulled out of hiding). The camera is forced to look at the monster and your torch fails. There are also cosmetic false alarms: a silhouette at the end of a corridor, a light bursting, a payphone ringing, knocking inside a stall, a cart rolling past, footsteps behind you, the PA waking up, and your radio whispering your name. **Reduced intensity** mode makes scares shorter and quieter, removes the camera whip and gives fewer false alarms.
- **Difficulty and modifiers.**
  - **Difficulties:** Normal, Hard and Nightmare. They change supplies, damage, bleed-out time, monster senses and the number of objectives.
  - **Modifiers:** Power Failure, Heavy Fog, Emergency Lockdown, Limited Batteries, Increased Aggression, Unstable Electricity (brownouts) and Reduced Visibility.

---

## Multiplayer (and its honest limits)

**Topology.** The host's device runs the authoritative world:
- the monster AI, items, doors, shutters and the elevator;
- objectives, health, damage and revives.

Every change is broadcast as an event. Clients send their own movement 15 times a second and the host relays it. This means the **host's device does the most work**, so use the newest device and keep it plugged in. Clients report their own position and the host trusts them. That's fine among friends, but the game is not cheat-proof.

**Two ways to connect:**
1. **Room code (needs internet for the handshake only).** The host taps *Host with a room code* and friends enter the 5-letter code, or scan the QR. Discovery uses the **free public PeerJS broker** (`0.peerjs.com`), a volunteer-run service with no uptime guarantee. After the handshake, all traffic goes directly between devices.
2. **Offline / manual (no broker at all).** The host taps *Host offline* and then *Create invite*. The joining player scans the QR (or pastes the code) and gets a reply code, which the host then scans or pastes. Repeat once for each player. This works on a shared Wi-Fi network even without internet. The codes are compressed SDP of about 560 characters.

**What can fail, and why.** WebRTC needs both devices to reach each other directly. The game uses public STUN servers (Google and Cloudflare) to find your public address, but **it ships no TURN relay**, because those cost money to run. So:
- Two devices on the same Wi-Fi: usually works.
- Two homes on ordinary broadband: usually works.
- Behind symmetric NAT, which is common on **cellular hotspots**, corporate, school and hotel networks and some CGNAT ISPs: **may not connect at all.**
- The fix is a TURN server. You can run your own (for example coturn) or use a provider. Enter its URL, username and password under **Settings → Network** on every device.

Other limits:
- There is no mid-match joining.
- If the host leaves, the match ends.
- A client that goes quiet for about 9 seconds (closed tab, sleeping iPad) is dropped. Its items fall to the floor where it was.
- In multiplayer the pause menu does not freeze the game.

---

## Performance

- **Quality presets** (picked automatically, changeable in Settings):
  - **Low:** 0.6× render scale, 3 pooled lights.
  - **Medium:** 0.8×, 6 lights.
  - **High:** 1.0×, 9 lights, flashlight shadows, real spotlights on teammates.
- **How the mall is drawn:**
  - Static geometry is merged per material into 24 m chunks.
  - Lamp panels are instanced. A small pool of point lights follows the lamps nearest the camera.
  - Whole floors are hidden when you can't see them.
  - Items beyond 30 m are culled.
- iPads with 4 or fewer CPU cores default to **Low**. On an older iPad, if it stutters, lower the quality and the VHS strength.

---

## Files (all in this one folder)

| File | What it is |
|---|---|
| `index.html`, `style.css`, `icon.svg` | Page, UI styles, icon |
| `main.js` | Menus, solo setup, lobby (room code and QR), loading, pause, settings, results |
| `game.js` | Match orchestration: host simulation, events, interaction, jumpscares, false alarms, networking glue |
| `player.js`, `controls.js` | First-person controller; touch, keyboard and mouse input |
| `mallplan.js` | Mall layout, walkable surfaces, collision, line of sight, A* navigation |
| `mall3d.js`, `props.js`, `textures.js` | Building and furnishing the 3D mall; about 70 procedural props; procedural textures |
| `engine.js` | Renderer, VHS/bodycam shader, light pool, fog, rain |
| `monster.js`, `monstermodel.js` | The Tenant's AI; its procedural model and animation |
| `objectives.js`, `items.js` | Objective generator with solvability; item catalogue and weighted loot |
| `scene.js`, `hud.js`, `audio.js` | Runtime meshes (items, officers, objective props); HUD, map and inventory; synthesised audio |
| `net.js`, `save.js`, `util.js` | WebRTC (PeerJS and manual), settings storage, helpers |
| `three.module.js`, `peerjs.min.js`, `qrcode.js`, `jsQR.js` | Local copies of the libraries (see `LICENSES.txt`) |
| `*.woff2` | Local fonts (VT323, Oswald, Inter; OFL) |
| `test.mjs` | Node logic tests: `node test.mjs` |
| `e2e.mjs` | Playwright browser tests: `node e2e.mjs solo` / `node e2e.mjs mp 4` |

---

## Testing: what was verified, and what wasn't

**Verified in this build:**
- **`node test.mjs`:** 2,404 assertions pass.
  - 150 seed/route/difficulty combinations are all solvable from the start.
  - The real player controller walks from the entrance to the basement, the upper floor and the roof, using stairs and escalators.
  - In 25 wall cases, the monster never landed a hit through a wall.
  - Stealth and noise behave as intended.
  - Loot scales with difficulty and modifiers.
  - Belt and keyring rules hold, and connection codes round-trip.
- **Headless Chrome, solo:**
  - Start a seeded match, collect items, complete every objective, escape, and reach the results screen with no page errors.
  - Forced jumpscare: the scare sequence plays and health drops.
  - Inventory and map panels open.
  - Emulated iPad touch: the joystick moves you, right-side drag turns the camera, and the LIGHT button toggles the flashlight.
- **Headless Chrome, 2 and 4 browser contexts on one machine, using the manual offer/answer path:**
  - the lobby fills and everyone readies;
  - all players load the same mall;
  - clients see the host move and see the same monster position;
  - a client pickup removes the item for everyone;
  - doors sync;
  - a monster hit on a client downs them on both sides and plays the scare only on the victim;
  - the host revives them;
  - closing a tab drops that player after the heartbeat timeout.

**Not verified (please treat as untested):**
- **Real iPads.** Frame rate, Safari audio quirks, the feel of the touch controls and the camera QR scanner have not been tested on a physical device. Everything above ran in software-rendered headless Chrome.
- **Four browser tabs on one machine are not four devices on four networks.** Those tests prove the protocol and state sync work over loopback. They do not prove that NAT traversal works between real homes or cellular networks. See the TURN notes above.
- **The PeerJS room-code path.** The test sandbox had no access to the public broker, so only the manual path was exercised end to end.
- **Balance** (battery drain, monster speed, damage) was tuned by reasoning and short runs, not long playtests.
