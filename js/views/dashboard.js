/*
 * =============================================================================
 * js/views/dashboard.js - VIEW 5: "Dashboard", the live queue dashboard for
 * front-desk staff.
 * =============================================================================
 * HTML for this view: <section id="view-dashboard"> in index.html
 * Styles for this view: css/dashboard.css
 *
 * A read-only, at-a-glance picture of the clinic right now:
 *   - headline numbers (waiting, called in, seen today, the wait a new
 *     walk-in would have, and the longest anyone has been waiting)
 *   - "Now Serving": every patient who has been called to the front desk
 *   - both queues in order, showing how long each patient has waited
 *
 * Nothing is changed from this view. Staff call patients in and mark visits
 * done in the Staff View (js/views/admin.js). The "Manage Patients in Staff
 * View" button switches views using data-go-to-view, which js/app.js
 * connects for us.
 *
 * HOW THE DASHBOARD STAYS "LIVE"
 * This view does not need a timer of its own. js/app.js already redraws
 * whichever view is on screen:
 *   - every 30 seconds, so the "Waiting 12 mins" times keep counting up, and
 *   - right away when another browser tab changes the data (the browser's
 *     "storage" event). So a dashboard left open in its own tab updates the
 *     moment someone checks in or staff call a patient from another tab.
 * The "Last updated" time at the top shows when the last redraw happened.
 *
 * Every view file has the same two functions (see AGENTS.md):
 *   initDashboardView()   - runs ONCE when the page loads.
 *   renderDashboardView() - runs every time the view is shown or data
 *                           changes; redraws the view from saved data.
 */

/**
 * A waiting patient who has been here at least this many minutes is marked
 * "Long wait" (in red) so staff know to check on them.
 * Change this number to make the warning appear sooner or later.
 */
const LONG_WAIT_MINUTES = 30;

/* ---------------------------------------------------------------------------
 * SET-UP AND REDRAW
 * ------------------------------------------------------------------------- */

/**
 * Called once by js/app.js when the page loads.
 *
 * The dashboard only displays data, so there is nothing to connect here.
 * Its one button ("Manage Patients in Staff View") has a data-go-to-view
 * attribute, and js/app.js connects every button like that automatically.
 * This function still exists so the dashboard follows the same pattern as
 * every other view. If you add a button to the dashboard, connect it here.
 */
function initDashboardView() {
  // Nothing to connect yet.
}

/**
 * Redraws the whole dashboard from saved data. Called by js/app.js when the
 * view is shown, every 30 seconds while it is on screen, and whenever
 * another tab changes the data. Safe to call as often as needed.
 */
function renderDashboardView() {
  // Read the clock ONCE, so every time on the screen is measured from the
  // same moment.
  const now = Date.now();

  const allPatients = getAllPatients();
  const appointmentQueue = getQueue(VISIT_TYPE.APPOINTMENT);
  const walkInQueue = getQueue(VISIT_TYPE.WALK_IN);

  fillDashboardNumbers(allPatients, walkInQueue, now);
  fillNowServing(allPatients);

  fillDashboardQueue(
    document.getElementById('dashboard-appointment-list'),
    document.getElementById('dashboard-appointment-count'),
    appointmentQueue,
    'No scheduled appointments in line.',
    now
  );
  fillDashboardQueue(
    document.getElementById('dashboard-walkin-list'),
    document.getElementById('dashboard-walkin-count'),
    walkInQueue,
    'No walk-ins in line.',
    now
  );

  // Seconds are included so staff can see that the screen really is
  // refreshing on its own.
  document.getElementById('dashboard-updated-time').textContent =
    new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/* ---------------------------------------------------------------------------
 * HEADLINE NUMBERS (the row of boxes at the top)
 * ------------------------------------------------------------------------- */

/**
 * Fills in the five headline number boxes.
 *
 * @param {Array<Object>} allPatients - Every patient record.
 * @param {Array<Object>} walkInQueue - The walk-in queue, in order (from getQueue).
 * @param {number} now - The Date.now() time for this redraw.
 */
function fillDashboardNumbers(allPatients, walkInQueue, now) {
  // How many patients have a given status. (Same counts as the Staff View.)
  const countWithStatus = (status) => allPatients.filter((patient) => patient.status === status).length;
  document.getElementById('dashboard-count-waiting').textContent = countWithStatus(PATIENT_STATUS.WAITING);
  document.getElementById('dashboard-count-called').textContent = countWithStatus(PATIENT_STATUS.CALLED);
  document.getElementById('dashboard-count-done').textContent = countWithStatus(PATIENT_STATUS.DONE);

  // The wait a walk-in would have if they checked in right now. This is the
  // same math the New Patient page uses, so staff tell patients the same
  // number the check-in page shows them.
  document.getElementById('dashboard-walkin-wait').textContent =
    formatWaitTime(estimateWaitMinutes(walkInQueue.length));

  // The longest anyone still WAITING has been here. (Called-in patients
  // are already on their way, so they don't count.)
  const minutesWaitedByEach = allPatients
    .filter((patient) => patient.status === PATIENT_STATUS.WAITING)
    .map((patient) => getMinutesWaiting(patient, now));
  const longestWait = minutesWaitedByEach.length > 0 ? Math.max(...minutesWaitedByEach) : null;

  document.getElementById('dashboard-longest-wait').textContent =
    longestWait === null ? 'None' : formatMinutesWaiting(longestWait);

  // Turn the box red AND show a written warning when the wait is too long.
  // (The words matter: not everyone can tell red from other colors.)
  const isLongWait = longestWait !== null && longestWait >= LONG_WAIT_MINUTES;
  const warningNote = document.getElementById('dashboard-longest-wait-note');
  document.getElementById('dashboard-longest-wait-box').classList.toggle('dashboard-stat-alert', isLongWait);
  warningNote.textContent = `⚠ Over ${LONG_WAIT_MINUTES} mins`;
  warningNote.hidden = !isLongWait;
}

/* ---------------------------------------------------------------------------
 * NOW SERVING
 * ------------------------------------------------------------------------- */

/**
 * Fills the "Now Serving" panel with everyone who has been called in.
 *
 * @param {Array<Object>} allPatients - Every patient record.
 */
function fillNowServing(allPatients) {
  const listElement = document.getElementById('dashboard-now-serving-list');

  // Everyone called to the front desk, whoever checked in first shown first.
  const calledPatients = allPatients
    .filter((patient) => patient.status === PATIENT_STATUS.CALLED)
    .sort((a, b) => a.checkedInAt - b.checkedInAt);

  if (calledPatients.length === 0) {
    listElement.innerHTML =
      '<p class="empty-msg">No one has been called in. Use the Staff View to call the next patient.</p>';
    return;
  }

  listElement.innerHTML = calledPatients.map((patient) => buildNowServingTile(patient)).join('');
}

/**
 * Builds the HTML for one big "Now Serving" ticket.
 *
 * REMEMBER: wrap every patient-entered value in escapeHTML(...).
 *
 * @param {Object} patient - A patient whose status is CALLED.
 * @returns {string} HTML text for the tile.
 */
function buildNowServingTile(patient) {
  return `
    <div class="dashboard-serving-tile">
      <span class="dashboard-serving-ticket">${escapeHTML(patient.ticketNumber)}</span>
      <span class="dashboard-serving-name">${escapeHTML(patient.name)}</span>
      <span class="dashboard-row-detail">${escapeHTML(describeDashboardVisitType(patient))}</span>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
 * THE TWO QUEUES
 * ------------------------------------------------------------------------- */

/**
 * Fills one queue panel: its "3 in line" count and its patient rows.
 *
 * @param {HTMLElement} listElement - The box the patient rows go in.
 * @param {HTMLElement} countElement - Where the "3 in line" text goes.
 * @param {Array<Object>} queue - That queue's patients, in order (from getQueue).
 * @param {string} emptyText - What to show if nobody is in this queue.
 * @param {number} now - The Date.now() time for this redraw.
 */
function fillDashboardQueue(listElement, countElement, queue, emptyText, now) {
  countElement.textContent = `${queue.length} in line`;

  if (queue.length === 0) {
    listElement.innerHTML = `<p class="empty-msg">${escapeHTML(emptyText)}</p>`;
    return;
  }

  // The first patient still WAITING is "up next". (Anyone already CALLED is
  // on their way to the desk, so they are skipped.)
  const nextPatient = queue.find((patient) => patient.status === PATIENT_STATUS.WAITING);

  listElement.innerHTML = queue
    .map((patient, index) => buildDashboardQueueRow(patient, index + 1, patient === nextPatient, now))
    .join('');
}

/**
 * Builds the HTML for one patient row in a dashboard queue.
 *
 * REMEMBER: wrap every patient-entered value in escapeHTML(...).
 *
 * @param {Object} patient - The patient record.
 * @param {number} position - Their place in this queue (1 = first).
 * @param {boolean} isNext - true if this is the next patient to call in.
 * @param {number} now - The Date.now() time for this redraw.
 * @returns {string} HTML text for the row.
 */
function buildDashboardQueueRow(patient, position, isNext, now) {
  const isWaiting = patient.status === PATIENT_STATUS.WAITING;
  const minutesWaited = getMinutesWaiting(patient, now);
  const isLongWait = isWaiting && minutesWaited >= LONG_WAIT_MINUTES;

  // Appointment patients also show their appointment time.
  const appointmentText = patient.visitType === VISIT_TYPE.APPOINTMENT
    ? ` · 📅 ${escapeHTML(formatAppointmentTime(patient.appointmentTime))}`
    : '';

  // Small labels on the right. Each one has words, not just a color.
  const tags = [];
  if (patient.status === PATIENT_STATUS.CALLED) {
    tags.push('<span class="dashboard-tag dashboard-tag-called">Called in</span>');
  }
  if (isNext) {
    tags.push('<span class="dashboard-tag dashboard-tag-next">Up next</span>');
  }
  if (isLongWait) {
    tags.push('<span class="dashboard-tag dashboard-tag-long-wait">⚠ Long wait</span>');
  }

  // How long they've waited. Only shown while they are still waiting.
  const waitedText = isWaiting
    ? `<span class="dashboard-row-waited">Waiting ${escapeHTML(formatMinutesWaiting(minutesWaited))}</span>`
    : '';

  // The row's CSS class sets the colored left border (see css/dashboard.css).
  const longWaitClass = isLongWait ? 'dashboard-row-long-wait' : '';

  return `
    <div class="dashboard-row dashboard-row-${escapeHTML(patient.status)} ${longWaitClass}">
      <span class="dashboard-row-position">#${position}</span>
      <div class="dashboard-row-info">
        <span class="dashboard-row-name">${escapeHTML(patient.name)}
          <span class="dashboard-row-ticket">${escapeHTML(patient.ticketNumber)}</span>
        </span>
        <span class="dashboard-row-detail">${escapeHTML(patient.reason)}${appointmentText}</span>
      </div>
      <div class="dashboard-row-status">
        ${tags.join('')}
        ${waitedText}
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
 * SMALL TOOLS USED ONLY BY THIS VIEW
 * ------------------------------------------------------------------------- */

/**
 * How many whole minutes a patient has been here since they checked in.
 *
 * @param {Object} patient - A patient record.
 * @param {number} now - The Date.now() time for this redraw.
 * @returns {number} Whole minutes (never less than 0).
 */
function getMinutesWaiting(patient, now) {
  // Times are saved in milliseconds. 60,000 milliseconds = 1 minute.
  return Math.max(0, Math.floor((now - patient.checkedInAt) / 60000));
}

/**
 * Turns minutes ALREADY waited into short text.
 *
 * (js/helpers.js has formatWaitTime, but that one is for wait ESTIMATES: it
 * adds a "~" and says "No wait" for 0, which reads oddly for time that has
 * already passed.)
 *
 * @param {number} minutes - Whole minutes waited.
 * @returns {string} e.g. "< 1 min", "1 min", "25 mins", "1 hr", "1 hr 5 mins".
 */
function formatMinutesWaiting(minutes) {
  if (minutes < 1) return '< 1 min';

  // "1 min" but "2 mins".
  const minutesText = (count) => (count === 1 ? '1 min' : `${count} mins`);

  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;

  if (hours === 0) return minutesText(minutes);
  if (leftoverMinutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutesText(leftoverMinutes)}`;
}

/**
 * Describes a patient's visit type in a few words.
 *
 * @param {Object} patient - A patient record.
 * @returns {string} e.g. "Walk-in" or "Appointment at 2:30 PM".
 */
function describeDashboardVisitType(patient) {
  return patient.visitType === VISIT_TYPE.APPOINTMENT
    ? `Appointment at ${formatAppointmentTime(patient.appointmentTime)}`
    : 'Walk-in';
}
