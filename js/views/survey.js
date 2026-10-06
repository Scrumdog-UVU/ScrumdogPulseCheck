/*
 * =============================================================================
 * js/views/survey.js - VIEW 4: "Post-Visit Survey".
 * =============================================================================
 * HTML for this view: <section id="view-survey"> in index.html
 * Styles for this view: css/survey.css
 *
 * Allows patients to submit post-visit feedback rating their clinic visit.
 *
 * Every view file has the same two functions (see AGENTS.md):
 *   initSurveyView()   - runs ONCE when the page loads; connects buttons/forms.
 *   renderSurveyView() - runs every time the view is shown or data
 *                        changes; redraws the view from saved data.
 */

/**
 * Connects the survey form events. Called once by js/app.js on page load.
 */
function initSurveyView() {
  const form = document.getElementById('survey-form');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSurveySubmit();
  });
}

/**
 * Redraws this view. Called by js/app.js whenever the view is shown.
 */
function renderSurveyView() {
  const allPatients = getAllPatients();
  const select = document.getElementById('survey-patient-select');

  // Populate patient picker (showing recent patients first or default option)
  const newestFirst = [...allPatients].sort((a, b) => b.checkedInAt - a.checkedInAt);
  const currentPatientId = getCurrentPatientId();

  let optionsHTML = '<option value="">Anonymous / General Visitor</option>';
  optionsHTML += newestFirst.map((patient) => {
    const isSelected = patient.id === currentPatientId ? 'selected' : '';
    return `<option value="${escapeHTML(patient.id)}" ${isSelected}>
      ${escapeHTML(patient.name)} (${escapeHTML(patient.ticketNumber)})
    </option>`;
  }).join('');

  select.innerHTML = optionsHTML;

  // Render recent surveys list
  renderSurveysList();
}

/**
 * Reads the survey form, saves the survey response, and displays success message.
 */
function handleSurveySubmit() {
  const select = document.getElementById('survey-patient-select');
  const patientId = select.value || null;

  // Find selected patient name if picked
  let patientName = 'Anonymous';
  if (patientId) {
    const patient = getPatientById(patientId);
    if (patient) {
      patientName = patient.name;
    }
  }

  // Get selected rating (radio button)
  const ratingInput = document.querySelector('input[name="survey-rating"]:checked');
  if (!ratingInput) return;

  const rating = Number(ratingInput.value);
  const comments = document.getElementById('survey-comments').value.trim();

  // Save the survey using storage helper
  addSurvey({
    patientId: patientId,
    patientName: patientName,
    rating: rating,
    comments: comments
  });

  // Reset form
  document.getElementById('survey-form').reset();

  // Show success banner temporarily
  const banner = document.getElementById('survey-success-banner');
  banner.hidden = false;
  setTimeout(() => {
    banner.hidden = true;
  }, 4000);

  // Redraw view list
  renderSurveyView();
}

/**
 * Displays submitted surveys in the survey list container.
 */
function renderSurveysList() {
  const listContainer = document.getElementById('surveys-list-container');
  const surveys = getAllSurveys().sort((a, b) => b.createdAt - a.createdAt);

  if (surveys.length === 0) {
    listContainer.innerHTML = '<p class="empty-msg">No survey responses submitted yet.</p>';
    return;
  }

  listContainer.innerHTML = surveys.map((survey) => {
    const stars = '★'.repeat(survey.rating) + '☆'.repeat(5 - survey.rating);
    const dateText = formatClockTime(survey.createdAt);
    const commentsBlock = survey.comments
      ? `<p class="survey-item-comments">"${escapeHTML(survey.comments)}"</p>`
      : '';

    return `
      <div class="survey-item-row">
        <div class="survey-item-header">
          <span class="survey-item-name">${escapeHTML(survey.patientName)}</span>
          <span class="survey-item-stars" aria-label="${survey.rating} out of 5 stars">${stars}</span>
        </div>
        ${commentsBlock}
        <span class="survey-item-date">Submitted at ${escapeHTML(dateText)}</span>
      </div>
    `;
  }).join('');
}
