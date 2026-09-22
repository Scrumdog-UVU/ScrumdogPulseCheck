/*
 * =============================================================================
 * js/queue.js - the rules for who is next in line and how long they'll wait.
 * =============================================================================
 * This file only does calculations. It never changes the page and never
 * saves anything. It reads patients using the functions in js/storage.js.
 *
 * HOW THE LINE WORKS
 *   - There are two separate queues: Scheduled Appointments and Walk-ins.
 *   - Appointments are ordered by appointment time (earliest first).
 *   - Walk-ins are ordered by when they checked in (earliest first).
 *   - A patient is "in line" while their status is WAITING or CALLED.
 *     Once they are DONE they leave the line.
 *
 * If the team decides to change these rules (for example, a new wait time
 * formula), this is the file to change.
 */

/**
 * How many minutes we assume each patient ahead of you takes.
 * Change this number to make wait estimates longer or shorter.
 */
const MINUTES_PER_PATIENT = 15;

/**
 * Returns the patients currently in one queue, in order (first = next up).
 *
 * @param {string} visitType - VISIT_TYPE.WALK_IN or VISIT_TYPE.APPOINTMENT
 * @returns {Array<Object>} Patient records, first in line first.
 */
function getQueue(visitType) {
  const patientsInLine = getAllPatients().filter((patient) =>
    patient.visitType === visitType && patient.status !== PATIENT_STATUS.DONE
  );

  if (visitType === VISIT_TYPE.APPOINTMENT) {
    // "09:00" comes before "14:30" alphabetically, so a text comparison
    // puts earlier appointments first. If two appointments share a time,
    // whoever checked in first goes first.
    return patientsInLine.sort((a, b) =>
      (a.appointmentTime || '').localeCompare(b.appointmentTime || '') ||
      a.checkedInAt - b.checkedInAt
    );
  }

  // Walk-ins: first come, first served.
  return patientsInLine.sort((a, b) => a.checkedInAt - b.checkedInAt);
}

/**
 * Figures out where one patient is in their queue.
 *
 * @param {Object} patient - A patient record.
 * @returns {{position: number, peopleAhead: number, queueLength: number} | null}
 *   position is 1 for the person who is next. Returns null if the patient is
 *   not in line (for example, their visit is DONE).
 */
function getQueuePosition(patient) {
  const queue = getQueue(patient.visitType);
  const index = queue.findIndex((queuedPatient) => queuedPatient.id === patient.id);

  if (index === -1) return null;

  return {
    position: index + 1,  // lists start counting at 0; people start at 1
    peopleAhead: index,
    queueLength: queue.length
  };
}

/**
 * Estimates the wait in minutes for someone with this many people ahead.
 *
 * @param {number} peopleAhead
 * @returns {number} Minutes.
 */
function estimateWaitMinutes(peopleAhead) {
  return Math.max(0, peopleAhead) * MINUTES_PER_PATIENT;
}
