/*
 * =============================================================================
 * js/helpers.js - small, general-purpose tools used by every other file.
 * =============================================================================
 * Nothing in here knows about patients or queues. If a function is only
 * useful to one view, put it in that view's file instead.
 *
 * Loaded FIRST (see the <script> tags at the bottom of index.html), so every
 * other file can use these functions.
 */

/**
 * Makes text safe to put inside HTML.
 *
 * WHY THIS MATTERS: patients type their own name, phone, etc. If someone
 * typed "<script>...</script>" as their name and we inserted it directly
 * into the page, the browser would run it. This function turns special
 * characters like < and > into harmless versions (&lt; and &gt;).
 *
 * RULE: any time you build HTML from patient-entered text, wrap the text in
 * escapeHTML(...). Example:  `<span>${escapeHTML(patient.name)}</span>`
 *
 * @param {string} text - The text to clean up.
 * @returns {string} The same text, safe to place inside HTML.
 */
function escapeHTML(text) {
  // String(...) protects us if someone accidentally passes a number or null.
  return String(text ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

/**
 * Turns a saved timestamp (milliseconds) into a clock time like "2:45 PM".
 *
 * We store times as plain numbers (Date.now()) because numbers are easy to
 * sort and compare. This converts them to something people can read.
 *
 * @param {number} milliseconds - A value that came from Date.now().
 * @returns {string} e.g. "2:45 PM" (exact format depends on the browser's language).
 */
function formatClockTime(milliseconds) {
  return new Date(milliseconds).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Turns an appointment time from the form ("14:30") into "2:30 PM".
 *
 * <input type="time"> always gives a 24-hour "HH:MM" string, which is what
 * we save. This makes it friendlier to read.
 *
 * @param {string} timeText - A 24-hour time like "14:30".
 * @returns {string} e.g. "2:30 PM", or "" if there was no time.
 */
function formatAppointmentTime(timeText) {
  if (!timeText) return '';

  const [hours, minutes] = timeText.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes));
  return formatClockTime(date.getTime());
}

/**
 * Turns a number of minutes into friendly text.
 *
 * @param {number} minutes - How many minutes.
 * @returns {string} e.g. "No wait", "~15 mins", "~1 hr 30 mins".
 */
function formatWaitTime(minutes) {
  if (minutes <= 0) return 'No wait';

  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;

  if (hours === 0) return `~${minutes} mins`;
  if (leftoverMinutes === 0) return `~${hours} hr`;
  return `~${hours} hr ${leftoverMinutes} mins`;
}
