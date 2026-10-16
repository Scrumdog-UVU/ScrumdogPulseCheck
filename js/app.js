/*
 * =============================================================================
 * js/app.js - starts the app and switches between views.
 * =============================================================================
 * Loaded LAST (see index.html), because it uses functions from every other
 * file.
 *
 * TO ADD A NEW VIEW:
 *   1. Add a <section id="view-YOUR-NAME" class="view" hidden> to index.html.
 *   2. Add a <button class="view-tab" data-view="YOUR-NAME"> to the top bar.
 *   3. Create js/views/YOUR-NAME.js with initYourNameView() and
 *      renderYourNameView(), and add its <script> tag to index.html
 *      (above js/app.js).
 *   4. Add an entry to VIEWS below.
 */

/**
 * Every view in the app. The key (e.g. 'new-patient') must match:
 *   - the view's section id in index.html:  id="view-new-patient"
 *   - its top-bar button:                   data-view="new-patient"
 */
const VIEWS = {
  'new-patient':    { init: initNewPatientView,    render: renderNewPatientView },
  'patient-status': { init: initPatientStatusView, render: renderPatientStatusView },
  'admin':          { init: initAdminView,         render: renderAdminView },
  'survey':         { init: initSurveyView,        render: renderSurveyView },
  'dashboard':      { init: initDashboardView,     render: renderDashboardView }
};

/** The view shown the very first time someone opens the app. */
const DEFAULT_VIEW = 'new-patient';

/** The name of the view currently on screen. */
let currentViewName = DEFAULT_VIEW;

/* ---------------------------------------------------------------------------
 * START-UP - runs once, as soon as the page has loaded.
 * ------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // 0. Initialize theme (Light Mode / Dark Mode) preference.
  initTheme();

  // 1. Let every view connect its buttons and forms.
  Object.values(VIEWS).forEach((view) => view.init());

  // 2. Make the top-bar buttons (and any other data-go-to-view buttons)
  //    switch views when clicked.
  document.querySelectorAll('[data-view], [data-go-to-view]').forEach((button) => {
    button.addEventListener('click', () => {
      showView(button.dataset.view || button.dataset.goToView);
    });
  });

  // 3. If the app is open in two browser tabs (e.g. one as the patient, one
  //    as staff), a change in one tab fires a "storage" event in the other.
  //    Redraw so both tabs stay in sync and show live queue position updates.
  window.addEventListener('storage', () => VIEWS[currentViewName].render());

  // 4. Automatically refresh the current view every 30 seconds so wait-time
  //    estimates and queue positions stay up to date as time passes.
  setInterval(() => {
    VIEWS[currentViewName].render();
  }, 30000);

  // 5. Open the view that was open last time (or the default one).
  const savedView = getSavedViewName();
  showView(VIEWS[savedView] ? savedView : DEFAULT_VIEW);
});

/* ---------------------------------------------------------------------------
 * THEME MANAGEMENT - Light mode / Dark mode switch
 * ------------------------------------------------------------------------- */

/**
 * Initializes the theme state on page load and hooks up the toggle button.
 */
function initTheme() {
  const toggleBtn = document.getElementById('theme-toggle');
  if (!toggleBtn) return;

  // Load saved theme or default to dark
  const savedTheme = getSavedTheme() || 'dark';
  applyTheme(savedTheme);

  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    saveTheme(newTheme);
  });
}

/**
 * Applies the requested theme to the page and updates toggle button UI.
 *
 * @param {string} theme - "light" or "dark"
 */
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  const toggleText = document.getElementById('theme-toggle-text');
  const sunIcon = document.querySelector('.theme-icon-sun');
  const moonIcon = document.querySelector('.theme-icon-moon');

  if (toggleText && sunIcon && moonIcon) {
    if (theme === 'light') {
      toggleText.textContent = 'Dark Mode';
      sunIcon.hidden = true;
      moonIcon.hidden = false;
    } else {
      toggleText.textContent = 'Light Mode';
      sunIcon.hidden = false;
      moonIcon.hidden = true;
    }
  }
}

/**
 * Hides every view, shows the chosen one, and redraws it with fresh data.
 * Any file can call this, e.g. showView('admin').
 *
 * @param {string} viewName - A key from VIEWS, e.g. 'patient-status'.
 */
function showView(viewName) {
  if (!VIEWS[viewName]) {
    console.error(`showView: there is no view called "${viewName}". Check VIEWS in js/app.js.`);
    return;
  }

  currentViewName = viewName;
  saveViewName(viewName);

  // Show only the matching <section>.
  document.querySelectorAll('.view').forEach((section) => {
    section.hidden = section.id !== `view-${viewName}`;
  });

  // Highlight the matching top-bar button.
  document.querySelectorAll('.view-tab').forEach((tab) => {
    const isActive = tab.dataset.view === viewName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', String(isActive)); // for screen readers
  });

  // Draw the view with the latest saved data.
  VIEWS[viewName].render();
  window.scrollTo(0, 0);
}
