// @ts-check
import { siteTopics } from './generated/routes.js';

const TOPIC_QUERY = 'topic';
/**
 * Shared URL state for the personal content views.
 * @param {{navigation: HTMLElement, render: (topic: string | null) => void}} options
 */
export function initializeTopics({ navigation, render }) {
  function readTopic() {
    const value = new URL(location.href).searchParams.get(TOPIC_QUERY);
    if (value !== null && !siteTopics.includes(value)) throw new Error(`Unknown content topic: ${value}`);
    return value;
  }
  let selected = readTopic();
  function update(focus) {
    navigation.replaceChildren(...[null, ...siteTopics].map(topic => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'card-kicker-tag';
      button.textContent = topic || 'All'; button.dataset.filterTag = topic || '';
      button.setAttribute('aria-pressed', String(topic === selected));
      button.addEventListener('click', () => window.toggleProjectFilter(topic));
      return button;
    }));
    render(selected);
    if (focus) navigation.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }
  window.toggleProjectFilter = topic => {
    if (topic !== null && !siteTopics.includes(topic)) throw new Error(`Unknown content topic: ${topic}`);
    selected = topic === selected ? null : topic;
    const url = new URL(location.href);
    if (selected === null) url.searchParams.delete(TOPIC_QUERY);
    else url.searchParams.set(TOPIC_QUERY, selected);
    history.pushState(null, '', url);
    update(true);
  };
  const restore = () => { selected = readTopic(); update(true); };
  window.addEventListener('popstate', restore);
  update(false);
  return () => window.removeEventListener('popstate', restore);
}
