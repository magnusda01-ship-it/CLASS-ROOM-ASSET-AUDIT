const $ = (sel) => document.querySelector(sel);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
          "<th>Lab assets</th><th>Suggestions</th><th>Submitted</th></tr></thead><tbody>";
  let any = false;
  r.branches.forEach((b) => {
    const x = r.details[b];
    if (!x) return;
    any = true;
    d += `<tr><td>${esc(b)}</td><td class="num">${x.classroom_count}</td><td>${esc(x.hof_name)}</td>` +
         `<td class="num">${esc(x.hof_contact)}</td><td>${esc(x.lab_assets)}</td>` +
         `<td>${esc(x.suggestions)}</td><td class="num">${esc(x.submitted)}</td></tr>`;
  });
  if (!any) d += '<tr><td colspan="7" class="empty">No reports yet. They appear here as soon as a branch submits the form.</td></tr>';
  d += "</tbody>";
  $("#details").innerHTML = d;

  setUpdated("Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), false);
}

$("#refresh").addEventListener("click", load);
$("#print").addEventListener("click", () => window.print());

load();
setInterval(load, 30000); // keep the admin window fresh