const $ = (sel) => document.querySelector(sel);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function load() {
  const res = await fetch("/api/report");
  if (!res.ok) {
    $("#status").textContent = "Could not load the report (" + res.status + ")";
    return;
  }
  const r = await res.json();

  const pending = r.branches.filter((b) => !r.details[b]);
  $("#status").textContent =
    `${r.submitted_count} of ${r.branches.length} branches submitted` +
    (pending.length ? ` · Pending: ${pending.join(", ")}` : " · All branches done");

  // ----- main table: equipment rows x branch columns + TOTAL row -----
  let h = "<thead><tr><th>Equipments</th>";
  r.branches.forEach((b) => (h += `<th>${esc(b)}</th>`));
  h += "</tr></thead><tbody>";

  const totals = Object.fromEntries(r.branches.map((b) => [b, 0]));
  r.equipment.forEach((e) => {
    h += `<tr><th>${esc(e.label)}</th>`;
    r.branches.forEach((b) => {
      const v = r.matrix[e.key][b];
      if (v === null || v === undefined) {
        h += "<td></td>";
      } else {
        h += `<td>${v}</td>`;
        totals[b] += v;
      }
    });
    h += "</tr>";
  });

  h += '<tr class="total"><th>TOTAL</th>';
  r.branches.forEach((b) => {
    h += `<td>${r.details[b] ? totals[b] : ""}</td>`;
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
    d += `<tr><td>${esc(b)}</td><td>${x.classroom_count}</td><td>${esc(x.hof_name)}</td>` +
         `<td>${esc(x.hof_contact)}</td><td>${esc(x.lab_assets)}</td>` +
         `<td>${esc(x.suggestions)}</td><td>${esc(x.submitted)}</td></tr>`;
  });
  if (!any) d += '<tr><td colspan="7">No submissions yet.</td></tr>';
  d += "</tbody>";
  $("#details").innerHTML = d;
}

$("#refresh").addEventListener("click", load);
$("#print").addEventListener("click", () => window.print());

load();
setInterval(load, 30000); // keep the admin window fresh
