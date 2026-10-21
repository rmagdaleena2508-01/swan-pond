# Swan Pond — build prompt for Claude Opus 5.5

Paste everything below the line into a fresh Claude Code session started in an empty folder.

---

<goal>
Build a full-screen, interactive swan pond in the browser with Three.js and WebGL. It should feel like a calm, real place you could stand beside. The pond has swans gliding on it and moves through day and night. At night, fireflies drift over the banks and their flashes glitter in the water. The bar is realism: the water, the light, the swans' motion and the fireflies should all behave the way they do in nature, and every interaction should feel smooth and immediate. This is a showcase piece, so be ambitious: go past the basics and polish every detail.
</goal>

<context>
- This replaces an earlier koi-pond concept. Fish dived and swam underwater. Swans float on the surface, so the drama moves to the surface: wakes, reflections, landings and light on the water.
- The person viewing it is on a laptop or a phone, often recording their screen. Smooth frame rate matters more than raw feature count. If a feature costs too much on mobile, scale it down rather than cutting it.
- Behaviour rules below come from field guides and biomechanics papers. Where a number is marked "estimate", treat it as a starting value to tune by eye, not a fact.
</context>

<tech>
- Three.js, pinned to an exact recent release and loaded through an import map from cdn.jsdelivr.net or unpkg.com. Use the `examples/jsm` add-ons where they help: `GPUComputationRenderer` for the water heightfield, `EffectComposer` with `UnrealBloomPass` for firefly glow, and `OrbitControls` only if you add a free-camera debug mode.
- Plain ES modules, no build step. Split code into a few modules (water, swans, fireflies, sky and time of day, audio, UI) so each part is easy to read.
- Web Audio API for all sound, synthesised or from small generated buffers. No external audio files.
</tech>

<scene>
Camera: a high three-quarter view looking down at the pond, about 35 to 50 degrees above the horizon, so you see the swans' necks and the reflections at the same time. Add a slow, subtle camera drift. A full top-down view would hide the reflections, which are the main visual payoff here.

Setting: an irregular natural pond with grassy banks, reeds and a few overhanging trees near the edges, so there is something to reflect and somewhere for fireflies to live.
</scene>

<water>
Make the water physically convincing. Build it from these parts:

1. Surface simulation: a GPU heightfield (ping-pong render targets via `GPUComputationRenderer`) solving the damped 2D wave equation. Every disturbance writes into it: pointer drags, raindrops, swan paddling and wakes, landings. Derive surface normals from the heightfield in the shader.
2. Reflection: planar reflection of the sky, trees, swans and fireflies, distorted by the surface normals. Blend reflection and refraction with Schlick's Fresnel approximation. At normal incidence water reflects only about 2% of light, rising towards 100% at grazing angles. So the far side of the pond should look mirror-like and the near side should show more of the water body.
3. Water body: depth-based colour absorption (Beer–Lambert). Shallow edges look tea-green and show the bed; deep water goes dark green-blue. Add soft animated caustics on the shallow bed in daylight only.
4. Small ambient waves: a few layered, low-amplitude normal-map or noise octaves for wind ripples, stronger in the "Wind" state described below.
5. Surface details: a sun glitter path by day and a moon glitter path by night, both from a sharp specular highlight broken up by the ripples. Add a little floating debris near the banks (a few lily pads and petals) that rides the heightfield.

Ripples from a point should spread as rings that fade and lose height with distance. Wakes should interfere and cross each other naturally because they all share one heightfield.
</water>

<swans>
Selection panel: an elegant translucent bar at the bottom with four swan cards: Mute Swan, Black Swan, Whooper Swan and Trumpeter Swan. Get each one's look right:
- Mute: white, orange bill with a black knob at the base, neck held in a graceful S-curve.
- Black: sooty black body, red bill with a white band near the tip, white flight feathers that show only when the wings open.
- Whooper: white, bill wedge of lemon-yellow on black, neck held straighter and more upright.
- Trumpeter: white, all-black bill, the largest of the four.

Clicking a card flies a swan in to a random open spot. Dragging from a card lets the user choose the landing point.

Landing: swans come in low on a shallow glide, wings spread, and ski in feet first. Their feet touch first, throw two long spray trails, and plough a short V-shaped furrow. Then the body settles and the wings fold. Write all of this into the heightfield.

Models: build 3D swans with a body, a jointed neck chain (at least 6 segments) for smooth S-curves, a head with eyes and bill, wings that can fold and open, a tail and webbed feet that are visible through the water near the edge. A low-poly body with good shading beats a high-poly one that drops frames.

Swimming motion:
- Swans paddle with alternating strokes of their webbed feet. Each stroke has a power phase and a slower recovery phase, so speed surges slightly with each stroke and decays in a glide between strokes. They are not constant-velocity objects.
- Cruising is slow and stately. Estimate: about 0.3 to 0.8 m/s, with a pond scaled so a swan is roughly 1.4 m long.
- Turning: a swan turns by paddling harder with the foot on the outside of the turn, and it can pivot almost in place by paddling with one foot only. Turns are slow and smooth, with the body yawing first, then the neck and head leading slightly into the new heading. No snapping or instant direction changes.
- Steering: use steering behaviours (wander, separation, gentle shore avoidance and occasional loose pairing, since swans often travel in pairs). Swans should keep a respectful distance and never overlap.
- The body pitches and rolls slightly on passing waves because it floats on the heightfield. Sample the height and normal under each swan.
- Each swan leaves a V-shaped Kelvin wake (half-angle about 19.5 degrees in deep water) plus a small bow wave, scaled with its speed.
- Idle behaviours on random timers: preening, dipping the head underwater to feed, a short wing flap with a stretch, and an occasional "busking" display (wings arched over the back) when another swan comes too close.

Day versus night behaviour: at night swans slow down, drift towards the banks and some rest with their head tucked back on their body, drifting gently on the water.
</swans>

<day_night>
Include a smooth, continuous day-night cycle with a sun/moon toggle button and a slider to scrub the time. A full cycle should take about 4 minutes when it runs on its own.

- Day: warm sun, soft blue sky, sun glitter path, caustics, bright reflections.
- Dusk and dawn: long golden light, pink-orange sky, long reflections. These transitions should be the most beautiful part.
- Night: deep blue-black sky with stars, a moon with a moon glitter path, cool low ambient light, gentle fog over the water. Swans become pale silhouettes lit mainly by the moon.

Drive lighting, sky, fog, water tint and exposure from one time-of-day value, so every transition is continuous and nothing pops.
</day_night>

<fireflies>
Fireflies appear from dusk onwards and fade out at dawn. Base their behaviour on the common eastern firefly (Photinus pyralis):

- Light: a yellow-green glow with a peak near 560 to 567 nm. It comes from a lantern on the underside of the tip of the abdomen, not the whole body.
- Flight: slow, wandering flight low over the grass and reeds, mostly within about 1 to 2 m of the ground and along the banks. A few cross over the open water. Males fly a "J-stroke": they dip, then flash on the upswing.
- Flash: each flash lasts about half a second, with a fast rise and slower fade. Repeat it every few seconds per insect, with natural jitter (estimate: about 5 to 7 seconds). Add an optional "Synchronous" toggle that switches to the synchronous-firefly pattern. In it, bursts of 5 to 8 quick flashes are followed by about 8 seconds of darkness. Neighbours pull each other into step: when a dark firefly sees a nearby flash, it starts its own burst sooner. Synchrony then spreads across the swarm over 20 to 30 seconds.
- Sparkle on the water: this is the key effect. Each flash must appear in the water's planar reflection. Moving ripples break the reflection into dancing glints, a short broken streak rather than a clean dot. Fireflies near the surface also cast a faint pool of light on the water and nearby reeds.
- Performance: draw fireflies as instanced emissive sprites with bloom. Give only the few brightest or nearest ones real point lights, about 4 to 8, and reassign them each frame. Support 80 to 150 fireflies on desktop and fewer on mobile.

Optional delight: tapping near a group of fireflies makes them scatter briefly and flash.
</fireflies>

<interaction>
- Touching or dragging on the water makes ripples, with strength matched to drag speed. Swans in the path turn away calmly and stay calm.
- Rain toggle: drops fall as streaks and make small ripple rings, with a dense, sparkly pattern on the surface. Swans keep swimming.
- Wind toggle (replaces the koi version's whirlpool): stronger surface ripples, reeds sway, swans drift downwind. Occasionally a swan raises its wings and sails with the wind, as mute swans really do.
- Calm button: stops rain and wind and lets the surface settle.
- Clear pond button: swans take off and fly away rather than vanishing. They run across the water with wingbeats and feet slapping the surface, leaving splash marks, then climb out of frame.
- Hide interface button for clean screen recording, restored with a tap or the H key.
- Every control responds within one frame and every transition is eased. Use no hard cuts anywhere.
</interaction>

<audio>
Add a Sound button that is off by default, as browsers require. Fade in and out over about 0.5 s on toggle and pause when the tab is hidden.

- Day: soft water lapping, a light breeze, occasional distant birdsong.
- Night: crickets and a few frogs, quieter water.
- Swans: soft paddling, an occasional low snort or hiss from a mute swan, and a bugle call from a whooper. The rhythmic "throbbing" wing sound plays only during takeoff and landing.
- Landing splash, takeoff splashes, rain, wind.
- Mix the ambience smoothly with the time of day.
</audio>

<ui>
- All labels and buttons in English.
- Translucent, minimal controls with a frosted-glass look. Use a refined typeface that is not Inter or Arial, for example a humanist serif for titles and a clean sans for controls, loaded from Google Fonts.
- Fully responsive. On a phone, the swan panel becomes a horizontal scroller and controls collapse into a compact menu. Touch targets are at least 44 px.
- Respect `prefers-reduced-motion`: keep the scene alive but calm the camera drift and soften transitions.
</ui>

<performance>
- Target 60 fps on a recent laptop and a smooth 30+ fps on a mid-range phone.
- Use adaptive quality: lower the heightfield resolution, reflection resolution, bloom and firefly count when frame time rises, and raise them again when there is headroom.
- Use instancing for fireflies, raindrops and spray particles. Reuse objects rather than allocating per frame. Cap device pixel ratio at 2.
- Support up to 12 swans at once. That is a realistic pond, and each swan is far richer than a fish.
</performance>

<process>
Work in this order and check each stage in a browser before moving on:
1. Water alone: heightfield, pointer ripples, reflection, Fresnel and the day-night lighting.
2. One swan: model, paddling glide, turning, wake, floating on waves.
3. Multiple swans: steering, landing from the panel, idle behaviours, night resting.
4. Fireflies and their reflections, then the synchronous mode.
5. Rain, wind, calm, clear pond, hide UI.
6. Audio.
7. Mobile layout, adaptive quality and reduced motion.

After each stage, look at the result critically against the realism goal and fix what looks off before continuing. Check especially for swans that turn too fast, ripples that look like rigid rings, and reflections that do not wobble. At the end, test on a narrow mobile viewport and check the console for errors. If you write temporary test files, delete them when you finish.
</process>

<deliverable>
A complete, working site in this folder: an `index.html` plus a small number of ES module files and a short README with how to run it (any static server) and a list of controls. Everything should work when served locally with no build step.
</deliverable>
