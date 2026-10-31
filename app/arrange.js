// Drag and drop for a page's Reorder / Arrange mode. Cards (items with data-key) are picked up with the
// mouse anywhere on the card, or on touch screens by their ⠿ grip (so the page still scrolls), and
// dropped anywhere in the rows of the same block.
//
//   Arrange.attach(root, { block, rows, items, onDrop(rowsOfKeys, blockEl) })
//     block  selector of the area a card stays in (e.g. one schedule section, one player's cards)
//     rows   selector of the containers cards sit in; an empty one (a "new row" zone) takes drops too
//     items  selector of the cards
// The page re-renders after onDrop saves the new order.
window.Arrange = (function () {
  'use strict';

  const grip = '<span class="arr-handle" aria-hidden="true">⠿</span>';
  let drag = null;

  function attach(root, opts) {
    root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest(opts.items);
      if (drag || !el || !root.contains(el) || !el.closest('.is-arranging') || e.button > 0) return;
      if (e.target.closest('.arr-x')) return; // a card's own remove button
      if (e.pointerType !== 'mouse' && !e.target.closest('.arr-handle')) return;
      e.preventDefault();
      drag = { el, opts, block: el.closest(opts.block), id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, lifted: false };
      addEventListener('pointermove', move);
      addEventListener('pointerup', end);
      addEventListener('pointercancel', end);
    });
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.lifted && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 5) return;
    if (!drag.lifted) lift();
    follow();
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', end);
    removeEventListener('pointercancel', end);
    drop();
  }

  function lift() {
    const { el } = drag;
    const r = el.getBoundingClientRect();
    drag.dx = drag.x0 - r.left;
    drag.dy = drag.y0 - r.top;
    drag.ph = document.createElement('div');
    drag.ph.className = 'arr-placeholder';
    drag.ph.style.height = `${r.height}px`;
    el.before(drag.ph);
    Object.assign(el.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
    el.classList.add('is-lifted');
    drag.lifted = true;
    drag.timer = setInterval(autoScroll, 16);
  }

  function follow() {
    const { el, opts } = drag;
    el.style.left = `${drag.x - drag.dx}px`;
    el.style.top = `${drag.y - drag.dy}px`;
    const under = document.elementFromPoint(drag.x, drag.y);
    const row = under && under.closest(opts.rows);
    if (!row || row.closest(opts.block) !== drag.block) return;
    // Reading order: the placeholder goes before the first card that's below or to the right of the pointer.
    const cards = [...row.querySelectorAll(opts.items)].filter((c) => c !== el && c.closest(opts.rows) === row);
    const next = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return drag.y < r.top || (drag.y <= r.bottom && drag.x < r.left + r.width / 2);
    });
    if (next) { if (next.previousElementSibling !== drag.ph) next.before(drag.ph); }
    else if (cards.length) { if (cards[cards.length - 1].nextElementSibling !== drag.ph) cards[cards.length - 1].after(drag.ph); }
    else if (drag.ph.parentElement !== row) row.prepend(drag.ph);
  }

  function autoScroll() {
    if (!drag) return;
    const edge = 60;
    const step = drag.y < edge ? -14 : drag.y > innerHeight - edge ? 14 : 0;
    if (step) { scrollBy(0, step); follow(); }
  }

  function drop() {
    const { el, opts, block, lifted } = drag;
    clearInterval(drag.timer);
    if (lifted) {
      drag.ph.replaceWith(el);
      el.classList.remove('is-lifted');
      el.removeAttribute('style');
    }
    drag = null;
    if (!lifted) return;
    const rows = [...block.querySelectorAll(opts.rows)]
      .map((row) => [...row.querySelectorAll(opts.items)].filter((c) => c.closest(opts.rows) === row).map((c) => c.dataset.key));
    opts.onDrop(rows, block);
  }

  return { attach, grip, get dragging() { return !!drag; } };
})();
