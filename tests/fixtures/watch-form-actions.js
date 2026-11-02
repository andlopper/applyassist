window.__applyAssistActionCounts = {
  clicks: 0,
  submitEvents: 0,
  submitCalls: 0,
  requestSubmitCalls: 0,
};

document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!event.isTrusted && target instanceof Element && target.closest("form")) {
      window.__applyAssistActionCounts.clicks += 1;
    }
  },
  true,
);

document.addEventListener(
  "submit",
  (event) => {
    if (event.target instanceof HTMLFormElement) {
      window.__applyAssistActionCounts.submitEvents += 1;
    }
  },
  true,
);

const nativeSubmit = HTMLFormElement.prototype.submit;
HTMLFormElement.prototype.submit = function () {
  window.__applyAssistActionCounts.submitCalls += 1;
  return nativeSubmit.call(this);
};

const nativeRequestSubmit = HTMLFormElement.prototype.requestSubmit;
HTMLFormElement.prototype.requestSubmit = function (...args) {
  window.__applyAssistActionCounts.requestSubmitCalls += 1;
  return nativeRequestSubmit.apply(this, args);
};
