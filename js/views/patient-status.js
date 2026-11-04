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
 *
 * PUSH NOTIFICATION: when staff click "Call In", this view also pops up a
 * pretend phone notification saying "It's your turn!" (see the
 * SIMULATED PUSH NOTIFICATION section at the bottom of this file).
 *
 * SMS TEXTS: patients who opted in to SMS get a "Text Messages" card that
 * shows the texts the clinic "sent" them, such as "Your turn is coming up!"
 * (see the SIMULATED SMS TEXT MESSAGES section at the bottom of this file,
 * and js/sms-alerts.js for when texts are sent).
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

  // The "x" on the "It's your turn" notification closes it for good.
  document.getElementById('status-turn-alert-dismiss').addEventListener('click', () => {
    const patientId = getCurrentPatientId();
    if (!patientId) return;

    dismissTurnAlert(patientId);
    renderPatientStatusView();
  });
}

/**
 * Redraws this view from saved data. Called by js/app.js whenever the view
 * is shown or the data changes.
 */
function renderPatientStatusView() {
  // "Send" any texts that are now due (see js/sms-alerts.js), so the
  // Text Messages card below is up to date.
  sendDueSmsAlerts();

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
  fillTurnAlert(patient);
  fillSmsInbox(patient);
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
  document.getElementById('status-dob').textContent = patient.dob || 'N/A';
  document.getElementById('status-reason').textContent = patient.reason;
  document.getElementById('status-allergies').textContent = patient.allergies || 'None';
  document.getElementById('status-checked-in').textContent = formatClockTime(patient.checkedInAt);
  document.getElementById('status-visit-type').textContent =
    patient.visitType === VISIT_TYPE.APPOINTMENT
      ? `Appointment at ${formatAppointmentTime(patient.appointmentTime)}`
      : 'Walk-in';

  // Support separate SMS and Push consents with fallback to legacy messagingConsent
  const hasSmsConsent = patient.smsConsent !== undefined
    ? Boolean(patient.smsConsent)
    : Boolean(patient.messagingConsent);
  const hasPushConsent = patient.pushConsent !== undefined
    ? Boolean(patient.pushConsent)
    : Boolean(patient.messagingConsent);

  document.getElementById('status-sms-consent').textContent = hasSmsConsent
    ? 'Opted in (SMS enabled)'
    : 'Opted out (No SMS)';
  document.getElementById('status-push-consent').textContent = hasPushConsent
    ? 'Opted in (Push enabled)'
    : 'Opted out (No Push)';

  // The parts below change depending on the patient's status.
  const badge = document.getElementById('status-badge');
  const message = document.getElementById('status-message');
  const stats = document.getElementById('status-stats');
  const cancelButton = document.getElementById('status-cancel-btn');

  // Urgent priority badge on ticket
  const urgentBadge = document.getElementById('status-urgent-badge');
  if (urgentBadge) {
    urgentBadge.hidden = !patient.isUrgent || patient.status === PATIENT_STATUS.DONE || patient.status === PATIENT_STATUS.NO_SHOW;
  }

  // The badge's CSS class (status-waiting / status-called / status-done)
  // controls its color. See css/patient-status.css.
  badge.className = `status-badge status-${patient.status}`;

  if (patient.status === PATIENT_STATUS.WAITING) {
    const spot = getQueuePosition(patient);
    badge.textContent = 'Waiting';
    if (patient.isUrgent) {
      message.textContent = spot.position === 1
        ? "Priority status: You're next! Please be ready to head to the front desk."
        : "Priority status: You've been flagged for urgent care and prioritized in line.";
    } else {
      message.textContent = spot.position === 1
        ? "You're next! Please be ready to head to the front desk."
        : "You're checked in. We'll call you when it's your turn.";
    }
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

  } else if (patient.status === PATIENT_STATUS.NO_SHOW) {
    badge.textContent = 'No-Show';
    message.textContent = 'You were marked as a no-show. Please speak to the front desk if you need assistance.';
    stats.hidden = true;
    cancelButton.hidden = true;
  }
}

/* ---------------------------------------------------------------------------
 * SIMULATED PUSH NOTIFICATION ("It's your turn!")
 * A real clinic app would send a push notification to the patient's phone
 * the moment staff click "Call In". This demo has no phones or servers, so
 * the My Status view plays the part of the patient's phone: a notification
 * slides down from the top of the screen, "buzzes", and plays a short chime.
 * HTML: <div id="status-turn-alert"> in index.html
 * Styles: the "SIMULATED PUSH NOTIFICATION" section of css/patient-status.css
 * ------------------------------------------------------------------------- */

/**
 * Shows or hides the pretend push notification for one patient.
 *
 * The notification only appears when ALL of these are true:
 *   - staff have officially called the patient in (status is CALLED),
 *   - the patient ticked the push notification consent box when checking in, and
 *   - the patient hasn't already closed it with the "x" button.
 *
 * @param {Object} patient - The patient whose "phone" this is.
 */
function fillTurnAlert(patient) {
  const alertBox = document.getElementById('status-turn-alert');

  const hasPushConsent = patient.pushConsent !== undefined
    ? Boolean(patient.pushConsent)
    : Boolean(patient.messagingConsent);

  const shouldShow = patient.status === PATIENT_STATUS.CALLED &&
    hasPushConsent &&
    !hasDismissedTurnAlert(patient.id);

  if (!shouldShow) {
    alertBox.hidden = true;
    return;
  }

  // This view redraws every 30 seconds and whenever data changes. Only chime
  // when the alert is NEW (not already on screen for this same patient), so
  // it doesn't ding over and over.
  const isNewAlert = alertBox.hidden || alertBox.dataset.patientId !== patient.id;

  // Show the ticket number but not the name: phone notifications can be
  // seen by anyone looking at the lock screen.
  document.getElementById('status-turn-alert-ticket').textContent = `#${patient.ticketNumber}`;
  alertBox.dataset.patientId = patient.id;
  alertBox.hidden = false;

  if (isNewAlert) {
    playTurnAlertChime();
  }
}

/** The browser's sound player for the chime. Created the first time it's needed. */
let turnAlertSoundPlayer = null;

/**
 * Plays a short two-note "ding-ding" like a phone notification. The browser
 * makes the sound itself (the Web Audio feature), so no sound file is needed.
 *
 * Browsers don't allow a page to make sound until the person has clicked
 * somewhere on it. If they haven't yet (for example, right after a page
 * refresh), we quietly skip the sound. The notification still appears.
 */
function playTurnAlertChime() {
  // Older browsers name the sound player differently, or don't have one.
  const SoundPlayer = window.AudioContext || window.webkitAudioContext;
  const pageHasBeenClicked = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  if (!SoundPlayer || !pageHasBeenClicked) return;

  turnAlertSoundPlayer = turnAlertSoundPlayer || new SoundPlayer();
  // The player can fall asleep while it's not in use. Wake it up. (.catch
  // ignores the rare case where the browser still says no.)
  turnAlertSoundPlayer.resume().catch(() => {});

  // Two notes, one right after the other. The numbers are pitches in hertz;
  // the second note is higher, which sounds like a friendly "ding-ding".
  [880, 1320].forEach((pitch, noteNumber) => {
    const startTime = turnAlertSoundPlayer.currentTime + noteNumber * 0.15;
    const tone = turnAlertSoundPlayer.createOscillator(); // makes the note
    const volume = turnAlertSoundPlayer.createGain();     // controls how loud it is

    tone.frequency.value = pitch;

    // Fade in fast, then fade out, so the note sounds like a soft bell
    // instead of a harsh beep.
    volume.gain.setValueAtTime(0.0001, startTime);
    volume.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.5);

    // Wire it up: note -> volume knob -> speakers.
    tone.connect(volume);
    volume.connect(turnAlertSoundPlayer.destination);
    tone.start(startTime);
    tone.stop(startTime + 0.5);
  });
}

/* ---------------------------------------------------------------------------
 * SIMULATED SMS TEXT MESSAGES ("Your turn is coming up!")
 * A real clinic would text the patient's phone. This demo has no phones, so
 * the texts appear in a "Text Messages" card under the ticket, like the
 * patient's messaging app. The texts are written and "sent" by
 * js/sms-alerts.js.
 * HTML: <div id="status-sms-card"> in index.html
 * Styles: the "SIMULATED SMS TEXT MESSAGES" section of css/patient-status.css
 * ------------------------------------------------------------------------- */

/**
 * Fills in the Text Messages card for one patient.
 *
 * The card only appears if the patient ticked the SMS consent box when
 * checking in. Until their first text arrives, it says when to expect one.
 *
 * @param {Object} patient - The patient whose "phone" this is.
 */
function fillSmsInbox(patient) {
  const smsCard = document.getElementById('status-sms-card');

  // No consent = we never text them, so there's nothing to show.
  smsCard.hidden = !patientHasSmsConsent(patient);
  if (smsCard.hidden) return;

  const messages = getSmsMessagesForPatient(patient.id);
  const hasMessages = messages.length > 0;

  document.getElementById('status-sms-phone').textContent = `To: ${patient.phone}`;

  // Before any texts arrive, tell the patient when to expect one.
  const visitIsOver = patient.status === PATIENT_STATUS.DONE || patient.status === PATIENT_STATUS.NO_SHOW;
  const emptyMessage = document.getElementById('status-sms-empty');
  emptyMessage.hidden = hasMessages;
  emptyMessage.textContent = visitIsOver
    ? 'No texts were sent during this visit.'
    : `No texts yet. We'll text you when there are ${SMS_ALERT_PEOPLE_AHEAD} or fewer people ahead of you in line.`;

  const list = document.getElementById('status-sms-list');
  list.hidden = !hasMessages;

  // Only redraw the bubbles when something changed (a different patient or
  // a new text). This view redraws every 30 seconds; redrawing the bubbles
  // each time would replay the "new text" animation and make screen readers
  // read every text out loud again.
  const listKey = `${patient.id}:${messages.length}`;
  if (list.dataset.shownKey === listKey) return;
  list.dataset.shownKey = listKey;

  // One speech bubble per text, oldest at the top like a phone shows them.
  list.innerHTML = messages.map((message) => `
    <li class="sms-bubble">
      <p class="sms-bubble-text">${escapeHTML(message.text)}</p>
      <span class="sms-bubble-time">${escapeHTML(formatClockTime(message.sentAt))}</span>
    </li>
  `).join('');
}
