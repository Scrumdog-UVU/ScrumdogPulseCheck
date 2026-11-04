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
 *     dob:             "1990-05-15"           // date of birth (YYYY-MM-DD)
 *     phone:           "(555) 123-4567"
 *     reason:          "Routine Checkup"      // one of the <option>s in index.html
 *     visitType:       "walk-in"              // VISIT_TYPE.WALK_IN or VISIT_TYPE.APPOINTMENT
 *     appointmentTime: "14:30" or null        // only set for appointments (24-hour "HH:MM")
 *     smsConsent:      false                  // true if patient consented to receive SMS updates
 *     pushConsent:     false                  // true if patient consented to receive push notifications
 *     messagingConsent: false                 // legacy consent flag kept for backward compatibility
 *     allergies:       "Penicillin"           // known/flagged allergies (optional string, defaults to "")
 *     isUrgent:        false                  // true if nurse/staff flagged patient as urgent to skip queue
 *     checkedInAt:     1695400000000          // Date.now() when they checked in
 *     calledAt:        1695400600000 or null  // Date.now() when called to desk
 *     completedAt:     1695401800000 or null  // Date.now() when visit marked complete
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
  CURRENT_VIEW: 'pulsecheck_current_view',          // which view was open last time
  SURVEYS: 'pulsecheck_surveys',                   // post-visit survey responses
  THEME: 'pulsecheck_theme',                       // user theme choice: "light" or "dark"
  CURRENT_ROLE: 'pulsecheck_current_role',          // current user role
  ROLE_PERMISSIONS: 'pulsecheck_role_permissions', // matrix of role-based permissions
  DISMISSED_TURN_ALERTS: 'pulsecheck_dismissed_turn_alerts', // patient ids that closed their "It's your turn" alert
  SMS_MESSAGES: 'pulsecheck_sms_messages'          // pretend text messages "sent" to patients (js/sms-alerts.js)
};

/**
 * Roles available in the system for Role-Based Access Control (RBAC).
 */
const USER_ROLES = {
  ADMIN: 'admin',           // Clinic Administration
  PROVIDER: 'provider',     // Clinician / Provider
  FRONT_DESK: 'front_desk', // Front Desk Staff
  PATIENT: 'patient'        // Patient
};

/**
 * Human-readable role names for display in the UI.
 */
const ROLE_LABELS = {
  [USER_ROLES.ADMIN]: 'Clinic Administration',
  [USER_ROLES.PROVIDER]: 'Provider',
  [USER_ROLES.FRONT_DESK]: 'Front Desk Staff',
  [USER_ROLES.PATIENT]: 'Patient'
};

/**
 * Default permissions configuration for each role.
 * Permissions dictate view visibility and functional capabilities across the app.
 */
const DEFAULT_ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: {
    canViewAdmin: true,
    canViewDashboard: true,
    canViewPatientStatus: true,
    canViewNewPatient: true,
    canViewSurvey: true,
    canManageQueue: true,
    canManageRoles: true,
    canResetData: true
  },
  [USER_ROLES.PROVIDER]: {
    canViewAdmin: true,
    canViewDashboard: true,
    canViewPatientStatus: true,
    canViewNewPatient: true,
    canViewSurvey: true,
    canManageQueue: true,
    canManageRoles: false,
    canResetData: false
  },
  [USER_ROLES.FRONT_DESK]: {
    canViewAdmin: true,
    canViewDashboard: true,
    canViewPatientStatus: true,
    canViewNewPatient: true,
    canViewSurvey: true,
    canManageQueue: true,
    canManageRoles: false,
    canResetData: false
  },
  [USER_ROLES.PATIENT]: {
    canViewAdmin: false,
    canViewDashboard: false,
    canViewPatientStatus: true,
    canViewNewPatient: true,
    canViewSurvey: true,
    canManageQueue: false,
    canManageRoles: false,
    canResetData: false
  }
};

/**
 * Where a patient is in their visit. A patient moves through these in order:
 *   WAITING  -> checked in, waiting in line
 *   CALLED   -> staff have called them in; they should come to the front desk
 *   DONE     -> visit finished
 *   NO_SHOW  -> patient did not show up when called or scheduled
 */
const PATIENT_STATUS = {
  WAITING: 'waiting',
  CALLED: 'called',
  DONE: 'done',
  NO_SHOW: 'no-show'
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
 *   { name, dob, phone, reason, visitType, appointmentTime, smsConsent, pushConsent, messagingConsent }
 * @returns {Object} The complete new patient record (including its new id).
 */
function addPatient(details) {
  const now = Date.now();

  // Support separate SMS and Push consents, falling back to legacy messagingConsent if present
  const smsConsent = details.smsConsent !== undefined
    ? Boolean(details.smsConsent)
    : Boolean(details.messagingConsent);
  const pushConsent = details.pushConsent !== undefined
    ? Boolean(details.pushConsent)
    : Boolean(details.messagingConsent);

  const newPatient = {
    // Time + a few random letters, so two check-ins in the same
    // millisecond still get different ids.
    id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
    ticketNumber: createTicketNumber(),
    name: details.name,
    dob: details.dob || null,
    phone: details.phone,
    reason: details.reason,
    visitType: details.visitType,
    appointmentTime: details.visitType === VISIT_TYPE.APPOINTMENT ? details.appointmentTime : null,
    smsConsent: smsConsent,
    pushConsent: pushConsent,
    messagingConsent: smsConsent || pushConsent,
    allergies: details.allergies ? details.allergies.trim() : '',
    isUrgent: Boolean(details.isUrgent),
    checkedInAt: now,
    calledAt: null,
    completedAt: null,
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
 * Scans all patient records to find potential duplicate patients.
 * Duplicates are detected when two records share:
 *   - The same normalized phone number (digits only), OR
 *   - The same normalized full name (case-insensitive, trimmed) AND date of birth, OR
 *   - The same normalized full name.
 *
 * @returns {Array<Object>} List of duplicate pair objects:
 *   [{ patientA: Object, patientB: Object, matchReasons: Array<string> }]
 */
function findPotentialDuplicates() {
  const patients = getAllPatients();
  const duplicatePairs = [];
  const seenPairKeys = new Set();

  for (let i = 0; i < patients.length; i++) {
    for (let j = i + 1; j < patients.length; j++) {
      const p1 = patients[i];
      const p2 = patients[j];

      const matchReasons = [];

      // Cleaned phone numbers (digits only)
      const phone1 = (p1.phone || '').replace(/\D/g, '');
      const phone2 = (p2.phone || '').replace(/\D/g, '');
      const phoneMatch = phone1.length >= 7 && phone1 === phone2;

      // Cleaned names
      const name1 = (p1.name || '').trim().toLowerCase();
      const name2 = (p2.name || '').trim().toLowerCase();
      const nameMatch = name1.length > 0 && name1 === name2;

      // Cleaned date of birth
      const dob1 = (p1.dob || '').trim();
      const dob2 = (p2.dob || '').trim();
      const dobMatch = dob1.length > 0 && dob1 === dob2;

      if (phoneMatch) {
        matchReasons.push('Matching Phone Number');
      }
      if (nameMatch && dobMatch) {
        matchReasons.push('Matching Name & Date of Birth');
      } else if (nameMatch) {
        matchReasons.push('Matching Name');
      } else if (dobMatch && phoneMatch) {
        matchReasons.push('Matching DOB');
      }

      if (matchReasons.length > 0) {
        const pairKey = [p1.id, p2.id].sort().join('::');
        if (!seenPairKeys.has(pairKey)) {
          seenPairKeys.add(pairKey);
          duplicatePairs.push({
            patientA: p1,
            patientB: p2,
            matchReasons: matchReasons
          });
        }
      }
    }
  }

  return duplicatePairs;
}

/**
 * Merges two patient records into one.
 * The primary record is kept and updated; the secondary record is deleted.
 * Any SMS messages, survey responses, or current patient selections referencing
 * the secondary record are redirected to the primary record.
 *
 * @param {string} primaryPatientId - ID of the record to keep.
 * @param {string} secondaryPatientId - ID of the duplicate record to merge in and delete.
 * @returns {Object|null} The updated primary patient record, or null on failure.
 */
function mergePatients(primaryPatientId, secondaryPatientId) {
  if (!primaryPatientId || !secondaryPatientId || primaryPatientId === secondaryPatientId) {
    console.error('Cannot merge: invalid patient IDs provided.');
    return null;
  }

  const primary = getPatientById(primaryPatientId);
  const secondary = getPatientById(secondaryPatientId);

  if (!primary || !secondary) {
    console.error('Cannot merge: one or both patient records do not exist.');
    return null;
  }

  // 1. Combine allergies (avoid duplicates)
  const allergiesSet = new Set();
  const splitAllergies = (str) => (str || '').split(',').map((item) => item.trim()).filter(Boolean);
  splitAllergies(primary.allergies).forEach((a) => allergiesSet.add(a));
  splitAllergies(secondary.allergies).forEach((a) => {
    // Skip placeholder strings like "None" if other real allergies exist
    if (!['none', 'no', 'n/a', 'nkda', 'none known'].includes(a.toLowerCase())) {
      allergiesSet.add(a);
    }
  });
  // If allergies set contains non-none allergies, remove any "None" tokens
  const realAllergies = Array.from(allergiesSet).filter(
    (a) => !['none', 'no', 'n/a', 'nkda', 'none known'].includes(a.toLowerCase())
  );
  const mergedAllergies = realAllergies.length > 0
    ? realAllergies.join(', ')
    : (primary.allergies || secondary.allergies || '');

  // 2. Consolidate communication consents (opt-in if either agreed)
  const mergedSmsConsent = Boolean(primary.smsConsent || secondary.smsConsent || primary.messagingConsent || secondary.messagingConsent);
  const mergedPushConsent = Boolean(primary.pushConsent || secondary.pushConsent || primary.messagingConsent || secondary.messagingConsent);

  // 3. Consolidate urgent flag
  const mergedIsUrgent = Boolean(primary.isUrgent || secondary.isUrgent);

  // 4. Consolidate timestamps (preserve earliest check-in time)
  const mergedCheckedInAt = Math.min(
    primary.checkedInAt || Date.now(),
    secondary.checkedInAt || Date.now()
  );

  // 5. Consolidate appointment details if primary doesn't have an appointment but secondary does
  let mergedVisitType = primary.visitType;
  let mergedAppointmentTime = primary.appointmentTime;
  if (mergedVisitType !== VISIT_TYPE.APPOINTMENT && secondary.visitType === VISIT_TYPE.APPOINTMENT) {
    mergedVisitType = VISIT_TYPE.APPOINTMENT;
    mergedAppointmentTime = secondary.appointmentTime;
  }

  // 6. Consolidate date of birth and phone if primary is missing them
  const mergedDob = primary.dob || secondary.dob || null;
  const mergedPhone = primary.phone || secondary.phone;

  // 7. Consolidate reason for visit (if secondary had different notes, record them)
  let mergedReason = primary.reason;
  if (secondary.reason && secondary.reason !== primary.reason) {
    mergedReason = `${primary.reason} (Also: ${secondary.reason})`;
  }

  // 8. Update the primary patient record
  const updatedPrimary = {
    ...primary,
    phone: mergedPhone,
    dob: mergedDob,
    reason: mergedReason,
    visitType: mergedVisitType,
    appointmentTime: mergedAppointmentTime,
    smsConsent: mergedSmsConsent,
    pushConsent: mergedPushConsent,
    messagingConsent: mergedSmsConsent || mergedPushConsent,
    allergies: mergedAllergies,
    isUrgent: mergedIsUrgent,
    checkedInAt: mergedCheckedInAt
  };

  // 9. Update patients array in storage: update primary, remove secondary
  const allPatients = getAllPatients()
    .filter((p) => p.id !== secondaryPatientId)
    .map((p) => (p.id === primaryPatientId ? updatedPrimary : p));
  saveAllPatients(allPatients);

  // 10. Re-assign SMS messages from secondary patient to primary patient
  const allSms = getAllSmsMessages().map((msg) => {
    if (msg.patientId === secondaryPatientId) {
      return { ...msg, patientId: primaryPatientId };
    }
    return msg;
  });
  localStorage.setItem(STORAGE_KEYS.SMS_MESSAGES, JSON.stringify(allSms));

  // 11. Re-assign surveys from secondary patient to primary patient
  const allSurveys = getAllSurveys().map((survey) => {
    if (survey.patientId === secondaryPatientId) {
      return { ...survey, patientId: primaryPatientId, patientName: updatedPrimary.name };
    }
    return survey;
  });
  localStorage.setItem(STORAGE_KEYS.SURVEYS, JSON.stringify(allSurveys));

  // 12. If the current view was "viewing as" the secondary patient, switch to primary
  if (getCurrentPatientId() === secondaryPatientId) {
    setCurrentPatientId(primaryPatientId);
  }

  return updatedPrimary;
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
 * THEME PREFERENCE - light mode vs dark mode
 * ------------------------------------------------------------------------- */

/** @returns {string|null} The saved theme choice ("light" or "dark"). */
function getSavedTheme() {
  return localStorage.getItem(STORAGE_KEYS.THEME);
}

/** @param {string} theme - "light" or "dark" */
function saveTheme(theme) {
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

/* ---------------------------------------------------------------------------
 * READING AND WRITING SURVEYS
 * ------------------------------------------------------------------------- */

/**
 * Loads all post-visit survey responses from storage.
 *
 * @returns {Array<Object>} A list of survey response objects.
 */
function getAllSurveys() {
  const savedText = localStorage.getItem(STORAGE_KEYS.SURVEYS);
  if (!savedText) return [];

  try {
    return JSON.parse(savedText);
  } catch (error) {
    console.error('Saved survey data was unreadable, starting fresh.', error);
    return [];
  }
}

/**
 * Saves a new post-visit survey response.
 *
 * @param {Object} details - { patientId, patientName, rating, comments }
 * @returns {Object} The complete created survey record.
 */
function addSurvey(details) {
  const now = Date.now();

  const newSurvey = {
    id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
    patientId: details.patientId || null,
    patientName: details.patientName || 'Anonymous',
    rating: Number(details.rating),
    comments: details.comments || '',
    createdAt: now
  };

  const surveys = getAllSurveys();
  surveys.push(newSurvey);
  localStorage.setItem(STORAGE_KEYS.SURVEYS, JSON.stringify(surveys));

  return newSurvey;
}

/* ---------------------------------------------------------------------------
 * ROLE-BASED ACCESS CONTROL (RBAC) & PERMISSIONS
 * ------------------------------------------------------------------------- */

/**
 * Gets the current active role from localStorage.
 * Defaults to Clinic Administration ('admin') so initial load has full access.
 *
 * @returns {string} The active role string.
 */
function getCurrentRole() {
  const savedRole = localStorage.getItem(STORAGE_KEYS.CURRENT_ROLE);
  if (savedRole && Object.values(USER_ROLES).includes(savedRole)) {
    return savedRole;
  }
  return USER_ROLES.ADMIN;
}

/**
 * Sets the active user role in localStorage.
 *
 * @param {string} role - The role string from USER_ROLES.
 */
function setCurrentRole(role) {
  if (Object.values(USER_ROLES).includes(role)) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, role);
  }
}

/**
 * Loads the current matrix of permissions for all roles.
 * Falls back to DEFAULT_ROLE_PERMISSIONS if none saved or invalid.
 *
 * @returns {Object} Object mapping role keys to permission objects.
 */
function getRolePermissions() {
  const savedText = localStorage.getItem(STORAGE_KEYS.ROLE_PERMISSIONS);
  if (!savedText) return DEFAULT_ROLE_PERMISSIONS;

  try {
    const parsed = JSON.parse(savedText);
    // Ensure all roles and expected permissions are present by merging defaults
    const permissions = {};
    Object.values(USER_ROLES).forEach((role) => {
      permissions[role] = {
        ...DEFAULT_ROLE_PERMISSIONS[role],
        ...(parsed[role] || {})
      };
    });
    return permissions;
  } catch (error) {
    console.error('Saved role permissions were unreadable, using defaults.', error);
    return DEFAULT_ROLE_PERMISSIONS;
  }
}

/**
 * Saves the full role permissions matrix to localStorage.
 *
 * @param {Object} permissionsMatrix - Matrix mapping roles to permission flags.
 */
function saveRolePermissions(permissionsMatrix) {
  localStorage.setItem(STORAGE_KEYS.ROLE_PERMISSIONS, JSON.stringify(permissionsMatrix));
}

/**
 * Updates a single permission flag for a specific role and saves to storage.
 *
 * @param {string} role - Which role to modify.
 * @param {string} permissionKey - e.g. "canManageQueue" or "canViewAdmin".
 * @param {boolean} value - Whether permission is granted.
 */
function updateRolePermission(role, permissionKey, value) {
  const permissions = getRolePermissions();
  if (permissions[role] && permissionKey in DEFAULT_ROLE_PERMISSIONS[USER_ROLES.ADMIN]) {
    permissions[role][permissionKey] = Boolean(value);
    saveRolePermissions(permissions);
  }
}

/**
 * Checks if the current active user role has a specific permission.
 *
 * @param {string} permissionKey - The permission flag name to check.
 * @returns {boolean} True if current role has permission, false otherwise.
 */
function hasPermission(permissionKey) {
  const role = getCurrentRole();
  const permissionsMatrix = getRolePermissions();
  const rolePerms = permissionsMatrix[role] || DEFAULT_ROLE_PERMISSIONS[role];
  return Boolean(rolePerms && rolePerms[permissionKey]);
}

/* ---------------------------------------------------------------------------
 * "IT'S YOUR TURN" ALERTS - the pretend push notification on My Status
 * Remembers which patients have already closed their alert, so it doesn't
 * pop up again after a page refresh or in a second browser tab.
 * ------------------------------------------------------------------------- */

/**
 * Checks whether a patient has already closed their "It's your turn" alert.
 *
 * @param {string} patientId
 * @returns {boolean} True if they already dismissed it.
 */
function hasDismissedTurnAlert(patientId) {
  return getDismissedTurnAlertIds().includes(patientId);
}

/**
 * Remembers that a patient closed their "It's your turn" alert.
 *
 * @param {string} patientId
 */
function dismissTurnAlert(patientId) {
  const dismissedIds = getDismissedTurnAlertIds();
  if (dismissedIds.includes(patientId)) return; // already saved, nothing to do

  dismissedIds.push(patientId);
  localStorage.setItem(STORAGE_KEYS.DISMISSED_TURN_ALERTS, JSON.stringify(dismissedIds));
}

/**
 * Loads the list of patient ids whose alert has been dismissed.
 * (Other files should use the two functions above instead.)
 *
 * @returns {Array<string>} Patient ids. Empty list if none.
 */
function getDismissedTurnAlertIds() {
  const savedText = localStorage.getItem(STORAGE_KEYS.DISMISSED_TURN_ALERTS);
  if (!savedText) return [];

  try {
    return JSON.parse(savedText);
  } catch (error) {
    console.error('Saved turn-alert data was unreadable, starting fresh.', error);
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * SIMULATED SMS TEXT MESSAGES - "Your turn is coming up!"
 * The texts the clinic has "sent" to patients. This demo can't send real
 * texts, so js/sms-alerts.js saves them here instead and the My Status view
 * shows them. Each saved text looks like this:
 *
 *   {
 *     id:        "1695400000000-ab12"    // unique id, never shown to users
 *     patientId: "1695300000000-cd34"    // which patient it was sent to
 *     phone:     "(555) 123-4567"        // the number it "went" to
 *     alertType: "turn-approaching"      // one of SMS_ALERT_TYPE in js/sms-alerts.js
 *     text:      "PulseCheck: Your turn is coming up! ..."
 *     sentAt:    1695400600000           // Date.now() when it was "sent"
 *   }
 * ------------------------------------------------------------------------- */

/**
 * Loads every saved text message, oldest first.
 *
 * @returns {Array<Object>} Text message records. Empty list if none.
 */
function getAllSmsMessages() {
  const savedText = localStorage.getItem(STORAGE_KEYS.SMS_MESSAGES);
  if (!savedText) return [];

  try {
    return JSON.parse(savedText);
  } catch (error) {
    console.error('Saved text message data was unreadable, starting fresh.', error);
    return [];
  }
}

/**
 * Loads the texts sent to one patient, oldest first (the order a phone
 * shows them in).
 *
 * @param {string} patientId
 * @returns {Array<Object>} That patient's text message records.
 */
function getSmsMessagesForPatient(patientId) {
  return getAllSmsMessages().filter((message) => message.patientId === patientId);
}

/**
 * Checks whether a patient has already been sent a certain kind of text,
 * so the same text is never sent twice.
 *
 * @param {string} patientId
 * @param {string} alertType - One of SMS_ALERT_TYPE in js/sms-alerts.js.
 * @returns {boolean} True if that text was already sent.
 */
function hasSentSmsMessage(patientId, alertType) {
  return getSmsMessagesForPatient(patientId).some((message) => message.alertType === alertType);
}

/**
 * Saves a new text message and returns it.
 *
 * @param {Object} details - { patientId, phone, alertType, text }
 * @returns {Object} The complete saved text message record.
 */
function addSmsMessage(details) {
  const now = Date.now();

  const newMessage = {
    id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
    patientId: details.patientId,
    phone: details.phone,
    alertType: details.alertType,
    text: details.text,
    sentAt: now
  };

  const messages = getAllSmsMessages();
  messages.push(newMessage);
  localStorage.setItem(STORAGE_KEYS.SMS_MESSAGES, JSON.stringify(messages));

  return newMessage;
}

/* ---------------------------------------------------------------------------
 * RESET
 * ------------------------------------------------------------------------- */

/** Wipes every piece of PulseCheck data from this browser. */
function clearAllData() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}
