/*
 * =============================================================================
 * js/storage.js - the app's "database".
 * =============================================================================
 * There is no real server or database. Instead we save everything in the
 * browser's localStorage, which keeps data even after the page is closed
 * (but only on this one computer, in this one browser).
 *
 * THE RULE: this is the ONLY file that should touch localStorage. Every other
 * file saves or loads data by calling the functions below. That way, if the
 * team ever switches to a real database, only this file needs to change.
 *
 * -----------------------------------------------------------------------------
 * WHAT A PATIENT RECORD LOOKS LIKE
 * -----------------------------------------------------------------------------
 * Every checked-in patient is saved as an object with these fields.
 * If you add or change a field, update this list AND the "Data model"
 * section of AGENTS.md so everyone stays in sync.
 *
 *   {
 *     id:              "1695400000000-ab12"   // unique id, never shown to users
 *     ticketNumber:    "T-123"                // short code shown to the patient
 *     name:            "Jane Doe"
 *     phone:           "(555) 123-4567"
 *     reason:          "Routine Checkup"      // one of the <option>s in index.html
 *     visitType:       "walk-in"              // VISIT_TYPE.WALK_IN or VISIT_TYPE.APPOINTMENT
 *     appointmentTime: "14:30" or null        // only set for appointments (24-hour "HH:MM")
 *     checkedInAt:     1695400000000          // Date.now() when they checked in
 *     status:          "waiting"              // one of PATIENT_STATUS below
 *   }
 */

/* ---------------------------------------------------------------------------
 * CONSTANTS
 * Named values used across the app. Always use these names instead of typing
 * the raw text (write PATIENT_STATUS.WAITING, not 'waiting') so a typo causes
 * an obvious error instead of a silent bug.
 * ------------------------------------------------------------------------- */

/** The names ("keys") our data is saved under in localStorage. */
const STORAGE_KEYS = {
  PATIENTS: 'pulsecheck_patients',                 // the list of all patient records
  CURRENT_PATIENT_ID: 'pulsecheck_current_patient', // which patient "My Status" is showing
  CURRENT_VIEW: 'pulsecheck_current_view'           // which view was open last time
};

/**
 * Where a patient is in their visit. A patient moves through these in order:
 *   WAITING  -> checked in, waiting in line
 *   CALLED   -> staff have called them in; they should come to the front desk
 *   DONE     -> visit finished
 */
const PATIENT_STATUS = {
  WAITING: 'waiting',
  CALLED: 'called',
  DONE: 'done'
};

/** The two kinds of visit. Each kind has its own separate queue. */
const VISIT_TYPE = {
  WALK_IN: 'walk-in',
  APPOINTMENT: 'appointment'
};

/* ---------------------------------------------------------------------------
 * READING AND WRITING PATIENTS
 * ------------------------------------------------------------------------- */

/**
 * Loads every patient record (in every status) from storage.
 *
 * @returns {Array<Object>} A list of patient records. Empty list if none.
 */
function getAllPatients() {
  const savedText = localStorage.getItem(STORAGE_KEYS.PATIENTS);
  if (!savedText) return [];

  // localStorage only holds text, so the list was saved as JSON text.
  // JSON.parse turns it back into a real list. If the saved text is somehow
  // damaged, we log the problem and start fresh instead of crashing the page.
  try {
    return JSON.parse(savedText);
  } catch (error) {
    console.error('Saved patient data was unreadable, starting with an empty list.', error);
    return [];
  }
}

/**
 * Saves the full list of patient records, replacing what was there.
 * Most code should use addPatient / updatePatient / removePatient instead.
 *
 * @param {Array<Object>} patients - The complete list to save.
 */
function saveAllPatients(patients) {
  localStorage.setItem(STORAGE_KEYS.PATIENTS, JSON.stringify(patients));
}

/**
 * Finds one patient by their id.
 *
 * @param {string} patientId
 * @returns {Object|null} The patient record, or null if not found.
 */
function getPatientById(patientId) {
  return getAllPatients().find((patient) => patient.id === patientId) || null;
}

/**
 * Creates a new patient record, saves it, and returns it.
 * The record starts in the WAITING status.
 *
 * @param {Object} details - What the patient entered on the check-in form:
 *   { name, phone, reason, visitType, appointmentTime }
 * @returns {Object} The complete new patient record (including its new id).
 */
function addPatient(details) {
  const now = Date.now();

  const newPatient = {
    // Time + a few random letters, so two check-ins in the same
    // millisecond still get different ids.
    id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
    ticketNumber: createTicketNumber(),
    name: details.name,
    phone: details.phone,
    reason: details.reason,
    visitType: details.visitType,
    appointmentTime: details.visitType === VISIT_TYPE.APPOINTMENT ? details.appointmentTime : null,
    checkedInAt: now,
    status: PATIENT_STATUS.WAITING
  };

  const patients = getAllPatients();
  patients.push(newPatient);
  saveAllPatients(patients);

  return newPatient;
}

/**
 * Changes some fields on one patient and saves the result.
 * Example: updatePatient(id, { status: PATIENT_STATUS.CALLED })
 *
 * @param {string} patientId - Which patient to change.
 * @param {Object} changes - Only the fields you want to change.
 */
function updatePatient(patientId, changes) {
  const patients = getAllPatients().map((patient) =>
    patient.id === patientId ? { ...patient, ...changes } : patient
  );
  saveAllPatients(patients);
}

/**
 * Deletes one patient record completely (used when a patient cancels).
 *
 * @param {string} patientId
 */
function removePatient(patientId) {
  const patients = getAllPatients().filter((patient) => patient.id !== patientId);
  saveAllPatients(patients);
}

/**
 * Deletes every patient whose visit is DONE. Used by the Staff View's
 * "Clear Finished Visits" button.
 */
function removeFinishedPatients() {
  const patients = getAllPatients().filter((patient) => patient.status !== PATIENT_STATUS.DONE);
  saveAllPatients(patients);
}

/**
 * Makes a ticket number like "T-482" that isn't already in use.
 * (Kept inside this file because only addPatient needs it.)
 *
 * @returns {string}
 */
function createTicketNumber() {
  const usedNumbers = new Set(getAllPatients().map((patient) => patient.ticketNumber));
  let ticketNumber;
  do {
    ticketNumber = `T-${Math.floor(100 + Math.random() * 900)}`;
  } while (usedNumbers.has(ticketNumber) && usedNumbers.size < 900);
  return ticketNumber;
}

/* ---------------------------------------------------------------------------
 * "WHO AM I?" - the patient shown on the My Status view
 * Since there's no real login, we just remember which patient id the
 * My Status view should show.
 * ------------------------------------------------------------------------- */

/** @returns {string|null} The id of the patient My Status is showing. */
function getCurrentPatientId() {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_PATIENT_ID);
}

/** @param {string|null} patientId - Pass null to "log out". */
function setCurrentPatientId(patientId) {
  if (patientId) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_PATIENT_ID, patientId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PATIENT_ID);
  }
}

/* ---------------------------------------------------------------------------
 * WHICH VIEW WAS OPEN - so a page refresh keeps you where you were.
 * ------------------------------------------------------------------------- */

/** @returns {string|null} The name of the last open view, e.g. "admin". */
function getSavedViewName() {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_VIEW);
}

/** @param {string} viewName */
function saveViewName(viewName) {
  localStorage.setItem(STORAGE_KEYS.CURRENT_VIEW, viewName);
}

/* ---------------------------------------------------------------------------
 * RESET
 * ------------------------------------------------------------------------- */

/** Wipes every piece of PulseCheck data from this browser. */
function clearAllData() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}
