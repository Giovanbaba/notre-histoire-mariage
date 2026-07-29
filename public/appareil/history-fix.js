(() => {
  const MARK = 'lg-appareil-screen';
  let applyingHistory = false;
  let currentScreen = 'welcome';

  const byId = id => document.getElementById(id);
  const isReviewOpen = () => getComputedStyle(byId('review')).display !== 'none';

  function writeState(screen, replace = false) {
    currentScreen = screen;
    const state = { ...(history.state || {}), [MARK]: true, screen };
    if (replace) history.replaceState(state, '', location.href);
    else if (history.state?.[MARK] !== true || history.state?.screen !== screen) history.pushState(state, '', location.href);
  }

  async function restoreScreen(screen) {
    applyingHistory = true;
    currentScreen = screen;

    if (screen !== 'review' && isReviewOpen()) {
      if (typeof window.discardDraft === 'function') window.discardDraft();
      else byId('review').style.display = 'none';
    }

    if (screen === 'welcome') {
      if (typeof window.stopCamera === 'function') window.stopCamera();
      if (typeof window.show === 'function') window.show('welcome');
    } else if (screen === 'gallery') {
      if (typeof window.stopCamera === 'function') window.stopCamera();
      if (typeof window.show === 'function') window.show('gallery');
    } else if (screen === 'camera') {
      if (typeof window.show === 'function') window.show('camera');
      const video = byId('video');
      if (!video?.srcObject && typeof window.startCamera === 'function') {
        try { await window.startCamera(); } catch (_) {}
      }
    }

    applyingHistory = false;
  }

  function push(screen) {
    if (!applyingHistory) writeState(screen);
  }

  history.replaceState({ ...(history.state || {}), [MARK]: true, screen: 'welcome' }, '', location.href);

  byId('startBtn')?.addEventListener('click', () => push('camera'), true);
  byId('galleryBtn')?.addEventListener('click', () => push('gallery'), true);
  byId('thumb')?.addEventListener('click', () => push('gallery'), true);
  byId('backCamera')?.addEventListener('click', () => push('camera'), true);

  byId('shutter')?.addEventListener('click', () => {
    setTimeout(() => {
      if (isReviewOpen()) push('review');
    }, 80);
  });

  byId('retakeBtn')?.addEventListener('click', () => {
    if (history.state?.[MARK] && history.state.screen === 'review') history.back();
  });

  byId('keepBtn')?.addEventListener('click', () => {
    if (history.state?.[MARK] && history.state.screen === 'review') history.back();
  });

  byId('closeCamera')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    history.back();
  }, true);

  window.addEventListener('popstate', event => {
    const state = event.state;
    if (state?.[MARK]) restoreScreen(state.screen || 'welcome');
  });
})();
