// @ts-check
import { STRINGS } from '../constants.js';
import { assertElement, clearChildren } from '../utils/dom.js';

/**
 * @typedef {ReturnType<typeof import('../core/catalog.js').createExhibitViewModel>} ExhibitViewModel
 */

/**
 * @param {HTMLElement} container
 * @param {ExhibitViewModel[]} exhibits
 * @param {{
 *  initialIndex?: number;
 *  onOpenExhibit: (exhibitId: string) => void;
 *  onSlideChange: (index: number, exhibit: ExhibitViewModel | undefined) => void;
 * }} options
 * @returns {{ goTo: (index: number) => void } | null}
 */
export function renderExhibitCarousel(container, exhibits, options) {
  assertElement(container);
  clearChildren(container);

  if (!Array.isArray(exhibits) || exhibits.length === 0) {
    return null;
  }

  const { onOpenExhibit, onSlideChange, initialIndex = 0 } = options;

  const root = document.createElement('div');
  root.className = 'carousel';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', STRINGS.carouselRegionLabel);

  const viewport = document.createElement('div');
  viewport.className = 'carousel__viewport';
  const track = document.createElement('div');
  track.className = 'carousel__track';
  viewport.appendChild(track);
  root.appendChild(viewport);

  /** @type {HTMLElement[]} */
  const slides = [];
  /** @type {HTMLButtonElement[]} */
  const dots = [];

  exhibits.forEach((exhibit, index) => {
    const slide = document.createElement('article');
    slide.className = 'carousel__slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${index + 1} of ${exhibits.length}`);
    slide.innerHTML = `
      <div class="hero-slide">
        <p class="hero-slide__status">${exhibit.statusLabel}</p>
        <h2 class="hero-slide__title">${exhibit.title}</h2>
        ${exhibit.subtitle ? `<p class="hero-slide__subtitle">${exhibit.subtitle}</p>` : ''}
        <p class="hero-slide__dates">${exhibit.dateRangeText}</p>
        ${exhibit.blurb ? `<p class="hero-slide__blurb">${exhibit.blurb}</p>` : ''}
        <a class="link hero-slide__cta" data-carousel-open="${exhibit.id}" href="#/exhibits/${encodeURIComponent(
          exhibit.id
        )}">${STRINGS.viewExhibitCta}</a>
      </div>
    `;
    slides.push(slide);
    track.appendChild(slide);
  });

  /** @type {HTMLButtonElement | null} */
  let previousButton = null;
  /** @type {HTMLButtonElement | null} */
  let nextButton = null;

  if (exhibits.length > 1) {
    previousButton = document.createElement('button');
    previousButton.type = 'button';
    previousButton.className = 'carousel__control carousel__control--prev';
    previousButton.setAttribute('aria-label', STRINGS.carouselPreviousLabel);
    previousButton.innerHTML = '<span aria-hidden="true" class="carousel__control-icon">«</span>';

    nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'carousel__control carousel__control--next';
    nextButton.setAttribute('aria-label', STRINGS.carouselNextLabel);
    nextButton.innerHTML = '<span aria-hidden="true" class="carousel__control-icon">»</span>';

    const pagination = document.createElement('div');
    pagination.className = 'carousel__pagination';

    exhibits.forEach((_exhibit, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel__dot';
      dot.setAttribute('aria-label', `${STRINGS.carouselGoToLabelPrefix} ${index + 1}`);
      dot.addEventListener('click', () => {
        goTo(index);
      });
      dots.push(dot);
      pagination.appendChild(dot);
    });

    previousButton.addEventListener('click', () => {
      goTo(currentIndex - 1);
    });
    nextButton.addEventListener('click', () => {
      goTo(currentIndex + 1);
    });

    root.appendChild(previousButton);
    root.appendChild(nextButton);
    root.appendChild(pagination);
  }

  container.appendChild(root);

  let currentIndex = 0;

  /**
   * @param {number} nextIndex
   */
  function goTo(nextIndex) {
    if (exhibits.length === 0) {
      return;
    }

    const clamped = Math.max(0, Math.min(exhibits.length - 1, nextIndex));
    currentIndex = clamped;
    track.style.transform = `translateX(-${clamped * 100}%)`;

    slides.forEach((slide, index) => {
      slide.setAttribute('aria-hidden', index === clamped ? 'false' : 'true');
    });

    if (previousButton && nextButton) {
      previousButton.disabled = clamped === 0;
      nextButton.disabled = clamped === exhibits.length - 1;
    }

    if (dots.length > 0) {
      dots.forEach((dot, index) => {
        dot.classList.toggle('is-active', index === clamped);
      });
    }

    onSlideChange(clamped, exhibits[clamped]);
  }

  goTo(Number.isFinite(initialIndex) ? initialIndex : 0);

  slides.forEach((slide) => {
    const openLink = slide.querySelector('[data-carousel-open]');
    if (!(openLink instanceof HTMLElement)) {
      return;
    }

    openLink.addEventListener('click', (event) => {
      event.preventDefault();
      const exhibitId = openLink.getAttribute('data-carousel-open');
      if (exhibitId) {
        onOpenExhibit(exhibitId);
      }
    });
  });

  return {
    goTo(index) {
      goTo(index);
    }
  };
}
