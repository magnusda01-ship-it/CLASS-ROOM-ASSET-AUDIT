const $ = (sel) => document.querySelector(sel);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let editSubmissionId = null;
let currentReport = null;

function setUpdated(text, bad) {
  const u = $("#updated");
  u.textContent = text;
  u.classList.toggle("bad", !!bad);
}

async function load() {
  let res;
  try {
    res = await fetch("/api/report");
  } catch (e) {
    setUpdated("Could not reach the server. Press Refresh to try again.", true);
    return;
  }
  if (!res.ok) {
    setUpdated(`Could not load the report (error ${res.status}). Press Refresh to try again.`, true);
    return;
  }
  const r = await res.json();
  currentReport = r;

  // ----- branch progress -----
  const n = r.branches.length;
  const done = r.submitted_count;
  $("#count").textContent = done;
  $("#of").textContent = n;
  $("#fill").style.width = (n ? (done / n) * 100 : 0) + "%";
  $("#track").setAttribute("aria-valuenow", Math.round(n ? (done / n) * 100 : 0));

  const pending = r.branches.filter((b) => !r.details[b]);
  $("#pending").innerHTML = pending.length
    ? '<span class="p-label">Waiting for</span>' + pending.map((b) => `<span class="chip">${esc(b)}</span>`).join("")
    : '<span class="all-done">All branches have submitted.</span>';

  // ----- equipment matrix: equipment rows x branch columns + TOTAL row -----
  let h = "<thead><tr><th>Equipments</th>";
  r.branches.forEach((b) => {
    h += `<th class="${r.details[b] ? "done" : ""}"><i class="dot"></i>${esc(b)}</th>`;
  });
  h += "</tr></thead><tbody>";

  const totals = Object.fromEntries(r.branches.map((b) => [b, 0]));
  r.equipment.forEach((e) => {
    h += `<tr><th scope="row">${esc(e.label)}</th>`;
    r.branches.forEach((b) => {
      const v = r.matrix[e.key][b];
      if (v === null || v === undefined) {
        h += '<td class="pend"></td>';
      } else {
        h += `<td class="${v === 0 ? "zero" : ""}">${v}</td>`;
        totals[b] += v;
      }
    });
    h += "</tr>";
  });

  h += '<tr class="total"><th scope="row">TOTAL</th>';
  r.branches.forEach((b) => {
    h += `<td>${r.details[b] ? totals[b].toLocaleString("en-IN") : ""}</td>`;
  });
  h += "</tr></tbody>";
  $("#sheet").innerHTML = h;

  // ----- branch details -----
  let d = "<thead><tr><th>Branch</th><th>Class rooms</th><th>HOF</th><th>Contact</th>" +
          "<th>Lab assets</th><th>Suggestions</th><th>Submitted</th><th>Action</th></tr></thead><tbody>";
  let any = false;
  r.branches.forEach((b) => {
    const x = r.details[b];
    if (!x) return;
    any = true;
    d += `<tr><td>${esc(b)}</td><td class="num">${x.classroom_count}</td><td>${esc(x.hof_name)}</td>` +
         `<td class="num">${esc(x.hof_contact)}</td><td>${esc(x.lab_assets)}</td>` +
         `<td>${esc(x.suggestions)}</td><td class="num">${esc(x.submitted)}</td>` +
         `<td><button type="button" class="edit-button table-edit" data-edit-id="${x.id}" data-branch="${esc(b)}">Edit</button></td></tr>`;
  });
  if (!any) d += '<tr><td colspan="8" class="empty">No reports yet. They appear here as soon as a branch submits the form.</td></tr>';
  d += "</tbody>";
  $("#details").innerHTML = d;

  setUpdated("Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), false);
}

async function initializeEditor() {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error(`Could not load edit form options (error ${res.status}).`);
  const config = await res.json();

  $("#edit-branch").innerHTML = config.branches
    .map((branch) => `<option value="${esc(branch)}">${esc(branch)}</option>`)
    .join("");
  $("#edit-equipment").innerHTML = config.equipment
    .map((item) => `<label>${esc(item.label)}<input type="number" min="0" step="1" data-edit-key="${esc(item.key)}" required></label>`)
    .join("");
}

function openEditor(submissionId, branch) {
  const details = currentReport?.details?.[branch];
  if (!details || details.id !== submissionId) {
    setUpdated("This report changed. Refresh the page and try again.", true);
    return;
  }

  editSubmissionId = submissionId;
  const form = $("#edit-form");
  form.elements.branch.value = branch;
  form.elements.classroom_count.value = details.classroom_count;
  form.elements.hof_name.value = details.hof_name;
  form.elements.hof_contact.value = details.hof_contact;
  form.elements.lab_assets.value = details.lab_assets || "";
  form.elements.suggestions.value = details.suggestions || "";
  $("#edit-equipment").querySelectorAll("[data-edit-key]").forEach((input) => {
    input.value = details.counts[input.dataset.editKey] ?? 0;
  });
  $("#edit-status").textContent = "";
  $("#edit-dialog").showModal();
}

$("#refresh").addEventListener("click", load);
$("#print").addEventListener("click", () => window.print());

$("#details").addEventListener("click", (ev) => {
  const button = ev.target.closest("[data-edit-id]");
  if (!button) return;
  openEditor(Number(button.dataset.editId), button.dataset.branch);
});

$("#edit-close").addEventListener("click", () => $("#edit-dialog").close());
$("#edit-cancel").addEventListener("click", () => $("#edit-dialog").close());

$("#edit-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.currentTarget;
  const saveButton = form.querySelector('button[type="submit"]');
  const status = $("#edit-status");
  const counts = {};
  $("#edit-equipment").querySelectorAll("[data-edit-key]").forEach((input) => {
    counts[input.dataset.editKey] = input.value;
  });
  const payload = {
    branch: form.elements.branch.value,
    classroom_count: form.elements.classroom_count.value,
    hof_name: form.elements.hof_name.value,
    hof_contact: form.elements.hof_contact.value,
    counts,
    lab_assets: form.elements.lab_assets.value,
    suggestions: form.elements.suggestions.value,
  };

  saveButton.disabled = true;
  status.className = "edit-status";
  status.textContent = "";
  try {
    const res = await fetch(`/api/submissions/${editSubmissionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const errors = Object.values(data.errors || {});
      status.classList.add("bad");
      status.textContent = data.message || errors.join(" ") || `Could not save changes (error ${res.status}).`;
      return;
    }
    $("#edit-dialog").close();
    await load();
  } catch (e) {
    status.classList.add("bad");
    status.textContent = "Could not reach the server. Check the connection and try again.";
  } finally {
    saveButton.disabled = false;
  }
});

async function start() {
  try {
    await initializeEditor();
    await load();
    setInterval(load, 30000); // keep the admin window fresh
  } catch (e) {
    setUpdated(e.message || "Could not initialize the admin view.", true);
  }
}

start();