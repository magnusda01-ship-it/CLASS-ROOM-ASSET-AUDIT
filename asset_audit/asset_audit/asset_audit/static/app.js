const $ = (sel, root = document) => root.querySelector(sel);

async function init() {
  const res = await fetch("/api/config");
  const cfg = await res.json();

  const branch = $("#branch");
  cfg.branches.forEach((b) => {
    const o = document.createElement("option");
    o.value = b;
    o.textContent = b;
    branch.appendChild(o);
  });

  // one tab per group (Furniture, SMT, CMT, Software), each with - / + counters
  const byKey = Object.fromEntries(cfg.equipment.map((e) => [e.key, e.short || e.label]));
  const box = $("#equipment-groups");
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  tabs.setAttribute("role", "tablist");
  box.appendChild(tabs);

  cfg.groups.forEach((g, gi) => {
    const name = g.name.length <= 3 ? g.name : g.name.charAt(0) + g.name.slice(1).toLowerCase(); // FURNITURE -> Furniture, SMT stays SMT

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.dataset.tab = gi;
    tab.id = `tab-${gi}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${gi}`);
    tab.innerHTML = `<span>${name}</span><b class="tab-count"></b>`;
    tabs.appendChild(tab);

    const card = document.createElement("div");
    card.className = "group";
    card.dataset.tab = gi;
    card.id = `panel-${gi}`;
    card.setAttribute("role", "tabpanel");
    card.setAttribute("aria-labelledby", `tab-${gi}`);
    card.innerHTML =
      `<div class="group-head"><h3>${name}</h3>` +
      `<span class="sub"><b data-sub>0</b> units</span></div>` +
      `<div class="group-items">` +
      g.keys
        .map(
          (k, idx) =>
            `<div class="item"><span class="item-name">${g.numbered ? `<i class="sl">${idx + 1}</i>` : ""}${byKey[k]}</span>` +
            `<span class="stepper">` +
            `<button type="button" class="step" data-step="-1" aria-label="Decrease ${byKey[k]}">&minus;</button>` +
            `<input type="text" inputmode="numeric" value="0" data-key="${k}" aria-label="${byKey[k]}">` +
            `<button type="button" class="step" data-step="1" aria-label="Increase ${byKey[k]}">+</button>` +
            `</span></div>`
        )
        .join("") +
      `</div>`;
    box.appendChild(card);
  });
  activateTab(0);
  refresh();
}

function activateTab(i) {
  document.querySelectorAll("#equipment-groups .tab").forEach((t) => {
    const on = Number(t.dataset.tab) === i;
    t.classList.toggle("on", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
    t.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll("#equipment-groups .group").forEach((g) => {
    g.hidden = Number(g.dataset.tab) !== i;
  });
}

document.addEventListener("click", (ev) => {
  const tab = ev.target.closest("#equipment-groups .tab");
  if (tab) activateTab(Number(tab.dataset.tab));
});
document.addEventListener("keydown", (ev) => {
  const tab = ev.target.closest && ev.target.closest("#equipment-groups .tab");
  if (!tab || (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft")) return;
  const all = [...document.querySelectorAll("#equipment-groups .tab")];
  const next = (all.indexOf(tab) + (ev.key === "ArrowRight" ? 1 : all.length - 1)) % all.length;
  activateTab(next);
  all[next].focus();
});

// group subtotals, highlight of counted items, running total
function refresh() {
  let total = 0;
  document.querySelectorAll(".group").forEach((g) => {
    let sub = 0;
    g.querySelectorAll(".stepper input").forEach((i) => {
      const n = parseInt(i.value, 10) || 0;
      sub += n;
      i.classList.toggle("has", n > 0);
    });
    g.querySelector("[data-sub]").textContent = sub.toLocaleString("en-IN");
    const count = document.querySelector(`#equipment-groups .tab[data-tab="${g.dataset.tab}"] .tab-count`);
    if (count) count.textContent = sub > 0 ? sub.toLocaleString("en-IN") : "";
    total += sub;
  });
  $("#tally-total").textContent = total.toLocaleString("en-IN");
}

// - / + buttons
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".step");
  if (!btn) return;
  const input = btn.parentElement.querySelector("input");
  const n = parseInt(input.value, 10) || 0;
  input.value = Math.max(0, n + parseInt(btn.dataset.step, 10));
  input.classList.remove("invalid");
  refresh();
});

// counts: digits only, an empty box goes back to 0 when you leave it
document.addEventListener("input", (ev) => {
  if (ev.target.matches(".stepper input")) {
    ev.target.value = ev.target.value.replace(/\D/g, "").slice(0, 7);
    ev.target.classList.remove("invalid");
    refresh();
  }
});
document.addEventListener("focusout", (ev) => {
  if (ev.target.matches(".stepper input") && ev.target.value === "") {
    ev.target.value = "0";
    refresh();
  }
});
document.addEventListener("focusin", (ev) => {
  if (ev.target.matches(".stepper input")) ev.target.select();
});

function clearErrors() {
  document.querySelectorAll(".err").forEach((s) => (s.textContent = ""));
  document.querySelectorAll(".invalid").forEach((i) => i.classList.remove("invalid"));
  document.querySelectorAll(".tab.has-error").forEach((t) => t.classList.remove("has-error"));
}

function showErrors(errors) {
  Object.entries(errors).forEach(([key, msg]) => {
    document.querySelector(`.stepper input[data-key="${key}"]`)?.classList.add("invalid");
    const s = document.querySelector(`.err[data-for="${key}"]`);
    if (s) {
      s.textContent = msg;
      s.previousElementSibling?.classList.add("invalid");
    }
  });
  document.querySelectorAll(".group .invalid").forEach((i) => {
    const g = i.closest(".group");
    document.querySelector(`#equipment-groups .tab[data-tab="${g.dataset.tab}"]`)?.classList.add("has-error");
  });
  const firstGroupBad = document.querySelector(".group .invalid");
  const firstFormBad = document.querySelector(".fields .invalid");
  if (!firstFormBad && firstGroupBad) activateTab(Number(firstGroupBad.closest(".group").dataset.tab));
  (firstFormBad || firstGroupBad)?.scrollIntoView({ block: "center", behavior: "smooth" });
}

$("#audit-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearErrors();
  const form = ev.target;
  const msg = $("#form-msg");
  msg.className = "msg";
  msg.textContent = "";

  const counts = {};
  document.querySelectorAll("[data-key]").forEach((i) => (counts[i.dataset.key] = i.value));

  const payload = {
    branch: form.branch.value,
    classroom_count: form.classroom_count.value,
    hof_name: form.hof_name.value,
    hof_contact: form.hof_contact.value,
    counts,
    lab_assets: form.lab_assets.value,
    suggestions: form.suggestions.value,
  };

  const btn = $("#submit-btn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showErrors(data.errors || {});
      msg.className = "msg bad";
      msg.textContent = "Some fields need fixing. They are highlighted.";
    } else {
      form.reset();
      msg.className = "msg ok";
      msg.textContent = "Report submitted. Thank you.";
    }
  } catch (e) {
    msg.className = "msg bad";
    msg.textContent = "Could not reach the server. Check the connection and try again.";
  } finally {
    btn.disabled = false;
  }
});

$("#audit-form").addEventListener("reset", () => {
  clearErrors();
  $("#form-msg").textContent = "";
  setTimeout(refresh, 0); // after the browser has put the 0s back
});

init();