// Interface wiring: sky dial, swan cards (click or drag to place), controls,
// hide-for-recording, and the first-visit hint.

import { clockLabel, phaseLabel } from './time.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

export function initUI(api) {
  const body = document.body;

  // --- Sky dial -------------------------------------------------------------
  const dial = $('dial'), sun = $('sunKnob'), moon = $('moonKnob');
  const C = 60, R = 44;
  function dialFromEvent(e) {
    const r = dial.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 120 - C;
    const y = C - ((e.clientY - r.top) / r.height) * 120;
    const phi = Math.atan2(y, x);
    // Sunrise sits on the left of the horizon, noon at the top, sunset on the right.
    return (((Math.PI - phi) / TAU + 0.25) % 1 + 1) % 1;
  }
  let dialDrag = false;
  dial.addEventListener('pointerdown', (e) => { dialDrag = true; dial.setPointerCapture(e.pointerId); api.setTime(dialFromEvent(e), true); });
  dial.addEventListener('pointermove', (e) => { if (dialDrag) api.setTime(dialFromEvent(e), true); });
  dial.addEventListener('pointerup', () => { dialDrag = false; });
  dial.addEventListener('pointercancel', () => { dialDrag = false; });
  dial.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 / 24 : 1 / 96;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { api.setTime(api.state().t + step, true); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { api.setTime(api.state().t - step, true); e.preventDefault(); }
  });

  const btnPlay = $('btnPlay'), btnJump = $('btnJump');
  btnPlay.addEventListener('click', () => {
    const on = btnPlay.getAttribute('aria-pressed') !== 'true';
    api.setPlaying(on);
    btnPlay.setAttribute('aria-pressed', String(on));
    btnPlay.textContent = on ? 'Pause time' : 'Resume time';
  });
  btnJump.addEventListener('click', () => api.jumpDayNight());

  let lastLabel = '';
  function renderTime(t, night) {
    const phi = Math.PI - (t - 0.25) * TAU;
    sun.setAttribute('cx', (C + R * Math.cos(phi)).toFixed(2));
    sun.setAttribute('cy', (C - R * Math.sin(phi)).toFixed(2));
    moon.setAttribute('cx', (C - R * Math.cos(phi)).toFixed(2));
    moon.setAttribute('cy', (C + R * Math.sin(phi)).toFixed(2));
    sun.style.opacity = String(0.35 + 0.65 * (1 - night));
    moon.style.opacity = String(0.25 + 0.75 * night);
    const label = clockLabel(t);
    if (label !== lastLabel) {
      lastLabel = label;
      $('clockTime').textContent = label;
      $('phase').textContent = phaseLabel(t);
      dial.setAttribute('aria-valuenow', (t * 24).toFixed(1));
      dial.setAttribute('aria-valuetext', `${label}, ${phaseLabel(t).toLowerCase()}`);
      btnJump.textContent = night > 0.5 ? 'Go to day' : 'Go to night';
    }
  }

  // --- Toggles --------------------------------------------------------------
  function toggle(id, fn) {
    const b = $(id);
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      fn(on);
    });
    return (on) => b.setAttribute('aria-pressed', String(on));
  }
  const setRainBtn = toggle('btnRain', api.setRain);
  const setWindBtn = toggle('btnWind', api.setWind);
  toggle('btnSync', api.setSync);
  toggle('btnSound', api.setSound);
  $('btnCalm').addEventListener('click', () => { api.calm(); setRainBtn(false); setWindBtn(false); });
  $('btnClear').addEventListener('click', () => api.clearPond());

  const menu = $('btnMenu'), controls = $('controls');
  menu.addEventListener('click', () => {
    const open = !controls.classList.contains('open');
    controls.classList.toggle('open', open);
    dismissHint();
    menu.setAttribute('aria-expanded', String(open));
  });

  // --- Hide interface -------------------------------------------------------
  const show = $('btnShow');
  let showT = 0;
  function peekShow() {
    show.classList.add('visible');
    clearTimeout(showT);
    showT = setTimeout(() => show.classList.remove('visible'), 2600);
  }
  function setHidden(h) {
    body.classList.toggle('ui-hidden', h);
    if (h) peekShow(); else show.classList.remove('visible');
  }
  $('btnHide').addEventListener('click', () => setHidden(true));
  show.addEventListener('click', () => setHidden(false));
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'h' || e.key === 'H') setHidden(!body.classList.contains('ui-hidden'));
  });
  window.addEventListener('pointerdown', () => { if (body.classList.contains('ui-hidden')) peekShow(); }, true);

  // --- Hint -----------------------------------------------------------------
  const hint = $('hint');
  let hintGone = false;
  function dismissHint() { if (hintGone) return; hintGone = true; hint.classList.add('gone'); }
  setTimeout(dismissHint, 9000);

  // --- Swan cards: tap to release, drag to choose the landing spot ---------
  const ghost = $('ghost');
  const cards = [...document.querySelectorAll('.card')];
  cards.forEach((card) => {
    let start = null, dragging = false;
    card.addEventListener('pointerdown', (e) => {
      if (card.disabled) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      dragging = false;
    });
    card.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragging && (dy < -10 || (e.pointerType === 'mouse' && Math.hypot(dx, dy) > 8))) {
        dragging = true;
        card.setPointerCapture(e.pointerId);
        ghost.innerHTML = card.querySelector('.sil').outerHTML;
        ghost.classList.add('on');
        dismissHint();
      }
      if (dragging) {
        ghost.style.left = e.clientX + 'px';
        ghost.style.top = e.clientY + 'px';
        api.previewDrop(e.clientX, e.clientY);
      }
    });
    const end = (e, cancelled) => {
      if (!start) return;
      if (dragging) {
        ghost.classList.remove('on');
        const overUI = document.elementsFromPoint(e.clientX, e.clientY).some((el) => el.closest && el.closest('.flock, .controls, .sky-dial'));
        if (!cancelled && !overUI) api.addSwan(card.dataset.species, e.clientX, e.clientY);
        api.previewDrop(null);
      } else if (!cancelled) {
        api.addSwan(card.dataset.species);
        dismissHint();
      }
      start = null; dragging = false;
    };
    card.addEventListener('pointerup', (e) => end(e, false));
    card.addEventListener('pointercancel', (e) => end(e, true));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.addSwan(card.dataset.species); } });
  });

  function renderCount(n, max) {
    $('count').textContent = n >= max ? `Pond is full · ${max} swans` : `${n} of ${max} on the pond`;
    cards.forEach((c) => { c.disabled = n >= max; });
  }

  return { renderTime, renderCount, dismissHint };
}
