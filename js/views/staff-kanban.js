/*
 * Staff patient Kanban board. See the board markup in index.html and
 * its styles in css/staff-kanban.css. This is demo-only, browser-local data.
 */

/** The order of the stages in a normal urgent-care visit. */
const KANBAN_STAGES = [
  ['checked-in', 'Checked In'],
  ['waiting-triage', 'Waiting for Triage'],
  ['in-triage', 'In Triage'],
  ['waiting-provider', 'Waiting for Provider'],
  ['with-provider', 'With Provider'],
  ['waiting-results', 'Waiting for Tests / Results'],
  ['treatment', 'Treatment in Progress'],
  ['ready-discharge', 'Ready for Discharge'],
  ['discharged', 'Discharged']
];

/** Returns a usable stage for both new and older patient records.
 * @param {Object} patient - Saved patient.
 * @returns {string} Stage identifier.
 */
function getKanbanStage(patient) {
  if (patient.status === PATIENT_STATUS.DONE) return 'discharged';
  if (patient.status === PATIENT_STATUS.NO_SHOW) return null;
  if (KANBAN_STAGES.some((stage) => stage[0] === patient.careStage)) return patient.careStage;
  return patient.status === PATIENT_STATUS.CALLED ? 'in-triage' : 'waiting-triage';
}

/** Updates the same saved patient used by the existing queues and patient view.
 * @param {string} patientId - Patient to move.
 * @param {string} nextStage - Destination column.
 * @returns {void}
 */
function moveKanbanPatient(patientId, nextStage) {
  if (!hasPermission('canManageQueue')) {
    alert('You do not have permission to move patients.');
    return;
  }
  const patient = getPatientById(patientId);
  if (!patient || patient.status === PATIENT_STATUS.NO_SHOW ||
      !KANBAN_STAGES.some((stage) => stage[0] === nextStage)) return;
  if (getKanbanStage(patient) === nextStage) return;

  // Keep the original queue statuses compatible with My Status and reports.
  const changes = { careStage: nextStage };
  if (nextStage === 'discharged') {
    changes.status = PATIENT_STATUS.DONE;
    changes.completedAt = patient.completedAt || Date.now();
    changes.calledAt = patient.calledAt || Date.now();
  } else if (nextStage === 'checked-in' || nextStage === 'waiting-triage') {
    changes.status = PATIENT_STATUS.WAITING;
    changes.completedAt = null;
    changes.calledAt = null;
  } else {
    changes.status = PATIENT_STATUS.CALLED;
    changes.calledAt = patient.calledAt || Date.now();
    changes.completedAt = null;
  }
  updatePatient(patientId, changes);
  renderStaffKanbanView();
}

/** Draws the full board from saved records, never from stale DOM cards.
 * @returns {void}
 */
function renderKanbanBoard() {
  const board = document.getElementById('admin-kanban-board');
  if (!board) return;
  const search = (document.getElementById('kanban-search-input').value || '').trim().toLowerCase();
  const patients = getAllPatients().filter((patient) =>
    getKanbanStage(patient) !== null && matchesSearch(patient, search));
  const canMove = hasPermission('canManageQueue');

  board.innerHTML = KANBAN_STAGES.map(([stageId, label]) => {
    const matching = patients.filter((patient) => getKanbanStage(patient) === stageId)
      .sort((a, b) => Number(Boolean(b.isUrgent)) - Number(Boolean(a.isUrgent)) ||
        a.checkedInAt - b.checkedInAt);
    const cards = matching.map((patient) => {
      const options = KANBAN_STAGES.map(([id, name]) =>
        `<option value="${id}" ${id === stageId ? 'selected' : ''}>${escapeHTML(name)}</option>`).join('');
      return `<article class="kanban-patient" draggable="${canMove}" data-patient-id="${escapeHTML(patient.id)}">
        <button type="button" class="kanban-patient-open" data-kanban-open="${escapeHTML(patient.id)}" aria-label="View record for ${escapeHTML(patient.name)}">${escapeHTML(patient.name)} <span aria-hidden="true">↗</span></button>
        <span>${escapeHTML(patient.ticketNumber)} · ${escapeHTML(patient.visitType)}</span>
        ${patient.isUrgent ? '<strong class="kanban-urgent">Urgent priority</strong>' : ''}
        <label>Move to
          <select data-kanban-move="${escapeHTML(patient.id)}" aria-label="Move ${escapeHTML(patient.name)} to stage" ${canMove ? '' : 'disabled'}>
            ${options}
          </select>
        </label>
      </article>`;
    }).join('');
    return `<section class="kanban-column" data-kanban-stage="${stageId}" aria-label="${escapeHTML(label)}">
      <h3>${escapeHTML(label)} <span>(${matching.length})</span></h3>
      <div class="kanban-column-cards">${cards || '<p class="empty-msg">No patients</p>'}</div>
    </section>`;
  }).join('');
}

/** Wires accessible dropdown moves and optional mouse drag-and-drop once.
 * @returns {void}
 */
function initKanbanBoard() {
  const board = document.getElementById('admin-kanban-board');
  if (!board) return;
  board.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-kanban-open]');
    if (openButton) openKanbanPatientRecord(openButton.dataset.kanbanOpen);
  });
  board.addEventListener('change', (event) => {
    const select = event.target.closest('[data-kanban-move]');
    if (select) moveKanbanPatient(select.dataset.kanbanMove, select.value);
  });
  board.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.kanban-patient');
    if (!card || !hasPermission('canManageQueue')) return;
    event.dataTransfer.setData('text/plain', card.dataset.patientId);
    event.dataTransfer.effectAllowed = 'move';
  });
  board.addEventListener('dragover', (event) => {
    if (event.target.closest('[data-kanban-stage]') && hasPermission('canManageQueue')) {
      event.preventDefault();
    }
  });
  board.addEventListener('drop', (event) => {
    const column = event.target.closest('[data-kanban-stage]');
    if (!column) return;
    event.preventDefault();
    moveKanbanPatient(event.dataTransfer.getData('text/plain'), column.dataset.kanbanStage);
  });
}

/** Connects the dedicated board view once when the app starts.
 * @returns {void}
 */
function initStaffKanbanView() {
  initKanbanBoard();
  document.getElementById('kanban-search-input').addEventListener('input', renderStaffKanbanView);
  const backdrop = document.getElementById('kanban-record-backdrop');
  document.getElementById('kanban-record-close').addEventListener('click', closeKanbanPatientRecord);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeKanbanPatientRecord();
  });
  document.addEventListener('keydown', (event) => {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') closeKanbanPatientRecord();
    if (event.key === 'Tab') {
      const focusables = [...backdrop.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])')];
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}

/** Refreshes only the dedicated staff board, not the full Staff Queue page.
 * @returns {void}
 */
function renderStaffKanbanView() {
  renderKanbanBoard();
  const total = getAllPatients().filter((patient) => getKanbanStage(patient) !== null).length;
  document.getElementById('kanban-patient-count').textContent =
    total + (total === 1 ? ' patient' : ' patients') + ' in board';
}

/** Tracks the control that opened the patient record for focus restoration. */
let kanbanRecordTrigger = null;

/** Shows all available check-in fields without inventing clinical data.
 * @param {string} patientId - Selected record ID.
 * @returns {void}
 */
function openKanbanPatientRecord(patientId) {
  if (!hasPermission('canViewAdmin')) return;
  const patient = getPatientById(patientId);
  if (!patient) return;
  const backdrop = document.getElementById('kanban-record-backdrop');
  const details = document.getElementById('kanban-record-details');
  kanbanRecordTrigger = document.activeElement;
  const display = (value) => value === null || value === undefined || value === ''
    ? 'Not provided' : escapeHTML(String(value));
  const dateTime = (value) => value ? escapeHTML(new Date(value).toLocaleString()) : 'Not recorded';
  const row = (label, value) => `<div class="kanban-record-field"><dt>${escapeHTML(label)}</dt><dd>${value}</dd></div>`;
  const stage = KANBAN_STAGES.find(([id]) => id === getKanbanStage(patient));
  details.innerHTML = `
    <div class="kanban-record-section">
      <h3>Patient information</h3>
      <dl class="kanban-record-grid">
        ${row('Full name', display(patient.name))}
        ${row('Date of birth', display(patient.dob))}
        ${row('Phone number', display(patient.phone))}
        ${row('Ticket number', display(patient.ticketNumber))}
      </dl>
    </div>
    <div class="kanban-record-section">
      <h3>Visit information</h3>
      <dl class="kanban-record-grid">
        ${row('Reason for visit', display(patient.reason))}
        ${row('Visit type', display(patient.visitType))}
        ${row('Appointment time', display(patient.appointmentTime))}
        ${row('Care stage', display(stage ? stage[1] : 'Not assigned'))}
        ${row('Urgent priority', patient.isUrgent ? 'Yes — flagged urgent' : 'No')}
        ${row('Queue status', display(patient.status))}
        ${row('Checked in', dateTime(patient.checkedInAt))}
        ${row('Called in', dateTime(patient.calledAt))}
        ${row('Completed', dateTime(patient.completedAt))}
      </dl>
    </div>
    <div class="kanban-record-section">
      <h3>Clinical alerts</h3>
      <dl class="kanban-record-grid">
        ${row('Known allergies', patient.allergies ? `<strong class="kanban-record-allergy">${display(patient.allergies)}</strong>` : 'Not provided — verify with patient')}
      </dl>
    </div>
    <div class="kanban-record-section">
      <h3>Communication preferences</h3>
      <dl class="kanban-record-grid">
        ${row('SMS consent', patient.smsConsent === true ? 'Yes' : 'No / not recorded')}
        ${row('Push consent', patient.pushConsent === true ? 'Yes' : 'No / not recorded')}
      </dl>
    </div>`;
  backdrop.hidden = false;
  document.getElementById('kanban-record-close').focus();
}

/** Closes the record and returns keyboard focus to its original card.
 * @returns {void}
 */
function closeKanbanPatientRecord() {
  document.getElementById('kanban-record-backdrop').hidden = true;
  if (kanbanRecordTrigger && kanbanRecordTrigger.isConnected) kanbanRecordTrigger.focus();
  kanbanRecordTrigger = null;
}
