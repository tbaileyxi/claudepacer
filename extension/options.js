const STORAGE_KEY = "claudepacer_settings";

const defaults = {
  weeklyLimit: 100_000,
  alert70: true,
  alert90: true,
  showBadge: true,
  weekStart: 1,
};

async function load() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (r) => {
      resolve({ ...defaults, ...(r[STORAGE_KEY] || {}) });
    });
  });
}

async function save(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: settings }, resolve);
  });
}

function toggleEl(id, value) {
  const el = document.getElementById(id);
  el.classList.toggle("on", value);
  el.setAttribute("aria-pressed", String(value));
  return el;
}

function highlightPlanBtn(limit) {
  document.querySelectorAll(".plan-btn").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.limit) === limit);
  });
}

async function init() {
  const settings = await load();

  document.getElementById("weekly-limit").value = settings.weeklyLimit;
  document.getElementById("week-start").value = String(settings.weekStart);
  toggleEl("toggle-70", settings.alert70);
  toggleEl("toggle-90", settings.alert90);
  toggleEl("toggle-badge", settings.showBadge);

  // Plan preset buttons
  highlightPlanBtn(settings.weeklyLimit);
  document.querySelectorAll(".plan-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const limit = parseInt(btn.dataset.limit);
      settings.weeklyLimit = limit;
      document.getElementById("weekly-limit").value = limit;
      highlightPlanBtn(limit);
    });
  });

  // Keep plan buttons in sync when user types manually
  document.getElementById("weekly-limit").addEventListener("input", (e) => {
    highlightPlanBtn(parseInt(e.target.value));
  });

  // Toggle click handlers
  for (const [id, key] of [
    ["toggle-70", "alert70"],
    ["toggle-90", "alert90"],
    ["toggle-badge", "showBadge"],
  ]) {
    document.getElementById(id).addEventListener("click", function () {
      const next = !this.classList.contains("on");
      this.classList.toggle("on", next);
      this.setAttribute("aria-pressed", String(next));
      settings[key] = next;
    });
  }

  // Save
  document.getElementById("btn-save").addEventListener("click", async () => {
    settings.weeklyLimit = parseInt(document.getElementById("weekly-limit").value, 10) || 1_000_000;
    settings.weekStart   = parseInt(document.getElementById("week-start").value, 10);

    await save(settings);

    // Sync limit + week start to background data
    chrome.runtime.sendMessage({ type: "SET_LIMIT", limit: settings.weeklyLimit, weekStart: settings.weekStart });

    const msg = document.getElementById("saved-msg");
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 2000);
  });

  // Pro mode toggle (testing)
  const STORAGE_KEY_DATA = "claudepacer_data";
  const proBtn    = document.getElementById("btn-toggle-pro");
  const proStatus = document.getElementById("pro-status");

  function refreshProStatus() {
    chrome.storage.local.get(STORAGE_KEY_DATA, (r) => {
      const isPaid = r[STORAGE_KEY_DATA]?.isPaid || false;
      proBtn.textContent = isPaid ? "Disable Pro Mode" : "Enable Pro Mode (test)";
      proBtn.style.background = isPaid ? "#22C55E" : "#D97757";
      proStatus.textContent = isPaid ? "✅ Pro is active — reload the side panel to see changes" : "Free tier";
    });
  }

  refreshProStatus();

  proBtn.addEventListener("click", () => {
    chrome.storage.local.get(STORAGE_KEY_DATA, (r) => {
      const data   = r[STORAGE_KEY_DATA] || {};
      data.isPaid  = !data.isPaid;
      chrome.storage.local.set({ [STORAGE_KEY_DATA]: data }, refreshProStatus);
    });
  });

  // Reset all
  document.getElementById("btn-reset-all").addEventListener("click", () => {
    if (!confirm("Delete all ClaudePacer usage data? This cannot be undone.")) return;
    chrome.storage.local.clear(() => {
      alert("All data cleared. Settings reset to defaults.");
      location.reload();
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
