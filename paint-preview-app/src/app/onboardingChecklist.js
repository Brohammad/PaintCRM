import {
  ONBOARDING_STEPS,
  loadOnboardingState,
  markOnboardingStep,
  dismissOnboarding,
  shouldShowOnboarding,
  isOnboardingComplete,
  onboardingProgress,
} from './onboarding.js';

/**
 * Renders the first-run checklist into `rootEl` and returns helpers to refresh
 * after product actions (photo / lead / quote).
 */
export function createOnboardingChecklist({
  rootEl,
  getApiToken,
  onOpenQuotes,
  onOpenContact,
}) {
  function render() {
    if (!rootEl) return;
    const state = loadOnboardingState();
    if (!shouldShowOnboarding(state)) {
      rootEl.classList.add('hidden');
      rootEl.innerHTML = '';
      return;
    }

    const { done, total } = onboardingProgress(state);
    const signedIn = typeof getApiToken === 'function' ? Boolean(getApiToken()) : false;

    const stepsHtml = ONBOARDING_STEPS.map((step) => {
      const complete = Boolean(state[step.id]);
      let hint = step.hint;
      if (step.id === 'quote' && !signedIn && !complete) {
        hint = 'Sign in via Settings, then open Quotes';
      }
      return `
        <li class="onboarding-step ${complete ? 'is-done' : ''}" data-step="${step.id}">
          <span class="onboarding-check" aria-hidden="true">${complete ? '✓' : ''}</span>
          <div>
            <strong>${step.label}</strong>
            <p class="muted tiny">${hint}</p>
          </div>
        </li>`;
    }).join('');

    rootEl.classList.remove('hidden');
    rootEl.innerHTML = `
      <div class="onboarding-card">
        <div class="onboarding-head">
          <div>
            <p class="eyebrow">Getting started</p>
            <h2>Three steps to your first win</h2>
            <p class="muted tiny">${done} of ${total} complete${isOnboardingComplete(state) ? ' — nice work.' : ''}</p>
          </div>
          <button type="button" class="button ghost tiny" id="onboardingDismissBtn" title="Hide checklist">Dismiss</button>
        </div>
        <ol class="onboarding-steps">${stepsHtml}</ol>
        <div class="onboarding-actions">
          ${!state.lead ? '<button type="button" class="button tiny primary" id="onboardingLeadBtn">Contact Dealer</button>' : ''}
          ${!state.quote ? '<button type="button" class="button tiny ghost" id="onboardingQuoteBtn">Open Quotes</button>' : ''}
        </div>
      </div>`;

    rootEl.querySelector('#onboardingDismissBtn')?.addEventListener('click', () => {
      dismissOnboarding();
      render();
    });
    rootEl.querySelector('#onboardingLeadBtn')?.addEventListener('click', () => {
      onOpenContact?.();
    });
    rootEl.querySelector('#onboardingQuoteBtn')?.addEventListener('click', () => {
      onOpenQuotes?.();
    });
  }

  function complete(stepId) {
    markOnboardingStep(stepId);
    render();
  }

  return { render, complete };
}
