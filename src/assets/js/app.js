import { dashboard, projects } from "./data/mock-data.js";
import { financialAdvance, formatCop, paymentPending, safePercent } from "./domain/financial.js";
import { isDemoMode, signIn, signOut } from "./services/supabase.js";

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const dashboardView = document.querySelector("#dashboardView");
const detailView = document.querySelector("#detailView");
const placeholderView = document.querySelector("#placeholderView");
const title = document.querySelector("#pageTitle");
const breadcrumb = document.querySelector("#breadcrumb");

const viewLabels = {
  dashboard: "Resumen general",
  projects: "Proyectos",
  monthly: "Seguimiento mensual",
  finance: "Facturación y pagos",
  costs: "Costos y gastos",
  reports: "Reportes",
  admin: "Administración",
  detail: "Proyecto Solar Demostrativo"
};

function openApp() {
  loginView.hidden = true;
  appView.hidden = false;
  renderDashboard();
  showView("dashboard");
}

function closeApp() {
  appView.hidden = true;
  loginView.hidden = false;
  document.querySelector("#loginForm").reset();
}

function showView(view) {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view || (view === "detail" && button.dataset.view === "projects"));
  });
  dashboardView.hidden = view !== "dashboard";
  detailView.hidden = view !== "detail";
  placeholderView.hidden = view === "dashboard" || view === "detail";
  title.textContent = viewLabels[view] ?? "Control Solar Demo";
  breadcrumb.textContent = view === "detail" ? "PROYECTOS / DETALLE" : (viewLabels[view] ?? view).toUpperCase();
  if (!placeholderView.hidden) document.querySelector("#placeholderTitle").textContent = `${viewLabels[view]} preparado`;
  history.replaceState({}, "", `#${view}`);
}

function renderDashboard() {
  document.querySelector("#contractValue").textContent = formatCop(dashboard.contractValue);
  document.querySelector("#invoicedValue").textContent = formatCop(dashboard.invoiced);
  document.querySelector("#paidValue").textContent = formatCop(dashboard.paid);
  document.querySelector("#costValue").textContent = formatCop(dashboard.costs);
  document.querySelector("#receivableValue").textContent = `${formatCop(paymentPending(dashboard.invoiced, dashboard.paid))} por cobrar`;
  document.querySelector("#costRatio").textContent = `${safePercent(dashboard.costs, dashboard.contractValue).toFixed(1).replace(".", ",")} % del contrato`;

  document.querySelector("#projectRows").innerHTML = projects.map((project) => `
    <tr>
      <td>${project.costCenter}</td><td><strong>${project.name}</strong></td><td>${project.city}</td>
      <td>${project.advance} %</td><td>${formatCop(project.balance)}</td>
      <td><button class="open-project" data-view="detail">Abrir</button></td>
    </tr>`).join("");

  renderChart();
}

function renderChart() {
  const canvas = document.querySelector("#monthlyChart");
  const fallback = document.querySelector("#chartFallback");
  if (!window.Chart) {
    canvas.hidden = true;
    fallback.style.display = "flex";
    fallback.innerHTML = dashboard.months.map((month, index) => `
      <div class="month">
        <span style="height:${dashboard.monthlyInvoiced[index] / 18}%;background:#337fbc"></span>
        <span style="height:${dashboard.monthlyPaid[index] / 18}%;background:#2f8f59"></span>
        <span style="height:${dashboard.monthlyCosts[index] / 18}%;background:#edaf25"></span>
        <label>${month}</label>
      </div>`).join("");
    return;
  }
  if (canvas.dataset.ready === "true") return;
  new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: dashboard.months,
      datasets: [
        { label: "Facturación", data: dashboard.monthlyInvoiced, backgroundColor: "#337fbc", borderRadius: 4 },
        { label: "Pagos", data: dashboard.monthlyPaid, backgroundColor: "#2f8f59", borderRadius: 4 },
        { label: "Costos", data: dashboard.monthlyCosts, backgroundColor: "#edaf25", borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7 } } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: (value) => `$${value} M` }, grid: { color: "#edf2f6" } }
      }
    }
  });
  canvas.dataset.ready = "true";
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const message = document.querySelector("#loginMessage");
  if (!email || !password) {
    message.textContent = "Completa el correo y la contraseña.";
    return;
  }
  try {
    message.textContent = "Validando acceso…";
    await signIn(email, password);
    message.textContent = "";
    openApp();
  } catch (error) {
    message.textContent = error.message || "No fue posible iniciar sesión.";
  }
});

document.querySelector("#demoAccess").addEventListener("click", openApp);
document.querySelector("#logoutButton").addEventListener("click", async () => { await signOut(); closeApp(); });
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-view]");
  if (target) showView(target.dataset.view);
});

if (new URLSearchParams(location.search).get("demo") === "1" || (isDemoMode() && location.hash === "#dashboard")) openApp();

