/*
 * =============================================================================
 * js/views/accepted-insurance.js - VIEW 6: Accepted Insurance Plans.
 * =============================================================================
 * HTML for this view: <section id="view-accepted-insurance"> in index.html
 * Styles for this view: css/accepted-insurance.css
 *
 * Displays a searchable list of 18 accepted insurance plans and health networks
 * so patients can verify coverage before checking in.
 *
 * Every view file follows the same standard structure (see AGENTS.md):
 *   initAcceptedInsuranceView()   - runs ONCE when page loads; connects search input events.
 *   renderAcceptedInsuranceView() - runs when view is shown or search query changes; redraws list.
 */

/**
 * List of accepted insurance providers and details.
 */
const ACCEPTED_INSURANCES = [
  {
    id: 'bcbs',
    name: 'Blue Cross Blue Shield',
    type: 'Commercial / PPO & HMO',
    networkStatus: 'In-Network',
    details: 'Includes Anthem, CareFirst, Horizon BCBS, and all BlueCard nationwide plans.'
  },
  {
    id: 'aetna',
    name: 'Aetna Healthcare',
    type: 'Commercial & Medicare Advantage',
    networkStatus: 'In-Network',
    details: 'Accepts Aetna Choice POS II, Open Access, HMO, and Medicare Advantage plans.'
  },
  {
    id: 'cigna',
    name: 'Cigna Health',
    type: 'Commercial / Open Access',
    networkStatus: 'In-Network',
    details: 'Accepts Cigna PPO, EPO, Open Access Plus, and Employer Group Plans.'
  },
  {
    id: 'uhc',
    name: 'UnitedHealthcare',
    type: 'Commercial, Medicare & Medicaid',
    networkStatus: 'In-Network',
    details: 'Includes UHC Choice Plus, Navigate, Community Plan, and Dual Complete.'
  },
  {
    id: 'medicare',
    name: 'Medicare (Original Part A & B)',
    type: 'Government / Senior Care',
    networkStatus: 'In-Network',
    details: 'Accepts Traditional Medicare and Medicare Supplement (Medigap) policies.'
  },
  {
    id: 'medicaid',
    name: 'Medicaid State Healthcare',
    type: 'Government / State Plan',
    networkStatus: 'In-Network',
    details: 'Accepts Direct State Medicaid and Managed Medicaid Programs.'
  },
  {
    id: 'humana',
    name: 'Humana',
    type: 'Medicare Advantage & Commercial',
    networkStatus: 'In-Network',
    details: 'Accepts Humana Choice PPO, Gold Plus HMO, and Veteran Healthcare benefits.'
  },
  {
    id: 'kaiser',
    name: 'Kaiser Permanente',
    type: 'HMO / Select Referral Plans',
    networkStatus: 'In-Network (With Referral)',
    details: 'Requires prior authorization or clinic affiliation check for non-emergency visits.'
  },
  {
    id: 'anthem',
    name: 'Anthem Health',
    type: 'Commercial & Exchange Plans',
    networkStatus: 'In-Network',
    details: 'Includes Anthem Blue Preferred, Pathway, and Individual ACA Exchange plans.'
  },
  {
    id: 'carefirst',
    name: 'CareFirst',
    type: 'Regional / PPO & EPO',
    networkStatus: 'In-Network',
    details: 'Accepts CareFirst Regional PPO, BlueChoice HMO, and Federal Employee Program.'
  },
  {
    id: 'molina',
    name: 'Molina Healthcare',
    type: 'Medicaid & Marketplace',
    networkStatus: 'In-Network',
    details: 'Accepts Molina Medicaid Options, Marketplace ACA, and Complete Care.'
  },
  {
    id: 'centene',
    name: 'Centene / Ambetter',
    type: 'Marketplace & Managed Care',
    networkStatus: 'In-Network',
    details: 'Includes Ambetter Health Marketplace Plans and WellCare Medicare Advantage.'
  },
  {
    id: 'oscar',
    name: 'Oscar Health Insurance',
    type: 'Individual & Small Group ACA',
    networkStatus: 'In-Network',
    details: 'Accepts Oscar Classic, Simple, and Care Tech-integrated health plans.'
  },
  {
    id: 'wellcare',
    name: 'WellCare Health Plans',
    type: 'Medicare Advantage & Prescription',
    networkStatus: 'In-Network',
    details: 'Accepts WellCare Value PPO, Patriot, and Dual Special Needs (D-SNP) plans.'
  },
  {
    id: 'tricare',
    name: 'Tricare Military Health',
    type: 'Military & Defense Health',
    networkStatus: 'In-Network',
    details: 'Includes Tricare Prime, Select, and Tricare For Life (TFL) Medicare supplement.'
  },
  {
    id: 'oxford',
    name: 'Oxford Health Plans',
    type: 'Commercial Freedom & Liberty',
    networkStatus: 'In-Network',
    details: 'Accepts Oxford Freedom, Liberty Network, and Metro PPO plans.'
  },
  {
    id: 'guardian',
    name: 'Guardian Healthcare',
    type: 'Supplemental & Specialty',
    networkStatus: 'In-Network',
    details: 'Covers routine diagnostic evaluations and preventative health Screenings.'
  },
  {
    id: 'horizon',
    name: 'Horizon Blue Cross Blue Shield',
    type: 'Regional Commercial & OMNIA',
    networkStatus: 'In-Network Tier 1',
    details: 'Accepts Horizon PPO, Direct Access, OMNIA Health Plans, and NJ FamilyCare.'
  }
];

/** Search query filter state. */
let insuranceSearchQuery = '';

/**
 * Connects search input events. Called once by js/app.js on page load.
 */
function initAcceptedInsuranceView() {
  const searchInput = document.getElementById('insurance-search-input');
  const clearBtn = document.getElementById('insurance-search-clear-btn');

  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      insuranceSearchQuery = event.target.value.trim().toLowerCase();
      if (clearBtn) {
        clearBtn.hidden = insuranceSearchQuery === '';
      }
      renderAcceptedInsuranceView();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      insuranceSearchQuery = '';
      if (searchInput) {
        searchInput.value = '';
      }
      clearBtn.hidden = true;
      renderAcceptedInsuranceView();
    });
  }
}

/**
 * Redraws the list of accepted insurances based on current search filter.
 * Called by js/app.js whenever the view is shown or search text changes.
 */
function renderAcceptedInsuranceView() {
  const gridContainer = document.getElementById('accepted-insurance-grid');
  if (!gridContainer) return;

  const filteredInsurances = ACCEPTED_INSURANCES.filter((provider) => {
    if (!insuranceSearchQuery) return true;
    const searchHaystack = `${provider.name} ${provider.type} ${provider.details} ${provider.networkStatus}`.toLowerCase();
    return searchHaystack.includes(insuranceSearchQuery);
  });

  if (filteredInsurances.length === 0) {
    gridContainer.innerHTML = `
      <div class="card insurance-empty-card">
        <p class="empty-msg">No accepted insurance plans found matching "${escapeHTML(insuranceSearchQuery)}".</p>
        <p class="insurance-empty-subnote">Please double-check your search term or speak with clinic staff at check-in.</p>
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = filteredInsurances
    .map((provider) => `
      <div class="card insurance-card">
        <div class="insurance-card-header">
          <h3 class="insurance-name">${escapeHTML(provider.name)}</h3>
          <span class="insurance-badge">${escapeHTML(provider.networkStatus)}</span>
        </div>
        <p class="insurance-type">${escapeHTML(provider.type)}</p>
        <p class="insurance-details">${escapeHTML(provider.details)}</p>
      </div>
    `)
    .join('');
}
