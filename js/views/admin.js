/*
 * =============================================================================
 * js/views/admin.js - VIEW 3: "Staff View" for clinic staff.
 * =============================================================================
 * HTML for this view: <section id="view-admin"> in index.html
 * Styles for this view: css/admin.css
 *
 * Staff see both queues (Scheduled Appointments and Walk-ins) and move each
 * patient along:
 *
 *     WAITING  --[Call In]-->  CALLED  --[Mark Done]-->  DONE
 *
 * Finished patients show in the "Finished Visits" list until staff clear it.
 */

/**
 * The buttons on each patient row. Each button's data-action="..." attribute
 * must match one of these names; handleAdminAction() below decides what
 * each one does.
 */
const ADMIN_ACTIONS = {
  CALL_IN: 'call-in',         // WAITING -> CALLED
  MARK_DONE: 'mark-done',     // CALLED  -> DONE
  TOGGLE_URGENT: 'toggle-urgent', // toggle isUrgent flag (true/false)
  NO_SHOW: 'no-show',         // WAITING/CALLED -> NO_SHOW
  UNDO_CHECK_IN: 'undo-check-in', // remove an accidental check-in while still waiting
  REMOVE: 'remove',           // delete the patient entirely
  MERGE: 'merge'              // open merge dialog for this patient
};

/**
 * Connects the buttons for this view. Called once by js/app.js.
 */
function initAdminView() {
  // The patient rows are re-created every time the view redraws, so instead
  // of attaching a click handler to every single row button, we attach ONE
  // handler to the whole view and check which button was clicked.
  // (This technique is called "event delegation".)
  document.getElementById('view-admin').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return; // the click wasn't on one of our row buttons

    handleAdminAction(button.dataset.action, button.dataset.patientId);
  });

  const searchInput = document.getElementById('admin-search-input');
  const clearBtn = document.getElementById('admin-search-clear-btn');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearBtn) {
        clearBtn.hidden = searchInput.value.trim().length === 0;
      }
      renderAdminView();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      clearBtn.hidden = true;
      renderAdminView();
    });
  }

  document.getElementById('admin-clear-finished-btn').addEventListener('click', () => {
    if (!hasPermission('canResetData')) {
      alert('You do not have permission to clear finished visits.');
      return;
    }
    removeFinishedPatients();
    renderAdminView();
  });

  document.getElementById('admin-reset-btn').addEventListener('click', () => {
    if (!hasPermission('canResetData')) {
      alert('You do not have permission to reset demo data.');
      return;
    }
    if (!confirm('Delete ALL patients and start over? This cannot be undone.')) return;
    clearAllData();
    renderAdminView();
  });

  // Event listener for RBAC permissions checkboxes in the admin permissions card
  const permissionsContainer = document.getElementById('admin-permissions-matrix-container');
  if (permissionsContainer) {
    permissionsContainer.addEventListener('change', (event) => {
      const checkbox = event.target.closest('input[data-role-perm]');
      if (!checkbox) return;

      const role = checkbox.dataset.role;
      const permKey = checkbox.dataset.perm;
      const isChecked = checkbox.checked;

      updateRolePermission(role, permKey, isChecked);

      // Refresh top navigation tabs and admin view in case current role permissions changed
      if (typeof updateNavigationForRole === 'function') {
        updateNavigationForRole();
      }
      renderAdminView();
    });
  }

  // Event listeners for historical wait time report filter controls
  const periodFilter = document.getElementById('admin-waittime-period');
  const typeFilter = document.getElementById('admin-waittime-type');

  if (periodFilter) {
    periodFilter.addEventListener('change', () => {
      renderHistoricalWaitTimeReports(getAllPatients());
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      renderHistoricalWaitTimeReports(getAllPatients());
    });
  }

  // Refresh the satisfaction report when its timeframe changes.
  const satisfactionPeriod = document.getElementById('admin-satisfaction-period');
  if (satisfactionPeriod) {
    satisfactionPeriod.addEventListener('change', renderPatientSatisfactionTrend);
  }

  // Event listeners for Merge Duplicate Patients Modal
  initMergeModal();

  // Keep the audit log searchable without recording each keystroke as an event.
  ['admin-audit-patient-filter', 'admin-audit-user-filter'].forEach((filterId) => {
    document.getElementById(filterId).addEventListener('input', renderAuditLog);
  });
  document.getElementById('admin-audit-review').addEventListener('click', () => {
    recordAuditEvent({ action: 'review', resourceType: 'audit-log' });
    renderAuditLog();
  });
  document.getElementById('admin-audit-export').addEventListener('click', exportAuditLog);
}

/**
 * Carries out a row button click.
 *
 * @param {string} action - One of the ADMIN_ACTIONS values.
 * @param {string} patientId - Which patient the button belongs to.
 */
function handleAdminAction(action, patientId) {
  if (!hasPermission('canManageQueue')) {
    alert('Your active role does not have permission to modify the patient queue.');
    return;
  }

  const now = Date.now();
  if (action === ADMIN_ACTIONS.CALL_IN) {
    const existing = getPatientById(patientId);
    updatePatient(patientId, {
      status: PATIENT_STATUS.CALLED,
      careStage: 'in-triage',
      calledAt: (existing && existing.calledAt) ? existing.calledAt : now
    });

  } else if (action === ADMIN_ACTIONS.MARK_DONE) {
    const existing = getPatientById(patientId);
    updatePatient(patientId, {
      status: PATIENT_STATUS.DONE,
      careStage: 'discharged',
      calledAt: (existing && existing.calledAt) ? existing.calledAt : now,
      completedAt: now
    });

  } else if (action === ADMIN_ACTIONS.TOGGLE_URGENT) {
    const existing = getPatientById(patientId);
    if (existing) {
      updatePatient(patientId, { isUrgent: !existing.isUrgent });
    }

  } else if (action === ADMIN_ACTIONS.NO_SHOW) {
    updatePatient(patientId, { status: PATIENT_STATUS.NO_SHOW });

  } else if (action === ADMIN_ACTIONS.REMOVE) {
    if (!confirm('Remove this patient from the queue?')) return;
    removePatient(patientId);

  } else if (action === ADMIN_ACTIONS.UNDO_CHECK_IN) {
    // Undo is available only before staff call the patient in.
    const patient = getPatientById(patientId);
    if (!patient || patient.status !== PATIENT_STATUS.WAITING) return;
    if (!confirm('Undo this check-in? The patient will be removed from the queue.')) return;
    removePatient(patientId);

  } else if (action === ADMIN_ACTIONS.MERGE) {
    openMergeModal(patientId);
    return; // openMergeModal manages its own view update
  }

  renderAdminView();
}

/**
 * Redraws this view from saved data. Called by js/app.js whenever the view
 * is shown or the data changes.
 */
function renderAdminView() {
  // Staff actions (Call In, Mark Done, etc.) move the line, so "send" any
  // texts that are now due to patients who opted in. See js/sms-alerts.js.
  sendDueSmsAlerts();

  const allPatients = getAllPatients();

  // --- Summary counts at the top ---------------------------------------
  const countWithStatus = (status) => allPatients.filter((patient) => patient.status === status).length;
  document.getElementById('admin-count-waiting').textContent = countWithStatus(PATIENT_STATUS.WAITING);
  document.getElementById('admin-count-called').textContent = countWithStatus(PATIENT_STATUS.CALLED);
  document.getElementById('admin-count-done').textContent = countWithStatus(PATIENT_STATUS.DONE);
  document.getElementById('admin-count-noshow').textContent = countWithStatus(PATIENT_STATUS.NO_SHOW);

  // --- Search Query ---------------------------------------------------
  const searchInput = document.getElementById('admin-search-input');
  const clearBtn = document.getElementById('admin-search-clear-btn');
  const rawQuery = searchInput ? searchInput.value.trim() : '';
  const query = rawQuery.toLowerCase();

  if (clearBtn) {
    clearBtn.hidden = rawQuery.length === 0;
  }

  // --- Admin Demo Tools Visibility ------------------------------------
  const canReset = hasPermission('canResetData');
  const clearFinishedBtn = document.getElementById('admin-clear-finished-btn');
  const resetBtn = document.getElementById('admin-reset-btn');
  if (clearFinishedBtn) clearFinishedBtn.hidden = !canReset;
  if (resetBtn) resetBtn.hidden = !canReset;
  const auditCard = document.getElementById('admin-audit-card');
  if (auditCard) auditCard.hidden = !hasPermission('canManageRoles');

  // --- Duplicate Patient Detection Banner ------------------------------
  renderDuplicateAlert();
  renderAuditLog();

  // --- Today's Key Metrics Dashboard -----------------------------------
  renderKeyMetrics(allPatients);

  // --- Historical Wait-Time Reports (Just below key metrics) -----------
  renderHistoricalWaitTimeReports(allPatients);

  // --- Patient Satisfaction Trend --------------------------------------
  renderPatientSatisfactionTrend();

  // --- Role Permissions Management Matrix Card -------------------------
  renderPermissionsCard();

  // --- The two queues --------------------------------------------------
  const appointmentQueueItems = getQueue(VISIT_TYPE.APPOINTMENT).map((patient, index) => ({
    patient,
    position: index + 1
  }));
  const filteredAppointments = appointmentQueueItems.filter((item) => matchesSearch(item.patient, query));
  const appointmentEmptyText = rawQuery
    ? `No scheduled appointments matching "${rawQuery}".`
    : 'No scheduled appointments in line.';
  fillQueueList(
    document.getElementById('admin-appointment-list'),
    filteredAppointments,
    appointmentEmptyText
  );

  const walkinQueueItems = getQueue(VISIT_TYPE.WALK_IN).map((patient, index) => ({
    patient,
    position: index + 1
  }));
  const filteredWalkins = walkinQueueItems.filter((item) => matchesSearch(item.patient, query));
  const walkinEmptyText = rawQuery
    ? `No walk-ins matching "${rawQuery}".`
    : 'No walk-ins in line.';
  fillQueueList(
    document.getElementById('admin-walkin-list'),
    filteredWalkins,
    walkinEmptyText
  );

  // --- Finished visits (most recent check-in first) ---------------------
  const finishedQueueItems = allPatients
    .filter((patient) => patient.status === PATIENT_STATUS.DONE)
    .sort((a, b) => b.checkedInAt - a.checkedInAt)
    .map((patient) => ({ patient, position: 0 }));
  const filteredFinished = finishedQueueItems.filter((item) => matchesSearch(item.patient, query));
  const finishedEmptyText = rawQuery
    ? `No finished visits matching "${rawQuery}".`
    : 'No finished visits yet.';
  fillQueueList(
    document.getElementById('admin-finished-list'),
    filteredFinished,
    finishedEmptyText
  );

  // --- No-Show patients ------------------------------------------------
  const noshowQueueItems = allPatients
    .filter((patient) => patient.status === PATIENT_STATUS.NO_SHOW)
    .sort((a, b) => b.checkedInAt - a.checkedInAt)
    .map((patient) => ({ patient, position: 0 }));
  const filteredNoshow = noshowQueueItems.filter((item) => matchesSearch(item.patient, query));
  const noshowEmptyText = rawQuery
    ? `No no-shows matching "${rawQuery}".`
    : 'No no-show patients recorded.';
  fillQueueList(
    document.getElementById('admin-noshow-list'),
    filteredNoshow,
    noshowEmptyText
  );
}

/* ---------------------------------------------------------------------------
 * SIMULATED AUDIT LOG
 * ------------------------------------------------------------------------- */

/**
 * Draws filtered audit events for a simple patient or user review.
 * @returns {void}
 */
function renderAuditLog() {
  const list = document.getElementById('admin-audit-list');
  if (!list) return;
  const patientFilter = document.getElementById('admin-audit-patient-filter').value.trim().toLowerCase();
  const userFilter = document.getElementById('admin-audit-user-filter').value.trim().toLowerCase();
  const events = getAuditEvents().filter((event) => {
    const matchesPatient = !patientFilter || String(event.resourceId || '').toLowerCase().includes(patientFilter);
    const matchesUser = !userFilter || `${event.userId} ${event.role}`.toLowerCase().includes(userFilter);
    return matchesPatient && matchesUser;
  });
  document.getElementById('admin-audit-count').textContent = `${events.length} event${events.length === 1 ? '' : 's'} shown`;
  if (events.length === 0) {
    list.innerHTML = '<p class="empty-msg">No audit events match. Patient updates and role changes appear here.</p>';
    return;
  }
  list.innerHTML = events.map((event) => `
    <article class="audit-event-row">
      <div class="audit-event-main">
        <strong>${escapeHTML(event.action)}</strong>
        <span>${escapeHTML(event.resourceType)} ID: ${escapeHTML(event.resourceId || '—')}</span>
        <span>${escapeHTML(event.userId)} · ${escapeHTML(event.role)}</span>
      </div>
      <div class="audit-event-meta">
        <time datetime="${escapeHTML(event.timestamp)}">${escapeHTML(new Date(event.timestamp).toLocaleString())}</time>
        <span>${escapeHTML(event.outcome)} · ${escapeHTML(event.source)}</span>
        <small>${escapeHTML(event.serviceName)} · ${escapeHTML(event.client)}</small>
        <small>Request ${escapeHTML(event.requestId)}</small>
      </div>
    </article>
  `).join('');
}

/**
 * Downloads the currently filtered audit events as a CSV report.
 * @returns {void}
 */
function exportAuditLog() {
  recordAuditEvent({ action: 'export', resourceType: 'audit-log', resourceId: null });
  const patientFilter = document.getElementById('admin-audit-patient-filter').value.trim().toLowerCase();
  const userFilter = document.getElementById('admin-audit-user-filter').value.trim().toLowerCase();
  const events = getAuditEvents().filter((event) =>
    (!patientFilter || String(event.resourceId || '').toLowerCase().includes(patientFilter)) &&
    (!userFilter || `${event.userId} ${event.role}`.toLowerCase().includes(userFilter))
  );
  const columns = ['timestamp', 'userId', 'role', 'action', 'resourceType', 'resourceId', 'source', 'client', 'serviceName', 'outcome', 'requestId'];
  const csvCell = (value) => `"${String(value || '').replace(/"/g, '""')}"`;
  const csvText = [columns.join(','), ...events.map((event) => columns.map((column) => csvCell(event[column])).join(','))].join('\r\n');
  const downloadUrl = URL.createObjectURL(new Blob([csvText], { type: 'text/csv;charset=utf-8' }));
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = 'pulsecheck-audit-demo.csv';
  downloadLink.click();
  URL.revokeObjectURL(downloadUrl);
}

/**
 * Checks whether a patient record matches the search query by name or phone number.
 *
 * @param {Object} patient - The patient record.
 * @param {string} query - Cleaned lower-case search query.
 * @returns {boolean} True if the patient matches or query is empty.
 */
function matchesSearch(patient, query) {
  if (!query) return true;
  const name = (patient.name || '').toLowerCase();
  const phone = (patient.phone || '').toLowerCase();
  return name.includes(query) || phone.includes(query);
}

/**
 * Puts a list of patient rows into one of the queue boxes.
 *
 * @param {HTMLElement} listElement - The box to fill.
 * @param {Array<{patient: Object, position: number}>} items - Patient items to show, with preserved position numbers.
 * @param {string} emptyText - What to show if the list is empty.
 */
function fillQueueList(listElement, items, emptyText) {
  if (items.length === 0) {
    listElement.innerHTML = `<p class="empty-msg">${escapeHTML(emptyText)}</p>`;
    return;
  }

  listElement.innerHTML = items.map((item) => buildPatientRow(item.patient, item.position)).join('');
}

/**
 * Builds the HTML for one patient row in the Staff View.
 *
 * REMEMBER: wrap every patient-entered value in escapeHTML(...).
 *
 * @param {Object} patient - The patient record.
 * @param {number} position - Their place in this list (1 = first).
 * @returns {string} HTML text for the row.
 */
function buildPatientRow(patient, position) {
  // Appointment patients also show their appointment time.
  const appointmentLine = patient.visitType === VISIT_TYPE.APPOINTMENT
    ? `<span class="row-detail">📅 Appointment: ${escapeHTML(formatAppointmentTime(patient.appointmentTime))}</span>`
    : '';

  const dobLine = patient.dob
    ? ` · 🎂 DOB: ${escapeHTML(patient.dob)}`
    : '';

  // Support separate SMS and Push consents with fallback to legacy messagingConsent
  const hasSmsConsent = patient.smsConsent !== undefined
    ? Boolean(patient.smsConsent)
    : Boolean(patient.messagingConsent);
  const hasPushConsent = patient.pushConsent !== undefined
    ? Boolean(patient.pushConsent)
    : Boolean(patient.messagingConsent);

  const smsBadge = hasSmsConsent
    ? '<span class="consent-tag consent-yes">💬 SMS: Yes</span>'
    : '<span class="consent-tag consent-no">💬 SMS: No</span>';
  const pushBadge = hasPushConsent
    ? '<span class="consent-tag consent-yes">🔔 Push: Yes</span>'
    : '<span class="consent-tag consent-no">🔔 Push: No</span>';

  const consentBadges = `${smsBadge} · ${pushBadge}`;

  const allergiesRaw = (patient.allergies || '').trim();
  const hasFlaggedAllergies = allergiesRaw.length > 0 && !['none', 'no', 'n/a', 'nkda', 'none known'].includes(allergiesRaw.toLowerCase());

  const allergyLine = hasFlaggedAllergies
    ? `<span class="row-detail row-allergies-flagged">⚠️ <strong>Flagged Allergies:</strong> ${escapeHTML(allergiesRaw)}</span>`
    : `<span class="row-detail">🩺 <strong>Allergies:</strong> ${escapeHTML(allergiesRaw || 'None')}</span>`;

  // Check if current role has queue management permission
  const canManage = hasPermission('canManageQueue');

  // Which buttons to show depends on where the patient is in their visit.
  let buttons = '';
  if (canManage) {
    const isUrgent = Boolean(patient.isUrgent);
    const urgentButtonLabel = isUrgent ? 'Unflag Urgent' : 'Flag Urgent';
    const urgentButtonStyle = isUrgent ? 'btn-urgent-active' : 'btn-secondary';
    const urgentBtn = (patient.status === PATIENT_STATUS.WAITING || patient.status === PATIENT_STATUS.CALLED)
      ? actionButton(ADMIN_ACTIONS.TOGGLE_URGENT, urgentButtonLabel, urgentButtonStyle, patient.id)
      : '';

    const mergeBtn = actionButton(ADMIN_ACTIONS.MERGE, 'Merge', 'btn-secondary', patient.id);

    if (patient.status === PATIENT_STATUS.WAITING) {
      buttons = actionButton(ADMIN_ACTIONS.CALL_IN, 'Call In', 'btn-primary', patient.id) +
                urgentBtn +
                mergeBtn +
                actionButton(ADMIN_ACTIONS.NO_SHOW, 'No-Show', 'btn-secondary', patient.id) +
                actionButton(ADMIN_ACTIONS.UNDO_CHECK_IN, 'Undo Check-In', 'btn-secondary', patient.id);
    } else if (patient.status === PATIENT_STATUS.CALLED) {
      buttons = actionButton(ADMIN_ACTIONS.MARK_DONE, 'Mark Done', 'btn-primary', patient.id) +
                urgentBtn +
                mergeBtn +
                actionButton(ADMIN_ACTIONS.NO_SHOW, 'No-Show', 'btn-secondary', patient.id) +
                actionButton(ADMIN_ACTIONS.REMOVE, 'Remove', 'btn-secondary', patient.id);
    } else if (patient.status === PATIENT_STATUS.DONE) {
      buttons = mergeBtn;
    } else if (patient.status === PATIENT_STATUS.NO_SHOW) {
      buttons = mergeBtn + actionButton(ADMIN_ACTIONS.REMOVE, 'Remove', 'btn-secondary', patient.id);
    }
  } else {
    buttons = '<span class="row-detail" style="font-style: italic;">View Only</span>';
  }
  // DONE patients get no buttons.

  // Urgent badge tag
  const urgentTag = patient.isUrgent
    ? '<span class="urgent-tag" title="Urgent patient prioritized to skip queue">🚨 Urgent Priority</span>'
    : '';

  // Finished and No-Show patients don't have a place in line, so no "#1" badge for them.
  const positionBadge = (patient.status === PATIENT_STATUS.DONE || patient.status === PATIENT_STATUS.NO_SHOW)
    ? ''
    : `<span class="row-position">#${position}</span>`;

  const urgentRowClass = patient.isUrgent && patient.status !== PATIENT_STATUS.DONE ? 'row-urgent' : '';

  return `
    <div class="patient-row row-${escapeHTML(patient.status)} ${urgentRowClass}">
      ${positionBadge}
      <div class="row-info">
        <span class="row-name">${escapeHTML(patient.name)}
          <span class="row-ticket">${escapeHTML(patient.ticketNumber)}</span>
          ${urgentTag}
        </span>
        <span class="row-detail">${escapeHTML(patient.reason)}</span>
        ${appointmentLine}
        ${allergyLine}
        <span class="row-detail">🕒 Checked in ${escapeHTML(formatClockTime(patient.checkedInAt))} · 📞 ${escapeHTML(patient.phone)}${dobLine} · ${consentBadges}</span>
        ${patient.status === PATIENT_STATUS.CALLED ? '<span class="row-called-note">Called in - on their way</span>' : ''}
        ${patient.status === PATIENT_STATUS.NO_SHOW ? '<span class="row-called-note" style="color: var(--status-no-show);">Flagged as No-Show</span>' : ''}
      </div>
      <div class="row-buttons">${buttons}</div>
    </div>
  `;
}

/**
 * Builds one small button for a patient row.
 *
 * @param {string} action - One of ADMIN_ACTIONS.
 * @param {string} label - Text on the button.
 * @param {string} styleClass - e.g. "btn-primary" (see css/base.css).
 * @param {string} patientId
 * @returns {string} HTML for the button.
 */
function actionButton(action, label, styleClass, patientId) {
  return `<button type="button" class="btn btn-small ${styleClass}"
            data-action="${action}" data-patient-id="${escapeHTML(patientId)}">${label}</button>`;
}

/**
 * Renders the Role-Based Access Control (RBAC) permissions management card in Staff View.
 * Visible when current user role has `canManageRoles` permission.
 */
function renderPermissionsCard() {
  const permissionsCard = document.getElementById('admin-permissions-card');
  const container = document.getElementById('admin-permissions-matrix-container');
  if (!permissionsCard || !container) return;

  const canManageRoles = hasPermission('canManageRoles');
  permissionsCard.hidden = !canManageRoles;
  if (!canManageRoles) return;

  const permissionsMatrix = getRolePermissions();
  const roles = Object.values(USER_ROLES);

  const permissionLabels = {
    canViewAdmin: 'Access Staff View',
    canViewDashboard: 'Access Live Queue Dashboard',
    canViewPatientStatus: 'Access My Status View',
    canViewNewPatient: 'Access New Patient Check-In',
    canViewSurvey: 'Access Post-Visit Survey',
    canManageQueue: 'Manage Patient Queue (Call in, Mark done, Remove)',
    canManageRoles: 'Manage Role Permissions & Access Control',
    canResetData: 'Reset Demo Data & Clear Finished Visits'
  };

  const permKeys = Object.keys(permissionLabels);

  let tableHtml = `
    <div class="rbac-table-wrapper">
      <table class="rbac-table">
        <thead>
          <tr>
            <th>Permission</th>
            ${roles.map((role) => `<th>${escapeHTML(ROLE_LABELS[role] || role)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;

  permKeys.forEach((permKey) => {
    tableHtml += `
      <tr>
        <td class="rbac-perm-label">${escapeHTML(permissionLabels[permKey])}</td>
        ${roles.map((role) => {
          const isChecked = Boolean(permissionsMatrix[role] && permissionsMatrix[role][permKey]);
          // To prevent accidental lockout, disable editing Clinic Admin's canManageRoles & canViewAdmin
          const isProtected = role === USER_ROLES.ADMIN && (permKey === 'canManageRoles' || permKey === 'canViewAdmin');
          return `
            <td class="rbac-perm-cell">
              <label class="rbac-checkbox-wrapper">
                <input type="checkbox"
                       data-role-perm="true"
                       data-role="${escapeHTML(role)}"
                       data-perm="${escapeHTML(permKey)}"
                       ${isChecked ? 'checked' : ''}
                       ${isProtected ? 'disabled title="Protected Clinic Admin permission"' : ''}>
                <span class="sr-only">${escapeHTML(ROLE_LABELS[role])} ${escapeHTML(permissionLabels[permKey])}</span>
              </label>
            </td>
          `;
        }).join('')}
      </tr>
    `;
  });

  tableHtml += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = tableHtml;
}

/* ---------------------------------------------------------------------------
 * TODAY'S KEY METRICS DASHBOARD
 * ------------------------------------------------------------------------- */

/**
 * Calculates and renders today's key operational metrics for clinic administration.
 *
 * @param {Array<Object>} allPatients - Full list of patient records.
 */
function renderKeyMetrics(allPatients) {
  const grid = document.getElementById('admin-key-metrics-grid');
  if (!grid) return;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Patients who checked in today
  const todayPatients = allPatients.filter((p) => p.checkedInAt >= startOfToday);

  // If there are patients in demo data with earlier timestamps but no today patients,
  // we count all patients or today patients so the dashboard is informative in testing/demo.
  const activeSet = todayPatients.length > 0 ? todayPatients : allPatients;
  const isDemoFallback = todayPatients.length === 0 && allPatients.length > 0;

  const todayLabel = document.getElementById('admin-metrics-today-label');
  if (todayLabel) {
    todayLabel.textContent = isDemoFallback ? 'All Demo Data' : 'Today';
  }

  // 1. Total Check-ins & breakdown
  const totalCheckins = activeSet.length;
  const walkinCount = activeSet.filter((p) => p.visitType === VISIT_TYPE.WALK_IN).length;
  const appointmentCount = activeSet.filter((p) => p.visitType === VISIT_TYPE.APPOINTMENT).length;

  // 2. Active Queue Volume
  const waitingCount = activeSet.filter((p) => p.status === PATIENT_STATUS.WAITING).length;
  const calledCount = activeSet.filter((p) => p.status === PATIENT_STATUS.CALLED).length;
  const inQueueCount = waitingCount + calledCount;

  // 3. Completed Visits
  const doneCount = activeSet.filter((p) => p.status === PATIENT_STATUS.DONE).length;
  const completionRate = totalCheckins > 0 ? Math.round((doneCount / totalCheckins) * 100) : 0;

  // 4. Average Wait Time (time from check-in until called or done)
  const waitTimesMinutes = [];
  activeSet.forEach((patient) => {
    // If called or done, calculate actual wait time; if waiting, calculate current elapsed wait
    if (patient.calledAt && patient.calledAt >= patient.checkedInAt) {
      waitTimesMinutes.push(Math.round((patient.calledAt - patient.checkedInAt) / 60000));
    } else if (patient.completedAt && patient.completedAt >= patient.checkedInAt) {
      waitTimesMinutes.push(Math.round((patient.completedAt - patient.checkedInAt) / 60000));
    } else if (patient.status === PATIENT_STATUS.CALLED || patient.status === PATIENT_STATUS.DONE) {
      // Fallback estimate for records without calledAt
      waitTimesMinutes.push(MINUTES_PER_PATIENT);
    } else if (patient.status === PATIENT_STATUS.WAITING) {
      waitTimesMinutes.push(Math.max(0, Math.round((Date.now() - patient.checkedInAt) / 60000)));
    }
  });

  const avgWait = waitTimesMinutes.length > 0
    ? Math.round(waitTimesMinutes.reduce((sum, val) => sum + val, 0) / waitTimesMinutes.length)
    : 0;

  // 5. Peak Check-in Hour
  const hourCounts = {};
  activeSet.forEach((p) => {
    const hour = new Date(p.checkedInAt).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  let peakHour = null;
  let peakHourMax = 0;
  Object.keys(hourCounts).forEach((hourStr) => {
    const count = hourCounts[hourStr];
    if (count > peakHourMax) {
      peakHourMax = count;
      peakHour = Number(hourStr);
    }
  });

  let peakHourDisplay = 'None';
  if (peakHour !== null) {
    const ampm = peakHour >= 12 ? 'PM' : 'AM';
    const displayH = peakHour % 12 === 0 ? 12 : peakHour % 12;
    peakHourDisplay = `${displayH}:00 ${ampm} (${peakHourMax} pts)`;
  }

  // 6. No-Show Rate
  const noshowCount = activeSet.filter((p) => p.status === PATIENT_STATUS.NO_SHOW).length;
  const noshowRate = totalCheckins > 0 ? Math.round((noshowCount / totalCheckins) * 100) : 0;

  grid.innerHTML = `
    <div class="metric-card">
      <div class="metric-icon metric-icon-blue">👥</div>
      <div class="metric-body">
        <span class="metric-value">${totalCheckins}</span>
        <span class="metric-title">Total Check-Ins</span>
        <span class="metric-sub">${walkinCount} walk-ins · ${appointmentCount} appts</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-icon metric-icon-teal">⏳</div>
      <div class="metric-body">
        <span class="metric-value">${inQueueCount}</span>
        <span class="metric-title">In Queue Now</span>
        <span class="metric-sub">${waitingCount} waiting · ${calledCount} called</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-icon metric-icon-green">✅</div>
      <div class="metric-body">
        <span class="metric-value">${doneCount}</span>
        <span class="metric-title">Completed Visits</span>
        <span class="metric-sub">${completionRate}% completion rate</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-icon metric-icon-amber">⏱️</div>
      <div class="metric-body">
        <span class="metric-value">${avgWait} <small>mins</small></span>
        <span class="metric-title">Avg Wait Time</span>
        <span class="metric-sub">Across ${waitTimesMinutes.length} recorded patients</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-icon metric-icon-purple">📊</div>
      <div class="metric-body">
        <span class="metric-value metric-value-sm">${escapeHTML(peakHourDisplay)}</span>
        <span class="metric-title">Peak Arrival Window</span>
        <span class="metric-sub">Busiest intake hour</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-icon metric-icon-red">🚫</div>
      <div class="metric-body">
        <span class="metric-value">${noshowCount} <small>(${noshowRate}%)</small></span>
        <span class="metric-title">No-Show Patients</span>
        <span class="metric-sub">Missed queue call-ins</span>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
 * HISTORICAL WAIT-TIME REPORTS (Placed just below Key Metrics)
 * ------------------------------------------------------------------------- */

/**
 * Calculates and renders historical wait-time statistics, distributions, and
 * hourly/type breakdowns.
 *
 * @param {Array<Object>} allPatients - Full list of patient records.
 */
function renderHistoricalWaitTimeReports(allPatients) {
  const summaryContainer = document.getElementById('admin-waittime-summary-stats');
  const chartContainer = document.getElementById('admin-waittime-chart-container');
  if (!summaryContainer || !chartContainer) return;

  const periodSelect = document.getElementById('admin-waittime-period');
  const typeSelect = document.getElementById('admin-waittime-type');
  const selectedPeriod = periodSelect ? periodSelect.value : 'all';
  const selectedType = typeSelect ? typeSelect.value : 'all';

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Filter patients by timeframe
  let filteredPatients = allPatients.filter((p) => {
    if (selectedPeriod === 'today') {
      return p.checkedInAt >= startOfToday.getTime();
    } else if (selectedPeriod === '7days') {
      return p.checkedInAt >= (now - (7 * oneDayMs));
    }
    return true; // 'all'
  });

  // Filter patients by visit type
  if (selectedType !== 'all') {
    filteredPatients = filteredPatients.filter((p) => p.visitType === selectedType);
  }

  // Calculate wait duration in minutes for each patient in sample
  const recordsWithWait = filteredPatients.map((patient) => {
    let waitMins = 0;
    if (patient.calledAt && patient.calledAt >= patient.checkedInAt) {
      waitMins = Math.round((patient.calledAt - patient.checkedInAt) / 60000);
    } else if (patient.completedAt && patient.completedAt >= patient.checkedInAt) {
      waitMins = Math.round((patient.completedAt - patient.checkedInAt) / 60000);
    } else if (patient.status === PATIENT_STATUS.CALLED || patient.status === PATIENT_STATUS.DONE) {
      waitMins = MINUTES_PER_PATIENT;
    } else {
      waitMins = Math.max(0, Math.round((now - patient.checkedInAt) / 60000));
    }

    return {
      patient,
      waitMins,
      hour: new Date(patient.checkedInAt).getHours(),
      dateStr: new Date(patient.checkedInAt).toLocaleDateString()
    };
  });

  const waitValues = recordsWithWait.map((r) => r.waitMins).sort((a, b) => a - b);

  // If no data
  if (waitValues.length === 0) {
    summaryContainer.innerHTML = '<p class="empty-msg">No wait time records found for the selected filter criteria.</p>';
    chartContainer.innerHTML = '';
    return;
  }

  // Summary Math: Avg, Median, Max, Min
  const sum = waitValues.reduce((acc, v) => acc + v, 0);
  const avgWait = Math.round(sum / waitValues.length);
  const minWait = waitValues[0];
  const maxWait = waitValues[waitValues.length - 1];

  let medianWait = 0;
  const mid = Math.floor(waitValues.length / 2);
  if (waitValues.length % 2 !== 0) {
    medianWait = waitValues[mid];
  } else {
    medianWait = Math.round((waitValues[mid - 1] + waitValues[mid]) / 2);
  }

  // Walk-in vs Appointment Avg
  const walkinRecords = recordsWithWait.filter((r) => r.patient.visitType === VISIT_TYPE.WALK_IN);
  const apptRecords = recordsWithWait.filter((r) => r.patient.visitType === VISIT_TYPE.APPOINTMENT);

  const avgWalkin = walkinRecords.length > 0
    ? Math.round(walkinRecords.reduce((s, r) => s + r.waitMins, 0) / walkinRecords.length)
    : 0;
  const avgAppt = apptRecords.length > 0
    ? Math.round(apptRecords.reduce((s, r) => s + r.waitMins, 0) / apptRecords.length)
    : 0;

  summaryContainer.innerHTML = `
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${avgWait} <small>min</small></span>
      <span class="waittime-stat-lbl">Average Wait</span>
    </div>
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${medianWait} <small>min</small></span>
      <span class="waittime-stat-lbl">Median Wait</span>
    </div>
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${maxWait} <small>min</small></span>
      <span class="waittime-stat-lbl">Max Wait</span>
    </div>
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${minWait} <small>min</small></span>
      <span class="waittime-stat-lbl">Min Wait</span>
    </div>
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${avgWalkin} <small>min</small></span>
      <span class="waittime-stat-lbl">Avg Walk-in</span>
    </div>
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${avgAppt} <small>min</small></span>
      <span class="waittime-stat-lbl">Avg Appointment</span>
    </div>
  `;

  // Hourly Breakdown Calculation
  const hourlyData = {};
  for (let h = 7; h <= 18; h++) {
    hourlyData[h] = { hour: h, count: 0, totalWait: 0, walkinCount: 0, apptCount: 0 };
  }

  recordsWithWait.forEach((r) => {
    const h = r.hour;
    if (!hourlyData[h]) {
      hourlyData[h] = { hour: h, count: 0, totalWait: 0, walkinCount: 0, apptCount: 0 };
    }
    hourlyData[h].count += 1;
    hourlyData[h].totalWait += r.waitMins;
    if (r.patient.visitType === VISIT_TYPE.WALK_IN) {
      hourlyData[h].walkinCount += 1;
    } else {
      hourlyData[h].apptCount += 1;
    }
  });

  const activeHours = Object.values(hourlyData)
    .filter((slot) => slot.count > 0 || (slot.hour >= 8 && slot.hour <= 17))
    .sort((a, b) => a.hour - b.hour);

  const highestAvgHourly = Math.max(
    ...activeHours.map((slot) => (slot.count > 0 ? Math.round(slot.totalWait / slot.count) : 0)),
    30
  );

  let chartHtml = `
    <div class="report-table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>Time of Day</th>
            <th>Patient Volume</th>
            <th>Walk-ins</th>
            <th>Appts</th>
            <th>Average Wait</th>
            <th class="report-visual-col">Wait-Time Indicator</th>
          </tr>
        </thead>
        <tbody>
  `;

  activeHours.forEach((slot) => {
    const slotAvg = slot.count > 0 ? Math.round(slot.totalWait / slot.count) : 0;
    const ampm = slot.hour >= 12 ? 'PM' : 'AM';
    const displayH = slot.hour % 12 === 0 ? 12 : slot.hour % 12;
    const timeLabel = `${displayH}:00 ${ampm}`;
    const barPercentage = Math.min(100, Math.round((slotAvg / highestAvgHourly) * 100));

    let barColorClass = 'bar-normal';
    if (slotAvg >= 30) {
      barColorClass = 'bar-critical';
    } else if (slotAvg >= 20) {
      barColorClass = 'bar-warning';
    }

    chartHtml += `
      <tr>
        <td class="report-time-cell">${escapeHTML(timeLabel)}</td>
        <td><strong>${slot.count}</strong> pts</td>
        <td>${slot.walkinCount}</td>
        <td>${slot.apptCount}</td>
        <td><strong>${slotAvg} mins</strong></td>
        <td class="report-visual-col">
          <div class="report-bar-track" title="${slotAvg} mins average wait">
            <div class="report-bar-fill ${barColorClass}" style="width: ${barPercentage}%"></div>
          </div>
        </td>
      </tr>
    `;
  });

  chartHtml += `
        </tbody>
      </table>
    </div>
  `;

  chartContainer.innerHTML = chartHtml;
}

/**
 * Summarizes survey ratings by month for the Staff View satisfaction report.
 *
 * @returns {void} Draws report totals and the monthly rating trend table.
 */
function renderPatientSatisfactionTrend() {
  const summaryContainer = document.getElementById('admin-satisfaction-summary');
  const tableContainer = document.getElementById('admin-satisfaction-trend-table');
  if (!summaryContainer || !tableContainer) return;

  const periodSelect = document.getElementById('admin-satisfaction-period');
  const selectedPeriod = periodSelect ? periodSelect.value : '6months';
  const now = new Date();
  const nowMs = now.getTime();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const allSurveys = getAllSurveys().filter((survey) => {
    const createdAt = Number(survey.createdAt);
    const rating = Number(survey.rating);
    return Number.isFinite(createdAt) && createdAt <= nowMs &&
      Number.isFinite(rating) && rating >= 1 && rating <= 5;
  });

  let firstMonth = null;
  if (selectedPeriod === '6months' || selectedPeriod === '12months') {
    const monthsToShow = selectedPeriod === '6months' ? 6 : 12;
    firstMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - monthsToShow + 1, 1);
  } else if (allSurveys.length > 0) {
    const earliestSurvey = allSurveys.reduce((earliest, survey) =>
      Number(survey.createdAt) < Number(earliest.createdAt) ? survey : earliest
    );
    const earliestDate = new Date(Number(earliestSurvey.createdAt));
    firstMonth = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
  }

  const filteredSurveys = allSurveys.filter((survey) => {
    const surveyDate = new Date(Number(survey.createdAt));
    return !firstMonth || surveyDate >= firstMonth;
  });

  const monthGroups = {};
  filteredSurveys.forEach((survey) => {
    const surveyDate = new Date(Number(survey.createdAt));
    const monthKey = `${surveyDate.getFullYear()}-${String(surveyDate.getMonth() + 1).padStart(2, '0')}`;
    if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
    monthGroups[monthKey].push(Number(survey.rating));
  });

  const totalResponses = filteredSurveys.length;
  const averageRating = totalResponses > 0
    ? filteredSurveys.reduce((sum, survey) => sum + Number(survey.rating), 0) / totalResponses
    : 0;
  const positiveResponses = filteredSurveys.filter((survey) => Number(survey.rating) >= 4).length;
  const positiveShare = totalResponses > 0 ? Math.round((positiveResponses / totalResponses) * 100) : 0;

  summaryContainer.innerHTML = `
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${totalResponses > 0 ? averageRating.toFixed(1) : '—'} <small>/ 5</small></span>
      <span class="waittime-stat-lbl">Average Rating</span>
    </div>
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${totalResponses}</span>
      <span class="waittime-stat-lbl">Survey Responses</span>
    </div>
    <div class="waittime-stat-box">
      <span class="waittime-stat-val">${positiveShare}%</span>
      <span class="waittime-stat-lbl">Rated 4 or 5 Stars</span>
    </div>
  `;

  if (totalResponses === 0) {
    tableContainer.innerHTML = '<p class="empty-msg">No survey responses are available for this timeframe.</p>';
    return;
  }

  if (firstMonth && currentMonth >= firstMonth) {
    for (let monthDate = new Date(firstMonth); monthDate <= currentMonth; monthDate.setMonth(monthDate.getMonth() + 1)) {
      const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
    }
  }

  const monthKeys = Object.keys(monthGroups).sort((left, right) => right.localeCompare(left));
  if (monthKeys.length === 0) {
    tableContainer.innerHTML = '<p class="empty-msg">No survey responses are available for this timeframe.</p>';
    return;
  }

  const rows = monthKeys.map((monthKey) => {
    const ratings = monthGroups[monthKey];
    const monthlyAverage = ratings.length > 0
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : 0;
    const monthlyPositive = ratings.filter((rating) => rating >= 4).length;
    const monthlyPositiveShare = ratings.length > 0 ? Math.round((monthlyPositive / ratings.length) * 100) : 0;
    const [year, month] = monthKey.split('-').map(Number);
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const ratingDisplay = ratings.length > 0 ? monthlyAverage.toFixed(1) : '—';
    const bar = ratings.length > 0
      ? `<progress class="satisfaction-rating-bar" max="5" value="${monthlyAverage}" aria-label="Average rating ${ratingDisplay} out of 5">${ratingDisplay} out of 5</progress>`
      : '<span class="row-detail">No responses</span>';

    return `
      <tr>
        <td class="report-time-cell">${escapeHTML(monthLabel)}</td>
        <td><strong>${ratingDisplay}</strong> / 5</td>
        <td>${ratings.length}</td>
        <td>${ratings.length > 0 ? `${monthlyPositiveShare}%` : '—'}</td>
        <td class="report-visual-col">${bar}</td>
      </tr>
    `;
  }).join('');

  tableContainer.innerHTML = `
    <div class="report-table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Average Rating</th>
            <th>Responses</th>
            <th>4–5 Star Share</th>
            <th class="report-visual-col">Rating Trend</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
 * MERGE DUPLICATE PATIENTS MODAL & CONTROLS
 * ------------------------------------------------------------------------- */

/**
 * Initializes listeners for the Merge Duplicate Patients dialog.
 */
function initMergeModal() {
  const openBtn = document.getElementById('admin-open-merge-btn');
  const reviewBtn = document.getElementById('admin-review-duplicates-btn');
  const closeBtn = document.getElementById('admin-close-merge-btn');
  const cancelBtn = document.getElementById('admin-cancel-merge-btn');
  const confirmBtn = document.getElementById('admin-confirm-merge-btn');
  const modal = document.getElementById('admin-merge-modal');
  const primarySelect = document.getElementById('merge-primary-select');
  const secondarySelect = document.getElementById('merge-secondary-select');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      openMergeModal();
    });
  }

  if (reviewBtn) {
    reviewBtn.addEventListener('click', () => {
      const duplicates = findPotentialDuplicates();
      if (duplicates.length > 0) {
        openMergeModal(duplicates[0].patientA.id, duplicates[0].patientB.id);
      } else {
        openMergeModal();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeMergeModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeMergeModal);
  }

  // Close modal when clicking outside the dialog content
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeMergeModal();
      }
    });
  }

  // Update comparison view on selection change
  if (primarySelect) {
    primarySelect.addEventListener('change', updateMergeComparison);
  }

  if (secondarySelect) {
    secondarySelect.addEventListener('change', updateMergeComparison);
  }

  // Handle merge confirmation
  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleExecuteMerge);
  }

  // Handle clicking on detected candidate chips
  const suggestionsList = document.getElementById('merge-suggestions-list');
  if (suggestionsList) {
    suggestionsList.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-candidate-a]');
      if (!chip) return;

      const idA = chip.dataset.candidateA;
      const idB = chip.dataset.candidateB;
      if (primarySelect && secondarySelect) {
        primarySelect.value = idA;
        secondarySelect.value = idB;
        updateMergeComparison();
      }
    });
  }
}

/**
 * Shows or hides the duplicate alert banner based on current detected duplicates.
 */
function renderDuplicateAlert() {
  const alertCard = document.getElementById('admin-duplicate-alert');
  const alertMsg = document.getElementById('admin-duplicate-alert-msg');
  if (!alertCard || !alertMsg) return;

  const duplicates = findPotentialDuplicates();
  if (duplicates.length === 0) {
    alertCard.hidden = true;
    return;
  }

  alertCard.hidden = false;
  const count = duplicates.length;
  const pairWord = count === 1 ? 'pair' : 'pairs';
  const firstMatch = duplicates[0];
  const summary = `Found ${count} duplicate ${pairWord} (e.g., "${escapeHTML(firstMatch.patientA.name)}" - ${firstMatch.matchReasons.join(', ')}).`;
  alertMsg.innerHTML = summary;
}

/**
 * Opens the merge dialog and populates the patient selection dropdowns.
 *
 * @param {string} [initialPrimaryId] - Optional patient ID to preselect as primary.
 * @param {string} [initialSecondaryId] - Optional patient ID to preselect as secondary.
 */
function openMergeModal(initialPrimaryId, initialSecondaryId) {
  const modal = document.getElementById('admin-merge-modal');
  const primarySelect = document.getElementById('merge-primary-select');
  const secondarySelect = document.getElementById('merge-secondary-select');
  if (!modal || !primarySelect || !secondarySelect) return;

  const allPatients = getAllPatients();

  // Populate options
  const buildOptions = (selectedId) => {
    let html = '<option value="">-- Choose a patient --</option>';
    allPatients.forEach((patient) => {
      const isSelected = patient.id === selectedId ? 'selected' : '';
      const phoneDisplay = patient.phone ? ` · ${patient.phone}` : '';
      const dobDisplay = patient.dob ? ` · DOB: ${patient.dob}` : '';
      html += `<option value="${escapeHTML(patient.id)}" ${isSelected}>
        ${escapeHTML(patient.ticketNumber)} - ${escapeHTML(patient.name)} (${patient.status}${phoneDisplay}${dobDisplay})
      </option>`;
    });
    return html;
  };

  // If no initial IDs specified, check if there are detected duplicates
  const detectedDuplicates = findPotentialDuplicates();
  let defaultPrimary = initialPrimaryId;
  let defaultSecondary = initialSecondaryId;

  if (!defaultPrimary && detectedDuplicates.length > 0) {
    defaultPrimary = detectedDuplicates[0].patientA.id;
    defaultSecondary = detectedDuplicates[0].patientB.id;
  } else if (defaultPrimary && !defaultSecondary) {
    // If only primary given (e.g. from row button), find if there is a detected duplicate pair with this patient
    const match = detectedDuplicates.find(
      (d) => d.patientA.id === defaultPrimary || d.patientB.id === defaultPrimary
    );
    if (match) {
      defaultSecondary = match.patientA.id === defaultPrimary ? match.patientB.id : match.patientA.id;
    }
  }

  primarySelect.innerHTML = buildOptions(defaultPrimary);
  secondarySelect.innerHTML = buildOptions(defaultSecondary);

  // Render detected candidates chips
  renderMergeSuggestions(detectedDuplicates);

  // Update comparison view
  updateMergeComparison();

  modal.hidden = false;
  primarySelect.focus();
}

/**
 * Closes the merge dialog.
 */
function closeMergeModal() {
  const modal = document.getElementById('admin-merge-modal');
  if (modal) {
    modal.hidden = true;
  }
}

/**
 * Displays quick-select chips for detected duplicate pairs.
 *
 * @param {Array<Object>} detectedDuplicates
 */
function renderMergeSuggestions(detectedDuplicates) {
  const container = document.getElementById('merge-suggestions-container');
  const list = document.getElementById('merge-suggestions-list');
  if (!container || !list) return;

  if (detectedDuplicates.length === 0) {
    container.hidden = true;
    list.innerHTML = '';
    return;
  }

  container.hidden = false;
  list.innerHTML = detectedDuplicates.map((dup) => `
    <button type="button" class="suggestion-chip"
            data-candidate-a="${escapeHTML(dup.patientA.id)}"
            data-candidate-b="${escapeHTML(dup.patientB.id)}"
            title="Click to compare this duplicate pair">
      <span><strong>${escapeHTML(dup.patientA.name)}</strong> (${escapeHTML(dup.patientA.ticketNumber)} &amp; ${escapeHTML(dup.patientB.ticketNumber)})</span>
      <span class="analytics-badge" style="padding: 0.1rem 0.4rem; font-size: 0.72rem;">${escapeHTML(dup.matchReasons[0])}</span>
    </button>
  `).join('');
}

/**
 * Updates the side-by-side comparison previews and consolidated outcome preview.
 */
function updateMergeComparison() {
  const primarySelect = document.getElementById('merge-primary-select');
  const secondarySelect = document.getElementById('merge-secondary-select');
  const primaryPreview = document.getElementById('merge-primary-preview');
  const secondaryPreview = document.getElementById('merge-secondary-preview');
  const outcomeCard = document.getElementById('merge-outcome-summary');
  const confirmBtn = document.getElementById('admin-confirm-merge-btn');

  const primaryId = primarySelect ? primarySelect.value : '';
  const secondaryId = secondarySelect ? secondarySelect.value : '';

  const primary = primaryId ? getPatientById(primaryId) : null;
  const secondary = secondaryId ? getPatientById(secondaryId) : null;

  // Build card preview for one patient
  const buildPreview = (patient, title, badgeClass) => {
    if (!patient) {
      return `
        <div class="merge-preview-header">
          <span>${title}</span>
        </div>
        <p class="empty-msg">No patient selected</p>
      `;
    }

    const consentText = [
      patient.smsConsent ? 'SMS: Yes' : 'SMS: No',
      patient.pushConsent ? 'Push: Yes' : 'Push: No'
    ].join(' · ');

    return `
      <div class="merge-preview-header">
        <span>${title}</span>
        <span class="status-badge ${badgeClass}">${escapeHTML(patient.ticketNumber)} (${escapeHTML(patient.status)})</span>
      </div>
      <div class="merge-field-list">
        <div class="merge-field-item">
          <span class="merge-field-name">Name</span>
          <span class="merge-field-val">${escapeHTML(patient.name)}</span>
        </div>
        <div class="merge-field-item">
          <span class="merge-field-name">DOB</span>
          <span class="merge-field-val">${escapeHTML(patient.dob || 'None recorded')}</span>
        </div>
        <div class="merge-field-item">
          <span class="merge-field-name">Phone</span>
          <span class="merge-field-val">${escapeHTML(patient.phone || 'None recorded')}</span>
        </div>
        <div class="merge-field-item">
          <span class="merge-field-name">Visit Type</span>
          <span class="merge-field-val">${escapeHTML(patient.visitType)}${patient.appointmentTime ? ` (${escapeHTML(patient.appointmentTime)})` : ''}</span>
        </div>
        <div class="merge-field-item">
          <span class="merge-field-name">Reason</span>
          <span class="merge-field-val">${escapeHTML(patient.reason)}</span>
        </div>
        <div class="merge-field-item">
          <span class="merge-field-name">Allergies</span>
          <span class="merge-field-val">${escapeHTML(patient.allergies || 'None')}</span>
        </div>
        <div class="merge-field-item">
          <span class="merge-field-name">Consents &amp; Urgent</span>
          <span class="merge-field-val">${escapeHTML(consentText)}${patient.isUrgent ? ' · 🚨 Urgent Priority' : ''}</span>
        </div>
        <div class="merge-field-item">
          <span class="merge-field-name">Checked In</span>
          <span class="merge-field-val">${escapeHTML(formatClockTime(patient.checkedInAt))}</span>
        </div>
      </div>
    `;
  };

  if (primaryPreview) {
    primaryPreview.innerHTML = buildPreview(primary, 'Primary Record (Retained)', 'status-called');
  }

  if (secondaryPreview) {
    secondaryPreview.innerHTML = buildPreview(secondary, 'Duplicate Record (To Merge & Remove)', 'status-no-show');
  }

  // Outcome preview and button state
  if (primary && secondary && primary.id !== secondary.id) {
    if (confirmBtn) confirmBtn.disabled = false;

    // Allergy union preview
    const allergiesSet = new Set();
    const splitAllergies = (str) => (str || '').split(',').map((item) => item.trim()).filter(Boolean);
    splitAllergies(primary.allergies).forEach((a) => allergiesSet.add(a));
    splitAllergies(secondary.allergies).forEach((a) => {
      if (!['none', 'no', 'n/a', 'nkda', 'none known'].includes(a.toLowerCase())) {
        allergiesSet.add(a);
      }
    });
    const realAllergies = Array.from(allergiesSet).filter(
      (a) => !['none', 'no', 'n/a', 'nkda', 'none known'].includes(a.toLowerCase())
    );
    const combinedAllergies = realAllergies.length > 0 ? realAllergies.join(', ') : (primary.allergies || 'None');

    const smsCombined = Boolean(primary.smsConsent || secondary.smsConsent || primary.messagingConsent || secondary.messagingConsent);
    const pushCombined = Boolean(primary.pushConsent || secondary.pushConsent || primary.messagingConsent || secondary.messagingConsent);
    const urgentCombined = Boolean(primary.isUrgent || secondary.isUrgent);

    let reasonCombined = primary.reason;
    if (secondary.reason && secondary.reason !== primary.reason) {
      reasonCombined = `${primary.reason} (Also: ${secondary.reason})`;
    }

    if (outcomeCard) {
      outcomeCard.hidden = false;
      outcomeCard.innerHTML = `
        <div class="merge-outcome-title">
          <span>✓ Merge Summary Preview</span>
        </div>
        <ul class="merge-outcome-list">
          <li><strong>Retained Ticket:</strong> ${escapeHTML(primary.ticketNumber)} for ${escapeHTML(primary.name)}</li>
          <li><strong>Consolidated Allergies:</strong> ${escapeHTML(combinedAllergies)}</li>
          <li><strong>Communication Preferences:</strong> SMS: ${smsCombined ? 'Opted In' : 'No'}, Push: ${pushCombined ? 'Opted In' : 'No'}</li>
          ${urgentCombined ? '<li><strong>Priority:</strong> 🚨 Marked Urgent</li>' : ''}
          <li><strong>Consolidated Reason:</strong> ${escapeHTML(reasonCombined)}</li>
          <li><strong>Data Cleanup:</strong> Record ${escapeHTML(secondary.ticketNumber)} will be permanently removed, and its history linked to ${escapeHTML(primary.ticketNumber)}.</li>
        </ul>
      `;
    }
  } else {
    if (confirmBtn) confirmBtn.disabled = true;
    if (outcomeCard) {
      outcomeCard.hidden = false;
      if (primary && secondary && primary.id === secondary.id) {
        outcomeCard.innerHTML = `
          <div class="merge-outcome-title" style="color: var(--danger-color);">
            <span>⚠️ Please choose two different patient records</span>
          </div>
          <p style="margin: 0; color: var(--text-secondary);">A record cannot be merged with itself.</p>
        `;
      } else {
        outcomeCard.innerHTML = `
          <div class="merge-outcome-title" style="color: var(--text-secondary);">
            <span>ℹ️ Select both a Primary and Duplicate record</span>
          </div>
          <p style="margin: 0; color: var(--text-secondary);">Choose the record you wish to keep on the left, and the duplicate record to consolidate on the right.</p>
        `;
      }
    }
  }
}

/**
 * Executes the merge operation after staff confirmation.
 */
function handleExecuteMerge() {
  const primarySelect = document.getElementById('merge-primary-select');
  const secondarySelect = document.getElementById('merge-secondary-select');
  if (!primarySelect || !secondarySelect) return;

  const primaryId = primarySelect.value;
  const secondaryId = secondarySelect.value;

  if (!primaryId || !secondaryId || primaryId === secondaryId) {
    alert('Please select two different patient records to merge.');
    return;
  }

  const primary = getPatientById(primaryId);
  const secondary = getPatientById(secondaryId);

  if (!primary || !secondary) {
    alert('Could not find one or both patient records.');
    return;
  }

  const confirmPrompt = `Merge duplicate record #${secondary.ticketNumber} (${secondary.name}) into #${primary.ticketNumber} (${primary.name})?\n\nRecord #${secondary.ticketNumber} will be deleted and all relevant medical details consolidated.`;
  if (!confirm(confirmPrompt)) {
    return;
  }

  const merged = mergePatients(primaryId, secondaryId);
  if (!merged) {
    alert('Failed to merge patient records.');
    return;
  }

  closeMergeModal();
  renderAdminView();
  alert(`Successfully merged duplicate patient records into #${merged.ticketNumber} (${merged.name}).`);
}
