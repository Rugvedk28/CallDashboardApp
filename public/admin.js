const loginPanel = document.querySelector("#loginPanel");
const dashboardPanel = document.querySelector("#dashboardPanel");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const reportDateInput = document.querySelector("#reportDate");
const refreshButton = document.querySelector("#refreshButton");
const exportButton = document.querySelector("#exportButton");
const logoutButton = document.querySelector("#logoutButton");
const summaryGrid = document.querySelector("#summaryGrid");
const submissionsBody = document.querySelector("#submissionsBody");
const tableCaption = document.querySelector("#tableCaption");

function setLoginMessage(message, type) {
  loginMessage.textContent = message;
  loginMessage.dataset.state = type;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(isoString) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(new Date(isoString));
}

function renderSummary(summary) {
  const cards = [
    ["Total reports", summary.totalEntries],
    ["Total doctors", summary.totalDoctors],
    ["Consulting physician", summary.consultingPhysician],
    ["Surgeon", summary.surgeon],
    ["Orthos", summary.orthos],
    ["Urologist", summary.urologist],
    ["Gynacologist", summary.gynacologist]
  ];

  summaryGrid.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="card stat-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderRows(submissions) {
  if (!submissions.length) {
    submissionsBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">No submissions found for this date.</td>
      </tr>
    `;
    return;
  }

  submissionsBody.innerHTML = submissions
    .map(
      (entry) => `
        <tr>
          <td>${formatTime(entry.submittedAt)}</td>
          <td>${escapeHtml(entry.employeeName)}</td>
          <td>${escapeHtml(entry.callDetails || "-")}</td>
          <td>${entry.doctorCounts.consultingPhysician}</td>
          <td>${entry.doctorCounts.surgeon}</td>
          <td>${entry.doctorCounts.orthos}</td>
          <td>${entry.doctorCounts.urologist}</td>
          <td>${entry.doctorCounts.gynacologist}</td>
          <td>${entry.totalDoctors}</td>
        </tr>
      `
    )
    .join("");
}

async function loadMeta() {
  const response = await fetch("/api/meta");
  const meta = await response.json();
  reportDateInput.value = meta.today;
}

async function loadDashboard() {
  const response = await fetch(`/api/admin/submissions?date=${reportDateInput.value}`);

  if (response.status === 401) {
    loginPanel.classList.remove("hidden");
    dashboardPanel.classList.add("hidden");
    return;
  }

  const data = await response.json();
  loginPanel.classList.add("hidden");
  dashboardPanel.classList.remove("hidden");
  renderSummary(data.summary);
  renderRows(data.submissions);
  tableCaption.textContent = `${data.submissions.length} report(s) for ${data.date}`;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginMessage("Signing in...", "neutral");

  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: document.querySelector("#adminCode").value
    })
  });

  const data = await response.json();
  if (!response.ok) {
    setLoginMessage(data.error || "Login failed.", "error");
    return;
  }

  setLoginMessage("", "neutral");
  document.querySelector("#adminCode").value = "";
  await loadDashboard();
});

refreshButton.addEventListener("click", loadDashboard);
reportDateInput.addEventListener("change", loadDashboard);

exportButton.addEventListener("click", () => {
  window.location.href = `/api/admin/export?date=${reportDateInput.value}`;
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  loginPanel.classList.remove("hidden");
  dashboardPanel.classList.add("hidden");
});

loadMeta().then(loadDashboard);
