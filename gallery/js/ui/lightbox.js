// @ts-check
import { buildMuseumLabel } from '../utils/artwork.js';

/** @param {HTMLDialogElement} dialog */
export function initLightbox(dialog) {
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('[data-lightbox-caption]');
  const previous = dialog.querySelector('[data-lightbox-previous]');
  const next = dialog.querySelector('[data-lightbox-next]');
  const notice = dialog.querySelector('[data-lightbox-error]');
  let artworks = [];
  let index = 0;
  let opener;
  const render = () => {
    const artwork = artworks[index];
    image.src = artwork.image.lightboxUrl;
    image.alt = artwork.alt;
    caption.textContent = `${artwork.title} — ${buildMuseumLabel(artwork)}`;
    previous.disabled = index === 0;
    next.disabled = index === artworks.length - 1;
    notice.textContent = '';
  };
  const move = delta => {
    const target = index + delta;
    if (target < 0 || target >= artworks.length) return;
    index = target; render();
  };
  const close = () => dialog.close();
  dialog.querySelector('[data-lightbox-close]').addEventListener('click', close);
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => { image.removeAttribute('src'); opener?.focus({ preventScroll: true }); artworks = []; });
  image.addEventListener('error', () => { if (dialog.open) notice.textContent = 'The artwork image could not load. Close this view and try again.'; });
  return {
    /** @param {import('../types.d.js').Artwork[]} sequence @param {number} selected */
    open(sequence, selected) { artworks = sequence; index = selected; opener = document.activeElement; render(); dialog.showModal(); },
    close,
  };
}
