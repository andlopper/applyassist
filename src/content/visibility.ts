const MIN_SIZE = 8;
const MIN_OPACITY = 0.01;
const MAX_OFFSCREEN_OFFSET = -1000;

type StyleCache = WeakMap<Element, CSSStyleDeclaration>;

function getComputedStyles(element: Element, cache: StyleCache): CSSStyleDeclaration {
  const cachedStyles = cache.get(element);
  if (cachedStyles) {
    return cachedStyles;
  }

  const styles = window.getComputedStyle(element);
  cache.set(element, styles);
  return styles;
}

function hasHiddenAncestor(element: Element, cache: StyleCache): boolean {
  let current: Element | null = element.parentElement;

  while (current) {
    if (current instanceof HTMLElement && (current.hidden || current.getAttribute("aria-hidden") === "true")) {
      return true;
    }

    const styles = getComputedStyles(current, cache);
    const position = current instanceof HTMLElement ? current.style.position || styles.position : styles.position;
    const left = Number.parseFloat(current instanceof HTMLElement ? current.style.left || styles.left : styles.left) || 0;
    const top = Number.parseFloat(current instanceof HTMLElement ? current.style.top || styles.top : styles.top) || 0;

    if (styles.display === "none" || styles.visibility === "hidden") {
      return true;
    }

    if ((position === "absolute" || position === "fixed") && (left < MAX_OFFSCREEN_OFFSET || top < MAX_OFFSCREEN_OFFSET)) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function isVisible(element: Element, cache: StyleCache): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.matches("[hidden], input[type='hidden'], input[type='file']")) {
    return false;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.disabled || element.readOnly) {
      return false;
    }
  }

  if (element instanceof HTMLSelectElement && element.disabled) {
    return false;
  }

  if (hasHiddenAncestor(element, cache)) {
    return false;
  }

  const styles = getComputedStyles(element, cache);
  if (
    styles.display === "none" ||
    styles.visibility === "hidden" ||
    Number.parseFloat(styles.opacity) <= MIN_OPACITY
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const displayedWidth = Number.parseFloat(styles.width) || rect.width;
  const displayedHeight = Number.parseFloat(styles.height) || rect.height;
  if (
    !Number.isFinite(displayedWidth) ||
    !Number.isFinite(displayedHeight) ||
    displayedWidth < MIN_SIZE ||
    displayedHeight < MIN_SIZE
  ) {
    return false;
  }

  const position = element.style.position || styles.position;
  const offsetLeft = Number.parseFloat(element.style.left || styles.left) || 0;
  const offsetTop = Number.parseFloat(element.style.top || styles.top) || 0;
  if (
    (position === "absolute" || position === "fixed") &&
    (offsetLeft < MAX_OFFSCREEN_OFFSET || offsetTop < MAX_OFFSCREEN_OFFSET)
  ) {
    return false;
  }

  if (
    rect.top < MAX_OFFSCREEN_OFFSET ||
    rect.left < MAX_OFFSCREEN_OFFSET ||
    rect.bottom < 0 ||
    rect.right < 0
  ) {
    return false;
  }

  const ownerDocument = element.ownerDocument;
  const centerX = rect.left + rect.width / 2 || displayedWidth / 2;
  const centerY = rect.top + rect.height / 2 || displayedHeight / 2;

  if (typeof ownerDocument.elementFromPoint === "function") {
    const topElement = ownerDocument.elementFromPoint(centerX, centerY);
    if (topElement && topElement !== element && !element.contains(topElement)) {
      return false;
    }
  }

  return true;
}

export function isFieldVisible(element: Element): boolean {
  return isVisible(element, new WeakMap());
}

export function createFieldVisibilityChecker(): (element: Element) => boolean {
  const cache: StyleCache = new WeakMap();
  return (element) => isVisible(element, cache);
}

export const isElementVisible = isFieldVisible;
