/*
 * =============================================================================
 * js/sms-alerts.js - the pretend text message (SMS) service.
 * =============================================================================
 * User story: "As a patient, I want SMS alerts when my turn is approaching."
 *
 * A real clinic would use a texting service to send messages to the
 * patient's phone. This demo has no server and no phones, so instead we SAVE
 * each text in the browser (see the SMS section of js/storage.js) and the
 * My Status view shows them like a phone's messaging app.
 *
 * WHO GETS A TEXT: only patients who ticked the SMS consent box when they
 * checked in. Each patient gets each kind of text at most ONCE per visit:
 *
 *   1. TURN_APPROACHING - while they are WAITING and there are
 *      SMS_ALERT_PEOPLE_AHEAD people (or fewer) ahead of them in line.
 *      This gives them time to get back to the clinic.
 *   2. TURN_NOW - when staff click "Call In".
 *
 * WHEN TEXTS ARE "SENT": sendDueSmsAlerts() checks the whole line and sends
 * any texts that are due. The My Status view and the Staff View call it
 * every time they redraw (that's when the line can change). It is safe to
 * call as often as you like, because a text that was already sent is never
 * sent again.
 *
 * PRIVACY: texts show the ticket number, never the patient's name, because
 * anyone glancing at a phone's lock screen can read them.
 *
 * This file only decides WHAT to send and WHEN. It never changes the page.
 *   Loaded after: js/queue.js (uses getQueue and estimateWaitMinutes)
 *   Used by:      js/views/patient-status.js and js/views/admin.js
 *   Shown by:     fillSmsInbox() in js/views/patient-status.js
 */

/* ---------------------------------------------------------------------------
 * SETTINGS
 * ------------------------------------------------------------------------- */

/**
 * Send the "your turn is coming up" text once there are this many people
 * (or fewer) ahead of the patient. With MINUTES_PER_PATIENT at 15 (in
 * js/queue.js), 2 people ahead is roughly a 30-minute heads-up.
 * Change this number to warn patients earlier or later.
 */
const SMS_ALERT_PEOPLE_AHEAD = 2;

/** The kinds of text we send. Each patient gets each kind at most once. */
const SMS_ALERT_TYPE = {
  TURN_APPROACHING: 'turn-approaching', // almost their turn
  TURN_NOW: 'turn-now'                  // staff have called them in
};

/* ---------------------------------------------------------------------------
 * SENDING TEXTS
 * ------------------------------------------------------------------------- */

/**
 * Looks at everyone in line and "sends" any texts that are due.
 * Safe to call many times: a text that was already sent is skipped.
 */
function sendDueSmsAlerts() {
  // Check both queues. In each one, a patient's spot in the list
  // (0, 1, 2, ...) is the same as the number of people ahead of them.
  [VISIT_TYPE.APPOINTMENT, VISIT_TYPE.WALK_IN].forEach((visitType) => {
    getQueue(visitType).forEach((patient, peopleAhead) => {
      if (!patientHasSmsConsent(patient)) return; // they didn't ask for texts

      if (patient.status === PATIENT_STATUS.CALLED) {
        sendSmsOnce(patient, SMS_ALERT_TYPE.TURN_NOW, buildTurnNowText(patient));

      } else if (patient.status === PATIENT_STATUS.WAITING && peopleAhead <= SMS_ALERT_PEOPLE_AHEAD) {
        sendSmsOnce(patient, SMS_ALERT_TYPE.TURN_APPROACHING, buildTurnApproachingText(patient, peopleAhead));
      }
    });
  });
}

/**
 * Sends one kind of text to a patient, unless they already got it.
 *
 * @param {Object} patient - Who to text.
 * @param {string} alertType - One of the SMS_ALERT_TYPE values.
 * @param {string} messageText - The words of the text.
 */
function sendSmsOnce(patient, alertType, messageText) {
  if (hasSentSmsMessage(patient.id, alertType)) return; // already sent, don't repeat it

  // "Sending" = saving it. A real app would hand it to a texting service here.
  addSmsMessage({
    patientId: patient.id,
    phone: patient.phone,
    alertType: alertType,
    text: messageText
  });
}

/**
 * Checks whether a patient agreed to receive text messages.
 * Older patient records only have the single "messagingConsent" flag, so we
 * fall back to that (the same rule the rest of the app uses).
 *
 * @param {Object} patient - A patient record.
 * @returns {boolean} True if we're allowed to text them.
 */
function patientHasSmsConsent(patient) {
  return patient.smsConsent !== undefined
    ? Boolean(patient.smsConsent)
    : Boolean(patient.messagingConsent);
}

/* ---------------------------------------------------------------------------
 * WHAT THE TEXTS SAY
 * Edit the wording here. Keep the patient's name OUT of every text.
 * ------------------------------------------------------------------------- */

/**
 * Writes the "your turn is coming up" text.
 *
 * @param {Object} patient - The patient being texted.
 * @param {number} peopleAhead - How many people are ahead of them right now.
 * @returns {string} The message, e.g. "PulseCheck: Your turn is coming up! ..."
 */
function buildTurnApproachingText(patient, peopleAhead) {
  // Nobody ahead of them: they're next.
  if (peopleAhead === 0) {
    return `PulseCheck: You're next! Ticket ${patient.ticketNumber} is #1 in line. ` +
      'Please make sure you are at the clinic and ready to be called.';
  }

  // e.g. "~30 mins" (formatWaitTime is in js/helpers.js)
  const waitText = formatWaitTime(estimateWaitMinutes(peopleAhead));

  return `PulseCheck: Your turn is coming up! Ticket ${patient.ticketNumber} is #${peopleAhead + 1} in line, ` +
    `with an estimated wait of ${waitText}. Please head to the clinic now so you don't miss your spot.`;
}

/**
 * Writes the "it's your turn" text, sent when staff call the patient in.
 *
 * @param {Object} patient - The patient being texted.
 * @returns {string} The message.
 */
function buildTurnNowText(patient) {
  return `PulseCheck: It's your turn! Ticket ${patient.ticketNumber}, please come to the front desk now.`;
}
