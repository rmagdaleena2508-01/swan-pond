# Swan Pond

An interactive swan pond in the browser, built with Three.js and WebGL. The pond moves from day through dusk into a firefly night. Release swans, touch the water, and call the rain or wind.

**Live site: [rmagdaleena2508-01.github.io/swan-pond](https://rmagdaleena2508-01.github.io/swan-pond/)**

## Run it

It is a static site with no build step. Serve the folder with any static server, for example:

```bash
python3 -m http.server 8820
```

Then open http://localhost:8820. Three.js 0.169.0 loads from jsDelivr through an import map, so the page needs an internet connection.

## Controls

- **Drag on the water** to make ripples. **Tap** for a single drop. At night, tapping near fireflies scatters them.
- **Swan cards**: tap a card to fly a swan in to an open spot, or drag a card onto the pond to pick where it lands. Up to 12 swans.
- **Sky dial** (top right): drag the sun around its path to set the time. Below the horizon line is night. Arrow keys work when the dial has focus.
- **Pause time / Resume time** and **Go to night / Go to day**.
- **Rain**, **Wind**, **Synchronous fireflies** toggles.
- **Calm** stops the rain and wind and settles the surface.
- **Clear pond**: every swan runs across the water and takes off.
- **Sound** is off until you turn it on.
- **Hide interface** for screen recording. Press **H** or tap **Show interface** to bring it back.

## How it works

| Part | File | Notes |
|---|---|---|
| Water surface | `src/sim.js` | Damped 2D wave equation on a 256² grid (176² on phones), stepped on the CPU at 60 Hz. Swans, lily pads and spray read the exact height under them. |
| Water look | `src/water.js` | Schlick Fresnel (F0 = 0.02) blend of a planar reflection and the water body. The body is the pond bed seen through Beer–Lambert absorption, with caustics in the shallows. Sun, moon and firefly glints come from the simulated normals. |
| Reflection | `src/reflection.js` | Mirror camera with oblique near-plane clipping, after three.js's `Reflector`. |
| Swans | `src/swans.js` | Procedural models with a skinned 8-bone neck. Alternating foot strokes give a surge-and-glide speed. Turns are slow, and a nearly stopped swan pivots on one foot. Each swan floats on the waves and writes its own wake. Swans feed, preen, flap, rest with their heads tucked at night, and raise their wings in a threat display (busking) or to sail on the wind. |
| Fireflies | `src/fireflies.js` | Based on *Photinus pyralis*: yellow-green light, a flash of about 0.5 s on the upswing of a J-shaped dip, every 5 to 7 s. Synchronous mode follows *Photinus carolinus*, with bursts of 5 to 8 flashes, about 8 s of darkness, and neighbours pulling each other into step. |
| Time of day | `src/time.js`, `src/sky.js` | One time value drives sky, sun, moon, stars, fog, light and water colour. |
| Sound | `src/audio.js` | Everything is synthesised with Web Audio. Sound fades in and out and pauses when the tab is hidden. |
| Interface | `src/ui.js`, `style.css` | |

The renderer lowers pixel ratio, reflection resolution and bloom if frames run slow, and raises them again when there is headroom. Add `?debug` to the URL to expose the scene objects on `window`.

## Deploy

Upload the folder as-is to any static host, such as GitHub Pages, Netlify or Vercel. No build step is needed.
