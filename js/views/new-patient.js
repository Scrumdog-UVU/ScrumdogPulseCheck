/*
 * =============================================================================
 * js/views/new-patient.js - VIEW 1: the "New Patient" check-in form.
 * =============================================================================
 * HTML for this view: <section id="view-new-patient"> in index.html
 * Styles for this view: css/new-patient.css
 *
 * What happens here:
 *   1. The patient fills in the form.
 *   2. We save them as a new patient (addPatient in js/storage.js).
 *   3. We "log them in" (setCurrentPatientId) and switch to My Status
 *      so they immediately see their place in line.
 *
 * Every view file has the same two functions (see AGENTS.md):
 *   initNewPatientView()   - runs ONCE when the page loads; connects buttons.
 *   renderNewPatientView() - runs every time the view is shown or data
 *                            changes; redraws the view from saved data.
 */

/**
 * Connects the form's events. Called once by js/app.js on page load.
 */
function initNewPatientView() {
  const form = document.getElementById('checkin-form');
  const visitTypeSelect = document.getElementById('visit-type');

  // Show or hide the "Appointment Time" box when the patient changes
  // their answer to "Do you have a scheduled appointment?"
  visitTypeSelect.addEventListener('change', updateAppointmentTimeRow);

  // Handle the "Check In" button.
  form.addEventListener('submit', (event) => {
    // Stop the browser's default behavior (reloading the page).
    event.preventDefault();
    handleCheckIn();
  });
}

/**
 * Redraws this view. Called by js/app.js whenever the view is shown.
 */
function renderNewPatientView() {
  // Show the wait a brand-new walk-in would have right now
  // (everyone currently in the walk-in queue is ahead of them).
  const peopleAhead = getQueue(VISIT_TYPE.WALK_IN).length;
  const waitText = formatWaitTime(estimateWaitMinutes(peopleAhead));
  const peopleText = peopleAhead === 1 ? '1 person ahead' : `${peopleAhead} people ahead`;

  document.getElementById('new-patient-wait-preview').textContent = `${waitText} (${peopleText})`;
}

/**
 * Reads the form, saves the new patient, and sends them to My Status.
 */
function handleCheckIn() {
  const form = document.getElementById('checkin-form');

  // Gather what was typed. .trim() removes extra spaces at the start/end.
  const details = {
    name: document.getElementById('patient-name').value.trim(),
    phone: document.getElementById('patient-phone').value.trim(),
    reason: document.getElementById('visit-reason').value,
    visitType: document.getElementById('visit-type').value,
    appointmentTime: document.getElementById('appointment-time').value
  };

  // The browser already blocks empty "required" fields, but a name of only
  // spaces would get through, so double-check here.
  if (!details.name || !details.phone || !details.reason) return;

  // Save the patient and remember them as the "logged in" patient.
  const newPatient = addPatient(details);
  setCurrentPatientId(newPatient.id);

  // Clear the form so the next patient starts fresh.
  form.reset();
  updateAppointmentTimeRow();

  // Take them straight to their status page. (showView is in js/app.js.)
  showView('patient-status');
}

/**
 * Shows the "Appointment Time" field only if the patient said they have an
 * appointment, and makes it required only while it's visible.
 */
function updateAppointmentTimeRow() {
  const hasAppointment = document.getElementById('visit-type').value === VISIT_TYPE.APPOINTMENT;
  const timeRow = document.getElementById('appointment-time-row');
  const timeInput = document.getElementById('appointment-time');

  timeRow.hidden = !hasAppointment;
  timeInput.required = hasAppointment;

  if (!hasAppointment) timeInput.value = '';
}
