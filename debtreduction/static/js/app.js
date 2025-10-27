const settingsForm = document.getElementById("settings-form");
const debtForm = document.getElementById("debt-form");
const debtsTable = document.getElementById("debts-table");
const notificationEl = document.getElementById("notification");
const summaryTable = document.getElementById("summary-table");
const minPaymentsEl = document.getElementById("min-payments");
const initialSnowballEl = document.getElementById("initial-snowball");
const totalMonthsEl = document.getElementById("total-months");
const totalInterestEl = document.getElementById("total-interest");
const debtsCountEl = document.getElementById("debts-count");
const scheduleHead = document.getElementById("schedule-head");
const scheduleBody = document.getElementById("schedule-body");

const state = {
  settings: null,
  debts: [],
  overrides: new Map(),
  simulation: null,
  chart: null,
};

function formatCurrency(value) {
  const num = Number.parseFloat(value);
  if (Number.isNaN(num)) return "$0.00";
  return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function showNotification(message, variant = "error") {
  if (!message) {
    notificationEl.classList.add("hidden");
    notificationEl.textContent = "";
    return;
  }

  const baseClasses = ["rounded-md", "px-4", "py-3", "text-sm", "border"];
  notificationEl.className = baseClasses.join(" ");
  if (variant === "success") {
    notificationEl.classList.add("border-emerald-300", "bg-emerald-50", "text-emerald-700");
  } else {
    notificationEl.classList.add("border-red-300", "bg-red-50", "text-red-700");
  }
  notificationEl.textContent = message;
  notificationEl.classList.remove("hidden");
  window.setTimeout(() => {
    notificationEl.classList.add("hidden");
  }, 4000);
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let errorMessage = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (data?.error) {
        errorMessage = data.error;
      }
    } catch (err) {
      // ignore parse error
    }
    throw new Error(errorMessage);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadSettings() {
  state.settings = await fetchJSON("/api/settings");
  const { balanceDate, monthlyBudget, strategy } = state.settings;
  settingsForm.elements.balanceDate.value = balanceDate;
  settingsForm.elements.monthlyBudget.value = Number.parseFloat(monthlyBudget).toFixed(2);
  settingsForm.elements.strategy.value = strategy;
}

async function loadDebts() {
  state.debts = await fetchJSON("/api/debts");
  renderDebts();
}

async function loadOverrides() {
  const overrides = await fetchJSON("/api/schedule-overrides");
  state.overrides = new Map(overrides.map((item) => [item.monthIndex, item.additionalAmount]));
}

async function loadSimulation(showToast = true) {
  try {
    state.simulation = await fetchJSON("/api/simulation");
    renderSimulation();
    if (showToast) {
      showNotification("Simulation updated", "success");
    }
  } catch (error) {
    showNotification(error.message, "error");
  }
}

function renderDebts() {
  debtsTable.innerHTML = "";
  if (!state.debts.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6" class="px-3 py-4 text-center text-slate-500">No debts yet. Add your first debt to begin.</td>';
    debtsTable.appendChild(row);
    return;
  }

  state.debts.forEach((debt, index) => {
    const row = document.createElement("tr");
    row.dataset.id = debt.id;
    row.innerHTML = `
      <td class="px-3 py-2">
        <input name="creditor" value="${debt.creditor}" class="debt-input" />
      </td>
      <td class="px-3 py-2">
        <input name="balance" type="number" step="0.01" min="0" value="${Number.parseFloat(debt.balance).toFixed(2)}" class="debt-input" />
      </td>
      <td class="px-3 py-2">
        <input name="apr" type="number" step="0.01" min="0" value="${Number.parseFloat(debt.apr).toFixed(2)}" class="debt-input" />
      </td>
      <td class="px-3 py-2">
        <input name="minimumPayment" type="number" step="0.01" min="0" value="${Number.parseFloat(debt.minimumPayment).toFixed(2)}" class="debt-input" />
      </td>
      <td class="px-3 py-2">
        <input name="customPriority" type="number" step="1" min="1" value="${debt.customPriority ?? ""}" class="debt-input" />
      </td>
      <td class="px-3 py-2">
        <div class="flex flex-wrap gap-2 text-xs">
          <button type="button" class="btn-action bg-emerald-600 text-white" data-action="save">Save</button>
          <button type="button" class="btn-action bg-red-600 text-white" data-action="delete">Delete</button>
          <button type="button" class="btn-action bg-slate-200 text-slate-700" data-action="up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn-action bg-slate-200 text-slate-700" data-action="down" ${index === state.debts.length - 1 ? "disabled" : ""}>↓</button>
        </div>
      </td>
    `;
    debtsTable.appendChild(row);
  });
}

function buildDebtPayload(row) {
  const payload = {};
  const creditor = row.querySelector('[name="creditor"]').value.trim();
  const balance = row.querySelector('[name="balance"]').value;
  const apr = row.querySelector('[name="apr"]').value;
  const minimumPayment = row.querySelector('[name="minimumPayment"]').value;
  const customPriority = row.querySelector('[name="customPriority"]').value;
  if (!creditor) throw new Error("Creditor is required");
  payload.creditor = creditor;
  payload.balance = Number.parseFloat(balance);
  payload.apr = Number.parseFloat(apr);
  payload.minimumPayment = Number.parseFloat(minimumPayment);
  payload.customPriority = customPriority ? Number.parseInt(customPriority, 10) : null;
  return payload;
}

function renderSimulation() {
  if (!state.simulation) return;
  const { debts, months, totals } = state.simulation;

  minPaymentsEl.textContent = formatCurrency(totals.minPaymentsSum);
  initialSnowballEl.textContent = formatCurrency(totals.initialSnowball);
  totalMonthsEl.textContent = totals.totalMonths;
  totalInterestEl.textContent = formatCurrency(totals.totalInterest);
  debtsCountEl.textContent = debts.length;

  summaryTable.innerHTML = "";
  if (debts.length === 0) {
    summaryTable.innerHTML = '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-500">Add debts to view the payoff summary.</td></tr>';
  } else {
    debts.forEach((debt) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="px-3 py-2">${debt.creditor}</td>
        <td class="px-3 py-2">${formatCurrency(debt.initialBalance)}</td>
        <td class="px-3 py-2">${formatCurrency(debt.interestPaid)}</td>
        <td class="px-3 py-2">${debt.monthsToPayoff}</td>
        <td class="px-3 py-2">${debt.payoffMonthLabel ?? "–"}</td>
      `;
      summaryTable.appendChild(row);
    });
  }

  renderSchedule(months, debts);
  renderChart(months);
}

function renderSchedule(months, debts) {
  scheduleHead.innerHTML = "";
  scheduleBody.innerHTML = "";

  if (!months.length) {
    scheduleBody.innerHTML = '<tr><td colspan="4" class="px-3 py-4 text-center text-slate-500">Add debts to generate a schedule.</td></tr>';
    return;
  }

  const headerRow = document.createElement("tr");
  const debtHeaders = debts.map((debt) => ({ id: String(debt.id), label: debt.creditor }));
  const baseHeaders = [
    "Month #",
    "Month",
    "Snowball",
    "Additional",
    ...debtHeaders.map((item) => item.label),
  ];

  baseHeaders.forEach((label) => {
    const cell = document.createElement("th");
    cell.className = "px-3 py-2 text-left font-semibold text-slate-600";
    cell.textContent = label;
    headerRow.appendChild(cell);
  });
  scheduleHead.appendChild(headerRow);

  const debtsById = new Map(debtHeaders.map((item) => [item.id, item.label]));

  months.forEach((month) => {
    const row = document.createElement("tr");
    row.dataset.monthIndex = month.monthIndex;
    const overrideRaw = state.overrides.get(month.monthIndex) ?? month.additionalAmount ?? 0;
    const overridesValue = Number.parseFloat(overrideRaw);
    const overrideDisplay = Number.isNaN(overridesValue) ? "0.00" : overridesValue.toFixed(2);

    row.innerHTML = `
      <td class="px-3 py-2 font-semibold text-slate-700">${month.monthIndex}</td>
      <td class="px-3 py-2">${month.monthLabel}</td>
      <td class="px-3 py-2">${formatCurrency(month.snowballAmount)}</td>
      <td class="px-3 py-2">
        <input type="number" class="additional-input" step="0.01" min="0" value="${overrideDisplay}" />
      </td>
    `;

    debtHeaders.forEach((header) => {
      const payment = month.payments?.[header.id] ?? "0.00";
      const cell = document.createElement("td");
      cell.className = "px-3 py-2";
      cell.textContent = formatCurrency(payment);
      row.appendChild(cell);
    });

    scheduleBody.appendChild(row);
  });
}

function renderChart(months) {
  const ctx = document.getElementById("snowball-chart");
  const labels = months.map((month) => month.monthLabel);
  const snowballData = months.map((month) => Number.parseFloat(month.snowballAmount));
  const interestData = months.map((month) => Number.parseFloat(month.interestAccrued));

  if (!state.chart) {
    state.chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Snowball",
            data: snowballData,
            backgroundColor: "rgba(79, 70, 229, 0.6)",
            borderRadius: 4,
            maxBarThickness: 30,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Interest",
            data: interestData,
            borderColor: "rgba(16, 185, 129, 0.9)",
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: {
            type: "linear",
            position: "left",
            ticks: {
              callback: (value) => formatCurrency(value),
            },
            grid: { drawOnChartArea: true },
          },
          y1: {
            type: "linear",
            position: "right",
            ticks: {
              callback: (value) => formatCurrency(value),
            },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  } else {
    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = snowballData;
    state.chart.data.datasets[1].data = interestData;
    state.chart.update();
  }
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  const formData = new FormData(settingsForm);
  const payload = Object.fromEntries(formData.entries());
  payload.monthlyBudget = Number.parseFloat(payload.monthlyBudget);

  try {
    await fetchJSON("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await Promise.all([loadSettings(), loadSimulation(true)]);
  } catch (error) {
    showNotification(error.message, "error");
  }
}

async function handleDebtSubmit(event) {
  event.preventDefault();
  const formData = new FormData(debtForm);
  const payload = Object.fromEntries(formData.entries());
  payload.balance = Number.parseFloat(payload.balance);
  payload.apr = Number.parseFloat(payload.apr);
  payload.minimumPayment = Number.parseFloat(payload.minimumPayment);
  payload.customPriority = payload.customPriority ? Number.parseInt(payload.customPriority, 10) : null;

  try {
    await fetchJSON("/api/debts", { method: "POST", body: JSON.stringify(payload) });
    debtForm.reset();
    await Promise.all([loadDebts(), loadSimulation(true)]);
  } catch (error) {
    showNotification(error.message, "error");
  }
}

debtsTable.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest("tr");
  const debtId = Number.parseInt(row.dataset.id, 10);
  const action = button.dataset.action;

  if (action === "save") {
    try {
      const payload = buildDebtPayload(row);
      await fetchJSON(`/api/debts/${debtId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await Promise.all([loadDebts(), loadSimulation(true)]);
    } catch (error) {
      showNotification(error.message, "error");
    }
  }

  if (action === "delete") {
    if (!window.confirm("Delete this debt?")) return;
    try {
      await fetchJSON(`/api/debts/${debtId}`, { method: "DELETE" });
      await Promise.all([loadDebts(), loadSimulation(true)]);
    } catch (error) {
      showNotification(error.message, "error");
    }
  }

  if (action === "up" || action === "down") {
    const index = state.debts.findIndex((d) => d.id === debtId);
    const swapWith = action === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= state.debts.length) return;
    const updated = [...state.debts];
    const [moved] = updated.splice(index, 1);
    updated.splice(swapWith, 0, moved);
    const idsInOrder = updated.map((d) => d.id);
    try {
      await fetchJSON("/api/debts/reorder", {
        method: "POST",
        body: JSON.stringify({ idsInOrder }),
      });
      state.debts = updated;
      renderDebts();
      await loadSimulation(true);
    } catch (error) {
      showNotification(error.message, "error");
    }
  }
});

scheduleBody.addEventListener("change", async (event) => {
  if (!event.target.matches(".additional-input")) return;
  const row = event.target.closest("tr");
  const monthIndex = Number.parseInt(row.dataset.monthIndex, 10);
  const value = Number.parseFloat(event.target.value || "0");
  try {
    await fetchJSON(`/api/schedule-overrides/${monthIndex}`, {
      method: "PUT",
      body: JSON.stringify({ additionalAmount: value }),
    });
    await Promise.all([loadOverrides(), loadSimulation(true)]);
  } catch (error) {
    showNotification(error.message, "error");
  }
});

settingsForm.addEventListener("submit", handleSettingsSubmit);
debtForm.addEventListener("submit", handleDebtSubmit);

async function initialise() {
  try {
    await loadSettings();
    await loadDebts();
    await loadOverrides();
    await loadSimulation(false);
  } catch (error) {
    showNotification(error.message, "error");
  }
}

initialise();
