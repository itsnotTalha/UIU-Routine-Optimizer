// Pointer events support mouse, pen and touch without blocking normal list scrolling.
window.initPrioritySorting = function(container, commit) {
  let drag = null;
  let frame = 0;
  function stop(cancelled = false) {
    cancelAnimationFrame(frame);
    if (!drag) return;
    const state = drag;
    drag = null;
    state.item.classList.remove('priority-dragging');
    if (container.hasPointerCapture(state.pointerId)) container.releasePointerCapture(state.pointerId);
    document.body.classList.remove('priority-sorting');
    if (cancelled) {
      state.parent.insertBefore(state.item, state.next?.parentElement === state.parent ? state.next : null);
    } else if (state.moved) {
      commit('Priority order updated.');
    }
  }
  window.cancelPriorityDrag = () => stop(true);
  function place() {
    if (!drag?.moved) return;
    const {parent, item, y} = drag;
    const siblings = [...parent.children].filter(el => el !== item);
    const before = siblings.find(el => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if (item.nextElementSibling !== (before || null)) parent.insertBefore(item, before || null);
  }
  function scroll() {
    if (!drag) return;
    if (drag.moved) {
      const rect = drag.scroller.getBoundingClientRect();
      const speed = drag.y < rect.top + 55 ? -9 : drag.y > rect.bottom - 55 ? 9 : 0;
      if (speed) { drag.scroller.scrollTop += speed; place(); }
    }
    frame = requestAnimationFrame(scroll);
  }
  container.onpointerdown = event => {
    const handle = event.target.closest('.priority-drag-handle');
    if (!handle || event.button !== 0 || !event.isPrimary) return;
    const item = handle.closest('.faculty-rank-row') || handle.closest('.faculty-rank-group');
    let scroller = container.parentElement;
    while (scroller.parentElement && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    drag = {item, parent:item.parentElement, next:item.nextElementSibling, pointerId:event.pointerId, startY:event.clientY, y:event.clientY, moved:false, scroller};
    container.setPointerCapture(event.pointerId);
    frame = requestAnimationFrame(scroll);
  };
  container.onpointermove = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.y = event.clientY;
    if (!drag.moved && Math.abs(drag.y - drag.startY) > 6) {
      drag.moved = true;
      drag.item.classList.add('priority-dragging');
      document.body.classList.add('priority-sorting');
    }
    place();
  };
  container.onpointerup = () => stop();
  container.onpointercancel = () => stop(true);
  container.onlostpointercapture = () => stop(true);
  container.onkeydown = event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); stop(true); }
  };
};
