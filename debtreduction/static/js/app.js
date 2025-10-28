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
const strategyLabelEl = document.getElementById("strategy-label");
const monthlyBudgetDisplayEl = document.getElementById("monthly-budget-display");
const debtFreeDateEl = document.getElementById("debt-free-date");
const summaryTotalInterestEl = document.getElementById("summary-total-interest");
const summaryDebtFreeEl = document.getElementById("summary-debt-free");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabGroups = document.querySelectorAll(".tab-group");
const resetBudgetBtn = document.getElementById("reset-budget");
const monthlyBudgetInput = settingsForm.elements.monthlyBudget;
let monthlyBudgetManuallySet = false;

const state = {
  settings: null,
  debts: [],
  overrides: new Map(),
  simulation: null,
  snowballChart: null,
  balanceChart: null,
};

const strategyLabels = {
  avalanche: "Avalanche (Highest APR First)",
  snowball: "Snowball (Lowest Balance First)",
  entered: "Entered Order",
  custom: "Custom Priority",
};

function formatCurrency(value) {
  const num = Number.parseFloat(value);
  if (Number.isNaN(num)) return "$0.00";
  return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function parseCurrency(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (value === null || value === undefined) return Number.NaN;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (cleaned.trim() === "") return Number.NaN;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatBudgetInput(amount) {
  const num = parseCurrency(amount);
  if (Number.isNaN(num)) return "";
  return formatCurrency(num).replace(/^\$/, "");
}

function updateBudgetInputDisplay(amount) {
  const formatted = formatBudgetInput(amount);
  monthlyBudgetInput.value = formatted;
}

function parsePercent(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (value === null || value === undefined) return Number.NaN;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (cleaned.trim() === "") return Number.NaN;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatPercentInput(value) {
  const num = parsePercent(value);
  if (Number.isNaN(num)) return "";
  return num.toFixed(2);
}

function showNotification(message, variant = "error") {
  if (!message) {
    notificationEl.classList.add("hidden");
    notificationEl.textContent = "";
    return;
  }

  notificationEl.className = "notification";
  if (variant === "success") {
    notificationEl.classList.add("success");
  } else {
    notificationEl.classList.add("error");
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
  const parsedBudget = parseCurrency(monthlyBudget);
  const budgetNumber = Number.isNaN(parsedBudget) ? 0 : parsedBudget;
  updateBudgetInputDisplay(budgetNumber);
  settingsForm.elements.strategy.value = strategy;
  monthlyBudgetDisplayEl.textContent = formatCurrency(budgetNumber);
  strategyLabelEl.textContent = strategyLabels[strategy] || strategy;
  state.settings.monthlyBudget = budgetNumber;
}

async function loadDebts() {
  state.debts = await fetchJSON("/api/debts");
  await ensureMinimumBudget();
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

function calculateMinimumTotal() {
  return state.debts.reduce((sum, debt) => {
    const value = Number.parseFloat(debt.minimumPayment ?? 0);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);
}

async function ensureMinimumBudget() {
  if (!state.settings) return;

  const minimumTotal = calculateMinimumTotal();
  const normalized = Number.parseFloat(minimumTotal.toFixed(2));
  if (Number.isNaN(normalized)) {
    return;
  }

  const currentBudget = parseCurrency(state.settings.monthlyBudget);
  if (!Number.isFinite(currentBudget) || Math.abs(currentBudget - normalized) > 0.009) {
    const updated = await fetchJSON("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ monthlyBudget: normalized }),
    });
    const updatedBudget = parseCurrency(updated.monthlyBudget);
    state.settings = { ...state.settings, ...updated, monthlyBudget: updatedBudget };
    updateBudgetInputDisplay(updatedBudget);
    monthlyBudgetDisplayEl.textContent = formatCurrency(updatedBudget);
    return;
  }

  state.settings.monthlyBudget = normalized;
  if (!monthlyBudgetManuallySet) {
    updateBudgetInputDisplay(normalized);
  }
  monthlyBudgetDisplayEl.textContent = formatCurrency(normalized);
}

function renderDebts() {
  debtsTable.innerHTML = "";
  if (!state.debts.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7" class="px-3 py-4 text-center text-slate-500">No debts yet. Add your first debt to begin.</td>';
    debtsTable.appendChild(row);
    return;
  }

  let balanceSum = 0;
  let minimumSum = 0;

  state.debts.forEach((debt, index) => {
    const row = document.createElement("tr");
    row.dataset.id = debt.id;
    balanceSum += Number.parseFloat(debt.balance) || 0;
    minimumSum += Number.parseFloat(debt.minimumPayment) || 0;
    const balanceFormatted = formatBudgetInput(debt.balance);
    const aprFormatted = formatPercentInput(debt.apr);
    const paymentFormatted = formatBudgetInput(debt.minimumPayment);
    row.innerHTML = `
      <td class="px-3 py-2 font-semibold text-slate-700">${index + 1}</td>
      <td class="px-3 py-2">
        <input name="creditor" value="${debt.creditor}" class="debt-input" />
      </td>
      <td class="px-3 py-2">
        <div class="table-input">
          <span class="table-prefix">$</span>
          <input name="balance" type="text" data-format="currency" value="${balanceFormatted}" class="table-field" />
        </div>
      </td>
      <td class="px-3 py-2">
        <div class="table-input">
          <input name="apr" type="text" data-format="percent" value="${aprFormatted}" class="table-field" />
          <span class="table-suffix">%</span>
        </div>
      </td>
      <td class="px-3 py-2">
        <div class="table-input">
          <span class="table-prefix">$</span>
          <input name="minimumPayment" type="text" data-format="currency" value="${paymentFormatted}" class="table-field" />
        </div>
      </td>
      <td class="px-3 py-2">
        <input name="customPriority" type="number" step="1" min="1" value="${debt.customPriority ?? ""}" class="debt-input" />
      </td>
      <td class="px-3 py-2">
        <div class="flex flex-wrap gap-2 text-xs">
          <button type="button" class="btn-action" data-action="save">Save</button>
          <button type="button" class="btn-action" data-action="delete">Delete</button>
          <button type="button" class="btn-action" data-action="up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn-action" data-action="down" ${index === state.debts.length - 1 ? "disabled" : ""}>↓</button>
        </div>
      </td>
    `;
    debtsTable.appendChild(row);
  });

  const totalsRow = document.createElement("tr");
  totalsRow.classList.add("table-total");
  totalsRow.innerHTML = `
    <td class="px-3 py-2">—</td>
    <td class="px-3 py-2">Totals</td>
    <td class="px-3 py-2">${formatCurrency(balanceSum)}</td>
    <td class="px-3 py-2">—</td>
    <td class="px-3 py-2">${formatCurrency(minimumSum)}</td>
    <td class="px-3 py-2">—</td>
    <td class="px-3 py-2"></td>
  `;
  debtsTable.appendChild(totalsRow);
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
  const parsedBalance = parseCurrency(balance);
  const parsedApr = parsePercent(apr);
  const parsedMinimum = parseCurrency(minimumPayment);
  if (Number.isNaN(parsedBalance) || parsedBalance <= 0) {
    throw new Error("Balance must be greater than 0");
  }
  if (Number.isNaN(parsedApr) || parsedApr < 0) {
    throw new Error("APR must be zero or positive");
  }
  if (Number.isNaN(parsedMinimum) || parsedMinimum <= 0) {
    throw new Error("Minimum payment must be greater than 0");
  }
  payload.balance = Number.parseFloat(parsedBalance.toFixed(2));
  payload.apr = Number.parseFloat(parsedApr.toFixed(2));
  payload.minimumPayment = Number.parseFloat(parsedMinimum.toFixed(2));
  payload.customPriority = customPriority ? Number.parseInt(customPriority, 10) : null;
  return payload;
}

function renderSimulation() {
  if (!state.simulation) return;
  const { debts, months, totals } = state.simulation;

  const minimumPayment = totals.minimumMonthlyPayment ?? totals.minPaymentsSum;
  minPaymentsEl.textContent = formatCurrency(minimumPayment);
  initialSnowballEl.textContent = formatCurrency(totals.initialSnowball);
  totalMonthsEl.textContent = totals.totalMonths;
  totalInterestEl.textContent = formatCurrency(totals.totalInterest);
  debtsCountEl.textContent = debts.length;

  if (state.settings) {
    const { strategy, monthlyBudget } = state.settings;
    strategyLabelEl.textContent = strategyLabels[strategy] || strategy;
    monthlyBudgetDisplayEl.textContent = formatCurrency(monthlyBudget);
  }

  const debtFreeLabel = months.length ? months[months.length - 1].monthLabel : "—";
  debtFreeDateEl.textContent = debtFreeLabel;
  summaryTotalInterestEl.textContent = formatCurrency(totals.totalInterest);
  summaryDebtFreeEl.textContent = debtFreeLabel;

  const currentBalances = computeCurrentBalances(months, debts);

  summaryTable.innerHTML = "";
  if (debts.length === 0) {
    summaryTable.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-center text-slate-500">Add debts to view the payoff summary.</td></tr>';
  } else {
    debts.forEach((debt) => {
      const currentBalanceValue = currentBalances.get(debt.id) ?? parseCurrency(debt.initialBalance);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="px-3 py-2">${debt.creditor}</td>
        <td class="px-3 py-2">${formatCurrency(debt.initialBalance)}</td>
        <td class="px-3 py-2">${formatCurrency(debt.interestPaid)}</td>
        <td class="px-3 py-2">${formatCurrency(currentBalanceValue)}</td>
        <td class="px-3 py-2">${debt.monthsToPayoff}</td>
        <td class="px-3 py-2">${debt.payoffMonthLabel ?? "–"}</td>
      `;
      summaryTable.appendChild(row);
    });
  }

  renderSchedule(months, debts);
  renderChart(months);
  const balanceTrend = buildBalanceTrend(months);
  renderBalanceChart(balanceTrend.labels, balanceTrend.values);
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

  if (!state.snowballChart) {
    state.snowballChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Snowball",
            data: snowballData,
            backgroundColor: "rgba(22, 101, 52, 0.7)",
            borderRadius: 4,
            maxBarThickness: 30,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Interest",
            data: interestData,
            borderColor: "rgba(217, 119, 6, 0.9)",
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
    state.snowballChart.data.labels = labels;
    state.snowballChart.data.datasets[0].data = snowballData;
    state.snowballChart.data.datasets[1].data = interestData;
    state.snowballChart.update();
  }
}
 
function renderBalanceChart(labels, data) {
  const ctx = document.getElementById("balance-chart");
  if (!ctx) return;

  if (!state.balanceChart) {
    state.balanceChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Total Balance Remaining",
            data,
            borderColor: "rgba(30, 64, 175, 0.85)",
            backgroundColor: "rgba(30, 64, 175, 0.15)",
            borderWidth: 2,
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            ticks: {
              callback: (value) => formatCurrency(value),
            },
          },
        },
      },
    });
  } else {
    state.balanceChart.data.labels = labels;
    state.balanceChart.data.datasets[0].data = data;
    state.balanceChart.update();
  }
}

function formatMonthLabelFromISO(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function buildBalanceTrend(months) {
  const labels = [];
  const values = [];
  const initialTotal = state.debts.reduce((sum, debt) => {
    const value = parseCurrency(debt.balance ?? 0);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);

  const startLabel = formatMonthLabelFromISO(state.settings?.balanceDate) || months[0]?.monthLabel || "Start";
  labels.push(startLabel);
  values.push(Number.parseFloat(initialTotal.toFixed(2)));

  months.forEach((month) => {
    const total = Object.values(month.remainingBalances || {}).reduce((sum, value) => {
      const parsed = parseCurrency(value);
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
    labels.push(month.monthLabel);
    values.push(Number.parseFloat(total.toFixed(2)));
  });

  return { labels, values };
}

function computeCurrentBalances(months, debtsSummary) {
  const map = new Map();
  const today = new Date();
  let paymentsAppliedIndex = -1;

  const paymentDates = months.map((month) => {
    const base = new Date(month.dateISO);
    if (Number.isNaN(base.getTime())) return null;
    return new Date(base.getFullYear(), base.getMonth() + 1, 1);
  });

  paymentDates.forEach((paymentDate, idx) => {
    if (paymentDate && paymentDate <= today) {
      paymentsAppliedIndex = idx;
    }
  });

  debtsSummary.forEach((debt) => {
    const debtIdStr = String(debt.id);
    let balanceValue;
    if (paymentsAppliedIndex < 0) {
      const initial = parseCurrency(debt.initialBalance);
      balanceValue = Number.isNaN(initial) ? 0 : initial;
    } else {
      const index = Math.min(paymentsAppliedIndex, months.length - 1);
      if (index >= 0 && months[index]?.remainingBalances) {
        const snapshot = months[index].remainingBalances[debtIdStr];
        const parsed = parseCurrency(snapshot);
        balanceValue = Number.isNaN(parsed) ? 0 : parsed;
      } else {
        balanceValue = 0;
      }
    }

    if (paymentsAppliedIndex >= months.length) {
      balanceValue = 0;
    }

    map.set(debt.id, Number.parseFloat((balanceValue ?? 0).toFixed(2)));
  });

  return map;
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  const formData = new FormData(settingsForm);
  const payload = Object.fromEntries(formData.entries());
  const budgetNumber = parseCurrency(payload.monthlyBudget);
  if (Number.isNaN(budgetNumber)) {
    showNotification("Enter a valid monthly payment.");
    return;
  }
  payload.monthlyBudget = Number.parseFloat(budgetNumber.toFixed(2));
  monthlyBudgetManuallySet = true;

  try {
    await fetchJSON("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await loadSettings();
    await loadSimulation(true);
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
    await loadDebts();
    await loadSimulation(true);
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
      await loadDebts();
      await loadSimulation(true);
    } catch (error) {
      showNotification(error.message, "error");
    }
  }

  if (action === "delete") {
    if (!window.confirm("Delete this debt?")) return;
    try {
      await fetchJSON(`/api/debts/${debtId}`, { method: "DELETE" });
      await loadDebts();
      await loadSimulation(true);
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

debtsTable.addEventListener("focusin", (event) => {
  const input = event.target;
  if (!input.matches(".table-field")) return;
  const format = input.dataset.format;
  if (format === "currency") {
    const value = parseCurrency(input.value);
    input.value = Number.isNaN(value) ? "" : value.toFixed(2);
    setTimeout(() => input.select(), 0);
  } else if (format === "percent") {
    const value = parsePercent(input.value);
    input.value = Number.isNaN(value) ? "" : value.toFixed(2);
    setTimeout(() => input.select(), 0);
  }
});

debtsTable.addEventListener("focusout", (event) => {
  const input = event.target;
  if (!input.matches(".table-field")) return;
  const format = input.dataset.format;
  if (format === "currency") {
    const value = parseCurrency(input.value);
    input.value = Number.isNaN(value) ? "" : formatBudgetInput(value);
  } else if (format === "percent") {
    const value = parsePercent(input.value);
    input.value = Number.isNaN(value) ? "" : formatPercentInput(value);
  }
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.target;
    tabButtons.forEach((btn) => btn.classList.remove("is-active"));
    tabGroups.forEach((group) => {
      if (group.id === target) {
        group.classList.add("is-active");
      } else {
        group.classList.remove("is-active");
      }
    });
    button.classList.add("is-active");
  });
});

resetBudgetBtn?.addEventListener("click", async () => {
  const minimumTotal = calculateMinimumTotal();
  const normalized = Number.isNaN(minimumTotal) ? 0 : Number.parseFloat(minimumTotal.toFixed(2));
  updateBudgetInputDisplay(normalized);
  state.settings = { ...state.settings, monthlyBudget: normalized };
  monthlyBudgetDisplayEl.textContent = formatCurrency(normalized);
  try {
    const updated = await fetchJSON("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ monthlyBudget: normalized }),
    });
    if (updated?.monthlyBudget !== undefined) {
      const updatedBudget = parseCurrency(updated.monthlyBudget);
      if (!Number.isNaN(updatedBudget)) {
        state.settings.monthlyBudget = updatedBudget;
        updateBudgetInputDisplay(updatedBudget);
        monthlyBudgetDisplayEl.textContent = formatCurrency(updatedBudget);
      }
    }
    await loadSimulation(true);
  } catch (error) {
    showNotification(error.message, "error");
  }
});

settingsForm.addEventListener("submit", handleSettingsSubmit);
debtForm.addEventListener("submit", handleDebtSubmit);

monthlyBudgetInput.addEventListener("blur", () => {
  const value = parseCurrency(monthlyBudgetInput.value);
  if (Number.isNaN(value)) {
    monthlyBudgetInput.value = "";
    return;
  }
  updateBudgetInputDisplay(value);
  monthlyBudgetManuallySet = true;
});

monthlyBudgetInput.addEventListener("focus", () => {
  monthlyBudgetInput.select();
});

async function initialise() {
  try {
    await loadSettings();
    await loadDebts();
    await loadOverrides();
    await loadSimulation(false);
    monthlyBudgetManuallySet = true;
  } catch (error) {
    showNotification(error.message, "error");
  }
}

initialise();
