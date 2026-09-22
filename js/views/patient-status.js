/*
 * =============================================================================
 * js/views/patient-status.js - VIEW 2: "My Status" for a checked-in patient.
 * =============================================================================
 * HTML for this view: <section id="view-patient-status"> in index.html
 * Styles for this view: css/patient-status.css
 *
 * This is what a patient sees after checking in: their ticket number, their
 * place in line, and roughly how long they'll wait.
 *
 * There is no real login. Instead, a drop-down at the top lets you pick
 * which checked-in patient you are "logged in" as. This makes it easy to
 * demo several patients from one computer.
 *
 * PRIVACY NOTE: a patient should never see other patients' names or details.
 * This view only shows the chosen patient's own information plus counts.
 * (The drop-down of names exists only because this is a single-user demo.)
 */

/**
 * Connects the drop-down and Cancel button. Called once by js/app.js.
 */
function initPatientStatusView() {
  // Switching patients in the drop-down = "logging in" as someone else.
  document.getElementById('status-patient-select').addEventListener('change', (event) => {
    setCurrentPatientId(event.target.value);
    renderPatientStatusView();
  });

  // Let the patient give up their spot in line.
  document.getElementById('status-cancel-btn').addEventListener('click', () => {
    const patientId = getCurrentPatientId();
    if (!patientId) return;

    // confirm() shows a built-in OK / Cancel pop-up.
    if (!confirm('Cancel your check-in? You will lose your place in line.')) return;

    removePatient(patientId);
    setCurrentPatientId(null);
    renderPatientStatusView();
  });
}

/**
 * Redraws this view from saved data. Called by js/app.js whenever the view
 * is shown or the data changes.
 */
function renderPatientStatusView() {
  const allPatients = getAllPatients();

  // --- Case 1: nobody has checked in yet. Show the "empty" message. -------
  const hasPatients = allPatients.length > 0;
  document.getElementById('status-empty').hidden = hasPatients;
  document.getElementById('status-content').hidden = !hasPatients;
  if (!hasPatients) return;

  // --- Case 2: figure out which patient we're showing. --------------------
  // Use the saved "logged in" patient. If that patient no longer exists
  // (cancelled, cleared by staff), fall back to the most recent check-in.
  let patient = getPatientById(getCurrentPatientId());
  if (!patient) {
    patient = allPatients[allPatients.length - 1];
    setCurrentPatientId(patient.id);
  }

  fillPatientPicker(allPatients, patient.id);
  fillTicket(patient);
}

/**
 * Builds the "Viewing as patient" drop-down.
 *
 * @param {Array<Object>} patients - Everyone who can be picked.
 * @param {string} selectedId - The patient to show as selected.
 */
function fillPatientPicker(patients, selectedId) {
  const select = document.getElementById('status-patient-select');

  // Newest check-ins at the top of the list.
  const newestFirst = [...patients].sort((a, b) => b.checkedInAt - a.checkedInAt);

  select.innerHTML = newestFirst.map((patient) => `
    <option value="${escapeHTML(patient.id)}" ${patient.id === selectedId ? 'selected' : ''}>
      ${escapeHTML(patient.name)} (${escapeHTML(patient.ticketNumber)})
    </option>
  `).join('');
}

/**
 * Fills in the ticket card for one patient.
 *
 * @param {Object} patient - The patient record to show.
 */
function fillTicket(patient) {
  // Basic details that don't depend on status.
  document.getElementById('status-ticket-number').textContent = `#${patient.ticketNumber}`;
  document.getElementById('status-name').textContent = patient.name;
  document.getElementById('status-reason').textContent = patient.reason;
  document.getElementById('status-checked-in').textContent = formatClockTime(patient.checkedInAt);
  document.getElementById('status-visit-type').textContent =
    patient.visitType === VISIT_TYPE.APPOINTMENT
      ? `Appointment at ${formatAppointmentTime(patient.appointmentTime)}`
      : 'Walk-in';

  // The parts below change depending on the patient's status.
  const badge = document.getElementById('status-badge');
  const message = document.getElementById('status-message');
  const stats = document.getElementById('status-stats');
  const cancelButton = document.getElementById('status-cancel-btn');

  // The badge's CSS class (status-waiting / status-called / status-done)
  // controls its color. See css/patient-status.css.
  badge.className = `status-badge status-${patient.status}`;

  if (patient.status === PATIENT_STATUS.WAITING) {
    const spot = getQueuePosition(patient);
    badge.textContent = 'Waiting';
    message.textContent = spot.position === 1
      ? "You're next! Please be ready to head to the front desk."
      : "You're checked in. We'll call you when it's your turn.";
    document.getElementById('status-position').textContent = `#${spot.position} of ${spot.queueLength}`;
    document.getElementById('status-wait').textContent = formatWaitTime(estimateWaitMinutes(spot.peopleAhead));
    stats.hidden = false;
    cancelButton.hidden = false;

  } else if (patient.status === PATIENT_STATUS.CALLED) {
    badge.textContent = "It's your turn";
    message.textContent = 'Please come to the front desk now.';
    stats.hidden = true;
    cancelButton.hidden = true;

  } else if (patient.status === PATIENT_STATUS.DONE) {
    badge.textContent = 'Visit complete';
    message.textContent = 'Thanks for visiting! Your visit is finished.';
    stats.hidden = true;
    cancelButton.hidden = true;
  }
}
