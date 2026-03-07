// @ts-check
import { assertElement } from '../utils/dom.js';

/**
 * @param {HTMLDialogElement} dialog
 */
export function initLightbox(dialog) {
  assertElement(dialog);
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('[data-lightbox-caption]');
  const closeButton = dialog.querySelector('[data-lightbox-close]');

  if (!(image instanceof HTMLImageElement)) {
    throw new Error('Lightbox image element missing');
  }

  if (closeButton instanceof HTMLElement) {
    closeButton.addEventListener('click', () => {
      dialog.close();
    });
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close();
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  return {
    open(src, title) {
      image.src = src;
      if (caption instanceof HTMLElement) {
        caption.textContent = title;
      }
      dialog.showModal();
    },
    close() {
      dialog.close();
    }
  };
}
