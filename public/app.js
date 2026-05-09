const reportForm = document.querySelector("#reportForm");
const todayLabel = document.querySelector("#todayLabel");
const formMessage = document.querySelector("#formMessage");
const totalDoctorsInput = document.querySelector("#totalDoctors");
const countInputs = Array.from(document.querySelectorAll(".count-input"));
const employeeNameInput = document.querySelector("#employeeName");

function getCountValues() {
  return countInputs.reduce((counts, input) => {
    counts[input.dataset.countField] = Math.max(0, Number(input.value) || 0);
    return counts;
  }, {});
}

function updateTotal() {
  const counts = getCountValues();
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  totalDoctorsInput.value = total;
}

function setFormMessage(message, type) {
  formMessage.textContent = message;
  formMessage.dataset.state = type;
}

async function loadMeta() {
  const response = await fetch("/api/meta");
  const meta = await response.json();
  todayLabel.textContent = `${meta.displayDate} (${meta.timeZone})`;
}

countInputs.forEach((input) => {
  input.addEventListener("input", updateTotal);
});

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage("Submitting report...", "neutral");

  const payload = {
    employeeName: employeeNameInput.value.trim(),
    callDetails: document.querySelector("#callDetails").value.trim(),
    doctorCounts: getCountValues()
  };

  try {
    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Could not submit report.");
    }

    localStorage.setItem("employee-reporting-name", payload.employeeName);
    reportForm.reset();
    countInputs.forEach((input) => {
      input.value = "0";
    });
    employeeNameInput.value = localStorage.getItem("employee-reporting-name") || "";
    updateTotal();
    setFormMessage("Report saved successfully.", "success");
  } catch (error) {
    setFormMessage(error.message, "error");
  }
});

employeeNameInput.value = localStorage.getItem("employee-reporting-name") || "";
loadMeta();
updateTotal();
