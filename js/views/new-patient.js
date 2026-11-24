/*
 * =============================================================================
 * js/views/new-patient.js - VIEW 1: the "New Patient" check-in form.
 * =============================================================================
 * HTML for this view: <section id="view-new-patient"> in index.html
 * Styles for this view: css/new-patient.css
 *
 * What happens here:
 *   1. The patient fills in the form or scans a QR code to prefill it.
 *   2. We save them as a new patient (addPatient in js/storage.js).
 *   3. We "log them in" (setCurrentPatientId) and show the check-in
 *      confirmation with their ticket and a button to open My Status.
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

  document.getElementById('qr-scan-start-btn').addEventListener('click', startQrScanner);
  document.getElementById('qr-scan-stop-btn').addEventListener('click', () => {
    stopQrScanner('Scanner stopped.');
  });

  // Stop the camera if the patient leaves the check-in screen or switches tabs.
  document.addEventListener('click', (event) => {
    const navigationButton = event.target.closest('[data-view], [data-go-to-view]');
    if (navigationButton && (navigationButton.dataset.view || navigationButton.dataset.goToView) !== 'new-patient') {
      stopQrScanner();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopQrScanner();
  });

  // Show or hide the "Appointment Time" box when the patient changes
  // their answer to "Do you have a scheduled appointment?"
  visitTypeSelect.addEventListener('change', updateAppointmentTimeRow);

  // Handle the "Check In" button.
  form.addEventListener('submit', (event) => {
    // Stop the browser's default behavior (reloading the page).
    event.preventDefault();
    handleCheckIn();
  });

  // Initialize the Apple-like 3-wheel date picker (Month, Day, Year).
  initDobPicker();

  // Reset the date picker to the default date when the form resets.
  form.addEventListener('reset', () => {
    // Allow the form reset to complete, then reset the wheels.
    setTimeout(() => {
      setDobPickerDate(DEFAULT_DOB_YEAR, DEFAULT_DOB_MONTH, DEFAULT_DOB_DAY);
    }, 0);
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
 * Reads the form, saves the new patient, and shows their confirmation.
 */
function handleCheckIn() {
  const form = document.getElementById('checkin-form');
  stopQrScanner();

  // Gather what was typed. .trim() removes extra spaces at the start/end.
  const details = {
    name: document.getElementById('patient-name').value.trim(),
    dob: document.getElementById('patient-dob').value,
    phone: document.getElementById('patient-phone').value.trim(),
    email: document.getElementById('patient-email').value.trim(),
    reason: document.getElementById('visit-reason').value,
    allergies: document.getElementById('patient-allergies').value.trim(),
    visitType: document.getElementById('visit-type').value,
    appointmentTime: document.getElementById('appointment-time').value,
    smsConsent: document.getElementById('patient-sms-consent').checked,
    pushConsent: document.getElementById('patient-push-consent').checked
  };

  // The browser already blocks empty "required" fields, but a name of only
  // spaces would get through, so double-check here.
  if (!details.name || !details.dob || !details.phone || !details.email || !details.reason) return;

  // Save the patient and remember them as the "logged in" patient.
  const newPatient = addPatient(details);
  setCurrentPatientId(newPatient.id);

  // Clear the form so the next patient starts fresh.
  form.reset();
  setDobPickerDate(DEFAULT_DOB_YEAR, DEFAULT_DOB_MONTH, DEFAULT_DOB_DAY);
  updateAppointmentTimeRow();

  // Show the confirmation for the exact patient this form just saved.
  showView('check-in-confirmation', newPatient.id);
}

/**
 * Opens the device camera and looks for a QR code with check-in details.
 *
 * @returns {Promise<void>}
 */
async function startQrScanner() {
  const status = document.getElementById('qr-scan-status');
  const video = document.getElementById('qr-scan-video');

  if (typeof BarcodeDetector === 'undefined') {
    status.textContent = 'QR scanning is not supported in this browser. You can still use the check-in form below.';
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = 'Camera access is not available. You can still use the check-in form below.';
    return;
  }

  const startButton = document.getElementById('qr-scan-start-btn');
  startButton.disabled = true;
  qrCameraScanning = true;
  try {
    qrCameraDetector = new BarcodeDetector({ formats: ['qr_code'] });
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    // A navigation click can stop scanning while the browser asks for permission.
    if (!qrCameraScanning) {
      cameraStream.getTracks().forEach((track) => track.stop());
      return;
    }

    qrCameraStream = cameraStream;
    video.srcObject = qrCameraStream;
    await video.play();
    if (!qrCameraScanning) return;
    video.hidden = false;
    startButton.hidden = true;
    document.getElementById('qr-scan-stop-btn').hidden = false;
    status.textContent = 'Point the camera at your clinic check-in QR code.';
    scanQrCameraFrame();
  } catch (error) {
    console.error('The QR scanner could not start.', error);
    stopQrScanner();
    status.textContent = 'The camera could not start. Check camera permission and try again, or use the form below.';
  }
}

/**
 * Checks one camera frame for a QR code, then schedules the next frame.
 *
 * @returns {Promise<void>}
 */
async function scanQrCameraFrame() {
  if (!qrCameraScanning) return;

  const video = document.getElementById('qr-scan-video');
  try {
    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      const codes = await qrCameraDetector.detect(video);
      if (!qrCameraScanning) return;
      const qrCode = codes.find((code) => code.rawValue);
      if (qrCode && applyQrCheckInData(qrCode.rawValue)) {
        stopQrScanner();
        document.getElementById('qr-scan-status').textContent =
          'Details loaded. Review them, agree to the privacy summary, and check in below.';
        return;
      }
    }
  } catch (error) {
    if (!qrCameraScanning) return;
    console.error('The QR scanner could not read a camera frame.', error);
    stopQrScanner();
    document.getElementById('qr-scan-status').textContent =
      'The camera could not read the QR code. Try again or use the form below.';
    return;
  }

  qrCameraFrameId = requestAnimationFrame(scanQrCameraFrame);
}

/**
 * Checks and copies the supported QR details into the patient form.
 *
 * @param {string} rawValue - Text read from the QR code.
 * @returns {boolean} True if the QR code contains valid check-in details.
 */
function applyQrCheckInData(rawValue) {
  const status = document.getElementById('qr-scan-status');
  let details;

  try {
    details = JSON.parse(rawValue);
  } catch (error) {
    status.textContent = 'This QR code is not a supported check-in code. Keep scanning or use the form below.';
    return false;
  }

  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    status.textContent = 'This QR code is not a supported check-in code. Keep scanning or use the form below.';
    return false;
  }

  const name = typeof details.name === 'string' ? details.name.trim() : '';
  const phone = typeof details.phone === 'string' ? details.phone.trim() : '';
  const reason = typeof details.reason === 'string' ? details.reason : '';
  const dobParts = typeof details.dob === 'string' ? details.dob.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const reasonExists = Array.from(document.getElementById('visit-reason').options)
    .some((option) => option.value === reason);

  if (!name || name.length > 50 || !phone || phone.length > 20 || !reasonExists || !dobParts) {
    status.textContent = 'This QR code is missing valid check-in details. Keep scanning or use the form below.';
    return false;
  }

  const year = Number(dobParts[1]);
  const month = Number(dobParts[2]);
  const day = Number(dobParts[3]);
  const dob = new Date(year, month - 1, day);
  const currentYear = new Date().getFullYear();
  if (year < 1920 || year > currentYear ||
      dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) {
    status.textContent = 'This QR code has an invalid date of birth. Keep scanning or use the form below.';
    return false;
  }

  const visitType = details.visitType || VISIT_TYPE.WALK_IN;
  const appointmentTime = typeof details.appointmentTime === 'string' ? details.appointmentTime : '';
  const validAppointmentTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(appointmentTime);
  if (visitType !== VISIT_TYPE.WALK_IN && visitType !== VISIT_TYPE.APPOINTMENT) {
    status.textContent = 'This QR code has an invalid visit type. Keep scanning or use the form below.';
    return false;
  }
  if (visitType === VISIT_TYPE.APPOINTMENT && !validAppointmentTime) {
    status.textContent = 'This QR code is missing a valid appointment time. Keep scanning or use the form below.';
    return false;
  }

  if (details.allergies !== undefined &&
      (typeof details.allergies !== 'string' || details.allergies.length > 100)) {
    status.textContent = 'This QR code has invalid allergy details. Keep scanning or use the form below.';
    return false;
  }

  document.getElementById('patient-name').value = name;
  document.getElementById('patient-phone').value = phone;
  document.getElementById('visit-reason').value = reason;
  document.getElementById('patient-allergies').value = details.allergies || '';
  document.getElementById('visit-type').value = visitType;
  setDobPickerDate(year, month, day);
  updateAppointmentTimeRow();
  document.getElementById('appointment-time').value =
    visitType === VISIT_TYPE.APPOINTMENT ? appointmentTime : '';

  // QR details must never carry consent forward from a previous kiosk visitor.
  document.getElementById('patient-privacy-consent').checked = false;
  document.getElementById('patient-sms-consent').checked = false;
  document.getElementById('patient-push-consent').checked = false;
  return true;
}

/**
 * Stops the camera and returns the scanner controls to their starting state.
 *
 * @param {string} [message] - Optional status text for the patient.
 * @returns {void}
 */
function stopQrScanner(message) {
  qrCameraScanning = false;
  if (qrCameraFrameId) cancelAnimationFrame(qrCameraFrameId);
  qrCameraFrameId = null;

  if (qrCameraStream) {
    qrCameraStream.getTracks().forEach((track) => track.stop());
    qrCameraStream = null;
  }

  const video = document.getElementById('qr-scan-video');
  video.pause();
  video.srcObject = null;
  video.hidden = true;
  const startButton = document.getElementById('qr-scan-start-btn');
  startButton.hidden = false;
  startButton.disabled = false;
  document.getElementById('qr-scan-stop-btn').hidden = true;
  qrCameraDetector = null;
  if (message) document.getElementById('qr-scan-status').textContent = message;
}

let qrCameraStream = null;
let qrCameraFrameId = null;
let qrCameraDetector = null;
let qrCameraScanning = false;

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

/* ---------------------------------------------------------------------------
 * APPLE-LIKE 3-WHEEL DATE PICKER
 * Provides drum/wheel scrolling selection for Month, Day, and Year.
 * ------------------------------------------------------------------------- */

// Height in pixels for each wheel item, matching css/new-patient.css (.ios-picker-item)
const DOB_ITEM_HEIGHT = 38;

// Default initial date shown (e.g. 1995-06-15)
const DEFAULT_DOB_YEAR = 1995;
const DEFAULT_DOB_MONTH = 6; // 1-12 (June)
const DEFAULT_DOB_DAY = 15;

// Month names list
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Current selected values for the picker
const dobPickerState = {
  year: DEFAULT_DOB_YEAR,
  month: DEFAULT_DOB_MONTH,
  day: DEFAULT_DOB_DAY
};

/**
 * Initializes the Month, Day, and Year wheel picker controls.
 */
function initDobPicker() {
  buildMonthWheel();
  buildYearWheel();
  buildDayWheel();

  setupWheelInteraction('dob-month-column', onMonthWheelChange);
  setupWheelInteraction('dob-day-column', onDayWheelChange);
  setupWheelInteraction('dob-year-column', onYearWheelChange);

  // Set initial default date
  setDobPickerDate(DEFAULT_DOB_YEAR, DEFAULT_DOB_MONTH, DEFAULT_DOB_DAY);
}

/**
 * Populates the Month wheel with 12 months.
 */
function buildMonthWheel() {
  const wheel = document.getElementById('dob-month-wheel');
  if (!wheel) return;

  wheel.innerHTML = MONTH_NAMES.map((name, index) => {
    const monthNum = index + 1;
    return `<div class="ios-picker-item" data-value="${monthNum}">${name}</div>`;
  }).join('');
}

/**
 * Populates the Year wheel with a range from 1920 to the current year.
 */
function buildYearWheel() {
  const wheel = document.getElementById('dob-year-wheel');
  if (!wheel) return;

  const currentYear = new Date().getFullYear();
  const startYear = 1920;
  let html = '';

  for (let y = currentYear; y >= startYear; y--) {
    html += `<div class="ios-picker-item" data-value="${y}">${y}</div>`;
  }

  wheel.innerHTML = html;
}

/**
 * Populates the Day wheel based on the currently selected month and year.
 */
function buildDayWheel() {
  const wheel = document.getElementById('dob-day-wheel');
  if (!wheel) return;

  const maxDays = getDaysInMonth(dobPickerState.year, dobPickerState.month);
  let html = '';

  for (let d = 1; d <= maxDays; d++) {
    html += `<div class="ios-picker-item" data-value="${d}">${d}</div>`;
  }

  wheel.innerHTML = html;

  // If current day is higher than maxDays (e.g. 31 in a 30-day month), adjust it
  if (dobPickerState.day > maxDays) {
    dobPickerState.day = maxDays;
  }
}

/**
 * Calculates number of days in a given month and year (accounting for leap years).
 *
 * @param {number} year - Four-digit year.
 * @param {number} month - Month (1-12).
 * @returns {number} Number of days (28-31).
 */
function getDaysInMonth(year, month) {
  // JavaScript Date with day 0 gives the last day of the previous month.
  return new Date(year, month, 0).getDate();
}

/**
 * Sets up scrolling, clicking, wheeling, and keyboard listeners on a picker column.
 *
 * @param {string} columnId - The DOM ID of the column element.
 * @param {Function} onChangeCallback - Called with the new selected numeric value.
 */
function setupWheelInteraction(columnId, onChangeCallback) {
  const column = document.getElementById(columnId);
  if (!column) return;

  let isScrollingTimeout = null;

  // When scrolling stops, snap to the nearest item and update selection
  column.addEventListener('scroll', () => {
    updateVisualStyles(column);

    if (isScrollingTimeout) clearTimeout(isScrollingTimeout);
    isScrollingTimeout = setTimeout(() => {
      const selectedValue = getSelectedValueFromScroll(column);
      if (selectedValue !== null) {
        onChangeCallback(selectedValue);
        updateVisualStyles(column);
      }
    }, 120);
  }, { passive: true });

  // Clicking directly on an item scrolls it to center
  column.addEventListener('click', (event) => {
    const item = event.target.closest('.ios-picker-item');
    if (!item) return;

    const value = Number(item.dataset.value);
    scrollColumnToValue(columnId, value);
    onChangeCallback(value);
  });

  // Enable keyboard arrow navigation (Up / Down)
  column.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const items = Array.from(column.querySelectorAll('.ios-picker-item'));
      const currentIndex = items.findIndex((el) => el.classList.contains('selected'));

      let nextIndex = currentIndex;
      if (event.key === 'ArrowUp') {
        nextIndex = Math.max(0, currentIndex - 1);
      } else {
        nextIndex = Math.min(items.length - 1, currentIndex + 1);
      }

      if (items[nextIndex]) {
        const val = Number(items[nextIndex].dataset.value);
        scrollColumnToValue(columnId, val);
        onChangeCallback(val);
      }
    }
  });
}

/**
 * Reads the selected value based on the column's current scrollTop position.
 *
 * @param {HTMLElement} column - The scrollable column container.
 * @returns {number|null} The numeric value of the centered item.
 */
function getSelectedValueFromScroll(column) {
  const items = Array.from(column.querySelectorAll('.ios-picker-item'));
  if (items.length === 0) return null;

  const scrollY = column.scrollTop;
  const index = Math.round(scrollY / DOB_ITEM_HEIGHT);
  const clampedIndex = Math.max(0, Math.min(items.length - 1, index));

  return Number(items[clampedIndex].dataset.value);
}

/**
 * Updates CSS classes (.selected, .near) on items according to scroll distance.
 *
 * @param {HTMLElement} column - The scrollable column container.
 */
function updateVisualStyles(column) {
  const items = Array.from(column.querySelectorAll('.ios-picker-item'));
  if (items.length === 0) return;

  const scrollY = column.scrollTop;
  const selectedIndex = Math.round(scrollY / DOB_ITEM_HEIGHT);

  items.forEach((item, index) => {
    const distance = Math.abs(index - selectedIndex);
    item.classList.toggle('selected', distance === 0);
    item.classList.toggle('near', distance === 1);
  });
}

/**
 * Scrolls a column to position a specific value at the center highlight.
 *
 * @param {string} columnId - The DOM ID of the column element.
 * @param {number} value - The numeric value to select.
 * @param {boolean} smooth - Whether to animate smoothly or instantly.
 */
function scrollColumnToValue(columnId, value, smooth = true) {
  const column = document.getElementById(columnId);
  if (!column) return;

  const items = Array.from(column.querySelectorAll('.ios-picker-item'));
  const index = items.findIndex((el) => Number(el.dataset.value) === Number(value));
  if (index === -1) return;

  const targetScrollTop = index * DOB_ITEM_HEIGHT;
  if (smooth) {
    column.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  } else {
    column.scrollTop = targetScrollTop;
  }

  // Update classes immediately
  updateVisualStyles(column);
}

/**
 * Handler called when the Month wheel value changes.
 *
 * @param {number} newMonth - Month 1-12.
 */
function onMonthWheelChange(newMonth) {
  dobPickerState.month = newMonth;
  // Rebuild days in case month length changed (e.g. Feb vs Jan)
  buildDayWheel();
  scrollColumnToValue('dob-day-column', dobPickerState.day, false);
  syncDobValue();
}

/**
 * Handler called when the Day wheel value changes.
 *
 * @param {number} newDay - Day 1-31.
 */
function onDayWheelChange(newDay) {
  dobPickerState.day = newDay;
  syncDobValue();
}

/**
 * Handler called when the Year wheel value changes.
 *
 * @param {number} newYear - Four-digit year.
 */
function onYearWheelChange(newYear) {
  dobPickerState.year = newYear;
  // Rebuild days in case leap year affected February days
  buildDayWheel();
  scrollColumnToValue('dob-day-column', dobPickerState.day, false);
  syncDobValue();
}

/**
 * Sets the date picker wheels to a specific year, month, and day.
 *
 * @param {number} year - Four-digit year.
 * @param {number} month - Month 1-12.
 * @param {number} day - Day 1-31.
 */
function setDobPickerDate(year, month, day) {
  dobPickerState.year = Number(year);
  dobPickerState.month = Number(month);
  dobPickerState.day = Number(day);

  buildDayWheel();

  scrollColumnToValue('dob-year-column', dobPickerState.year, false);
  scrollColumnToValue('dob-month-column', dobPickerState.month, false);
  scrollColumnToValue('dob-day-column', dobPickerState.day, false);

  syncDobValue();
}

/**
 * Formats current picker state into YYYY-MM-DD and writes it to the hidden input.
 */
function syncDobValue() {
  const yyyy = String(dobPickerState.year).padStart(4, '0');
  const mm = String(dobPickerState.month).padStart(2, '0');
  const dd = String(dobPickerState.day).padStart(2, '0');
  const dobFormatted = `${yyyy}-${mm}-${dd}`;

  const dobInput = document.getElementById('patient-dob');
  if (dobInput) {
    dobInput.value = dobFormatted;
  }
}
