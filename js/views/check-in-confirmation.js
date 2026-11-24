/*
 * =============================================================================
 * js/views/check-in-confirmation.js - confirms successful patient check-in.
 * =============================================================================
 * HTML: <section id="view-check-in-confirmation"> in index.html.
 * Styles: css/check-in-confirmation.css.
 */

// Remember which check-in opened this screen in this tab.
let confirmedPatientId = null;

/**
 * Connects the button that takes the checked-in patient to My Status.
 * @returns {void}
 */
function initCheckInConfirmationView() {
  const statusButton = document.getElementById('check-in-confirmation-status-button');
  statusButton.addEventListener('click', () => {
    showView(getConfirmedPatient() ? 'patient-status' : 'new-patient');
  });
}

/**
 * Shows the saved ticket for the check-in, or returns to the form if it is gone.
 * @param {string} [checkedInPatientId] - Supplied when a new check-in opens this view.
 * @returns {void}
 */
function renderCheckInConfirmationView(checkedInPatientId = confirmedPatientId) {
  confirmedPatientId = checkedInPatientId;
  const patient = getConfirmedPatient();
  const ticketNumber = document.getElementById('check-in-confirmation-ticket-number');

  ticketNumber.textContent = patient ? `#${patient.ticketNumber}` : '';
  if (!patient) {
    showView('new-patient');
    return;
  }

  // A patient can be allowed to check in without access to My Status.
  const canViewStatus = isViewAllowed('patient-status');
  document.getElementById('check-in-confirmation-status-hint').hidden = !canViewStatus;
  document.getElementById('check-in-confirmation-status-button').hidden = !canViewStatus;
}

/**
 * Makes sure another tab has not switched the shared demo patient session.
 * @returns {Object|null} The confirmed patient if their session and record still exist.
 */
function getConfirmedPatient() {
  if (!confirmedPatientId || getCurrentPatientId() !== confirmedPatientId) return null;
  return getPatientById(confirmedPatientId);
}
