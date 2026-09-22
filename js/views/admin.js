/*
 * =============================================================================
 * js/views/admin.js - VIEW 3: "Staff View" for clinic staff.
 * =============================================================================
 * HTML for this view: <section id="view-admin"> in index.html
 * Styles for this view: css/admin.css
 *
 * Staff see both queues (Scheduled Appointments and Walk-ins) and move each
 * patient along:
 *
 *     WAITING  --[Call In]-->  CALLED  --[Mark Done]-->  DONE
 *
 * Finished patients show in the "Finished Visits" list until staff clear it.
 */

/**
 * The buttons on each patient row. Each button's data-action="..." attribute
 * must match one of these names; handleAdminAction() below decides what
 * each one does.
 */
const ADMIN_ACTIONS = {
  CALL_IN: 'call-in',     // WAITING -> CALLED
  MARK_DONE: 'mark-done', // CALLED  -> DONE
  REMOVE: 'remove'        // delete the patient entirely (e.g. no-show)
};

/**
 * Connects the buttons for this view. Called once by js/app.js.
 */
function initAdminView() {
  // The patient rows are re-created every time the view redraws, so instead
  // of attaching a click handler to every single row button, we attach ONE
  // handler to the whole view and check which button was clicked.
  // (This technique is called "event delegation".)
  document.getElementById('view-admin').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return; // the click wasn't on one of our row buttons

    handleAdminAction(button.dataset.action, button.dataset.patientId);
  });

  document.getElementById('admin-clear-finished-btn').addEventListener('click', () => {
    removeFinishedPatients();
    renderAdminView();
  });

  document.getElementById('admin-reset-btn').addEventListener('click', () => {
    if (!confirm('Delete ALL patients and start over? This cannot be undone.')) return;
    clearAllData();
    renderAdminView();
  });
}

/**
 * Carries out a row button click.
 *
 * @param {string} action - One of the ADMIN_ACTIONS values.
 * @param {string} patientId - Which patient the button belongs to.
 */
function handleAdminAction(action, patientId) {
  if (action === ADMIN_ACTIONS.CALL_IN) {
    updatePatient(patientId, { status: PATIENT_STATUS.CALLED });

  } else if (action === ADMIN_ACTIONS.MARK_DONE) {
    updatePatient(patientId, { status: PATIENT_STATUS.DONE });

  } else if (action === ADMIN_ACTIONS.REMOVE) {
    if (!confirm('Remove this patient from the queue?')) return;
    removePatient(patientId);
  }

  renderAdminView();
}

/**
 * Redraws this view from saved data. Called by js/app.js whenever the view
 * is shown or the data changes.
 */
function renderAdminView() {
  const allPatients = getAllPatients();

  // --- Summary counts at the top ---------------------------------------
  const countWithStatus = (status) => allPatients.filter((patient) => patient.status === status).length;
  document.getElementById('admin-count-waiting').textContent = countWithStatus(PATIENT_STATUS.WAITING);
  document.getElementById('admin-count-called').textContent = countWithStatus(PATIENT_STATUS.CALLED);
  document.getElementById('admin-count-done').textContent = countWithStatus(PATIENT_STATUS.DONE);

  // --- The two queues --------------------------------------------------
  fillQueueList(
    document.getElementById('admin-appointment-list'),
    getQueue(VISIT_TYPE.APPOINTMENT),
    'No scheduled appointments in line.'
  );
  fillQueueList(
    document.getElementById('admin-walkin-list'),
    getQueue(VISIT_TYPE.WALK_IN),
    'No walk-ins in line.'
  );

  // --- Finished visits (most recent check-in first) ---------------------
  const finished = allPatients
    .filter((patient) => patient.status === PATIENT_STATUS.DONE)
    .sort((a, b) => b.checkedInAt - a.checkedInAt);
  fillQueueList(document.getElementById('admin-finished-list'), finished, 'No finished visits yet.');
}

/**
 * Puts a list of patient rows into one of the queue boxes.
 *
 * @param {HTMLElement} listElement - The box to fill.
 * @param {Array<Object>} patients - Patients to show, already in order.
 * @param {string} emptyText - What to show if the list is empty.
 */
function fillQueueList(listElement, patients, emptyText) {
  if (patients.length === 0) {
    listElement.innerHTML = `<p class="empty-msg">${escapeHTML(emptyText)}</p>`;
    return;
  }

  listElement.innerHTML = patients.map((patient, index) => buildPatientRow(patient, index + 1)).join('');
}

/**
 * Builds the HTML for one patient row in the Staff View.
 *
 * REMEMBER: wrap every patient-entered value in escapeHTML(...).
 *
 * @param {Object} patient - The patient record.
 * @param {number} position - Their place in this list (1 = first).
 * @returns {string} HTML text for the row.
 */
function buildPatientRow(patient, position) {
  // Appointment patients also show their appointment time.
  const appointmentLine = patient.visitType === VISIT_TYPE.APPOINTMENT
    ? `<span class="row-detail">📅 Appointment: ${escapeHTML(formatAppointmentTime(patient.appointmentTime))}</span>`
    : '';

  // Which buttons to show depends on where the patient is in their visit.
  let buttons = '';
  if (patient.status === PATIENT_STATUS.WAITING) {
    buttons = actionButton(ADMIN_ACTIONS.CALL_IN, 'Call In', 'btn-primary', patient.id) +
              actionButton(ADMIN_ACTIONS.REMOVE, 'Remove', 'btn-secondary', patient.id);
  } else if (patient.status === PATIENT_STATUS.CALLED) {
    buttons = actionButton(ADMIN_ACTIONS.MARK_DONE, 'Mark Done', 'btn-primary', patient.id) +
              actionButton(ADMIN_ACTIONS.REMOVE, 'Remove', 'btn-secondary', patient.id);
  }
  // DONE patients get no buttons.

  // Finished patients don't have a place in line, so no "#1" badge for them.
  const positionBadge = patient.status === PATIENT_STATUS.DONE
    ? ''
    : `<span class="row-position">#${position}</span>`;

  return `
    <div class="patient-row row-${escapeHTML(patient.status)}">
      ${positionBadge}
      <div class="row-info">
        <span class="row-name">${escapeHTML(patient.name)}
          <span class="row-ticket">${escapeHTML(patient.ticketNumber)}</span>
        </span>
        <span class="row-detail">${escapeHTML(patient.reason)}</span>
        ${appointmentLine}
        <span class="row-detail">🕒 Checked in ${escapeHTML(formatClockTime(patient.checkedInAt))} · 📞 ${escapeHTML(patient.phone)}</span>
        ${patient.status === PATIENT_STATUS.CALLED ? '<span class="row-called-note">Called in - on their way</span>' : ''}
      </div>
      <div class="row-buttons">${buttons}</div>
    </div>
  `;
}

/**
 * Builds one small button for a patient row.
 *
 * @param {string} action - One of ADMIN_ACTIONS.
 * @param {string} label - Text on the button.
 * @param {string} styleClass - e.g. "btn-primary" (see css/base.css).
 * @param {string} patientId
 * @returns {string} HTML for the button.
 */
function actionButton(action, label, styleClass, patientId) {
  return `<button type="button" class="btn btn-small ${styleClass}"
            data-action="${action}" data-patient-id="${escapeHTML(patientId)}">${label}</button>`;
}
