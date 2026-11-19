/*
 * Staff patient Kanban board. See the board markup in index.html and
 * its styles in css/admin.css. This is demo-only, browser-local data.
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
  renderAdminView();
}

/** Draws the full board from saved records, never from stale DOM cards.
 * @returns {void}
 */
function renderKanbanBoard() {
  const board = document.getElementById('admin-kanban-board');
  if (!board) return;
  const search = (document.getElementById('admin-search-input').value || '').trim().toLowerCase();
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
        <strong>${escapeHTML(patient.name)}</strong>
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
