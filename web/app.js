const data = window.APP_DATA;

const content = document.getElementById("content");
const mainTabs = document.getElementById("main-tabs");
const participantTabs = document.getElementById("participant-tabs");

function badgeClass(status) {
  return `badge ${status || "ventar"}`;
}

function formatUpdated(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return `Sist bygd: ${date.toLocaleString("nb-NO")}`;
}

function totalGroupPlayed() {
  if (!data.participants.length) return { played: 0, total: 0 };
  const first = data.participants[0].scores;
  return { played: first.groupPlayed, total: first.groupTotal };
}

function renderHeader() {
  document.getElementById("page-title").textContent = data.meta.title;
  document.getElementById("updated-at").textContent = formatUpdated(data.meta.updated);
  const progress = totalGroupPlayed();
  document.getElementById("progress-box").innerHTML = `
    <span>Gruppespel ferdig</span>
    <strong>${progress.played} / ${progress.total}</strong>
  `;
}

function renderParticipantTabs() {
  participantTabs.innerHTML = data.participants
    .map(
      (p) =>
        `<button class="tab" data-tab="participant" data-name="${p.name}">${p.name} (${p.scores.total}p)</button>`
    )
    .join("");
}

function standingPanel() {
  const rows = data.participants
    .map((p, index) => {
      const rank = index + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : "";
      return `
        <tr class="clickable ${rankClass}" data-jump="${p.name}">
          <td class="num">${rank}</td>
          <td><strong>${p.name}</strong></td>
          <td class="num">${p.scores.group}</td>
          <td class="num">${p.scores.knockout}</td>
          <td class="num">${p.scores.bonus}</td>
          <td class="num"><strong>${p.scores.total}</strong></td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="panel active" id="panel-standing">
      <div class="card">
        <h2>Standing</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="num">Plass</th>
                <th>Deltakar</th>
                <th class="num">Gruppespel</th>
                <th class="num">Sluttspel</th>
                <th class="num">Bonus</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function fasitPanel() {
  const groupRows = data.fasit.groupMatches
    .map(
      (m) => `
      <tr>
        <td>${m.date}</td>
        <td>${m.group}</td>
        <td>${m.match}</td>
        <td>${m.played ? m.result : '<span class="badge ventar">Ikkje spela</span>'}</td>
      </tr>
    `
    )
    .join("");

  const knockout = data.fasit.knockout
    .map(
      (round) => `
      <div class="knockout-card">
        <h3>${round.label}</h3>
        <ol>
          ${round.teams.map((t) => `<li>${t.team}</li>`).join("")}
        </ol>
      </div>
    `
    )
    .join("");

  const bonusRows = data.fasit.bonus
    .map(
      (b) => `
      <tr>
        <td>${b.question}</td>
        <td>${b.answer}</td>
        <td>${b.numeric ?? "—"}</td>
      </tr>
    `
    )
    .join("");

  return `
    <section class="panel" id="panel-fasit">
      <div class="card">
        <h2>Gruppespel – fasit</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dato</th>
                <th>Gruppe</th>
                <th>Kamp</th>
                <th>Resultat</th>
              </tr>
            </thead>
            <tbody>${groupRows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>Sluttspel – fasit</h2>
        <div class="knockout-grid">${knockout}</div>
      </div>

      <div class="card">
        <h2>Bonus – fasit</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Spørsmål</th>
                <th>Svar</th>
                <th>Tal</th>
              </tr>
            </thead>
            <tbody>${bonusRows}</tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function participantPanel(p) {
  const groupRows = p.groupMatches
    .map(
      (m) => `
      <tr>
        <td>${m.date}</td>
        <td>${m.group}</td>
        <td>${m.match}</td>
        <td>${m.guess}</td>
        <td>${m.answer}</td>
        <td><span class="${badgeClass(m.status)}">${m.utfall}</span></td>
        <td class="num">${m.points}</td>
      </tr>
    `
    )
    .join("");

  const knockoutByRound = {};
  p.knockout.forEach((row) => {
    if (!knockoutByRound[row.roundLabel]) knockoutByRound[row.roundLabel] = [];
    knockoutByRound[row.roundLabel].push(row);
  });

  const knockoutHtml = Object.entries(knockoutByRound)
    .map(([label, rows]) => {
      const tableRows = rows
        .map(
          (r) => `
          <tr>
            <td class="num">${r.slot}</td>
            <td>${r.guess}</td>
            <td>${r.answer}</td>
            <td><span class="${badgeClass(r.status)}">${r.utfall}</span></td>
            <td class="num">${r.points}</td>
          </tr>
        `
        )
        .join("");
      return `
        <div class="card">
          <h2>${label}</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="num">Plass</th>
                  <th>Tips</th>
                  <th>Fasit</th>
                  <th>Utfall</th>
                  <th class="num">Poeng</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      `;
    })
    .join("");

  const bonusRows = p.bonus
    .map(
      (b) => `
      <tr>
        <td>${b.question}</td>
        <td>${b.guess}</td>
        <td>${b.answer}</td>
        <td><span class="${badgeClass(b.status)}">${b.utfall}</span></td>
        <td class="num">${b.points}</td>
      </tr>
    `
    )
    .join("");

  return `
    <section class="panel" id="panel-${p.name}">
      <div class="card">
        <h2>${p.name} – oversikt</h2>
        <div class="summary-grid">
          <div class="summary-item"><span>Gruppespel</span><strong>${p.scores.group}p</strong></div>
          <div class="summary-item"><span>Sluttspel</span><strong>${p.scores.knockout}p</strong></div>
          <div class="summary-item"><span>Bonus</span><strong>${p.scores.bonus}p</strong></div>
          <div class="summary-item"><span>Total</span><strong>${p.scores.total}p</strong></div>
        </div>
      </div>

      <div class="card">
        <h2>Gruppespel</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dato</th>
                <th>Gruppe</th>
                <th>Kamp</th>
                <th>Tips</th>
                <th>Fasit</th>
                <th>Utfall</th>
                <th class="num">Poeng</th>
              </tr>
            </thead>
            <tbody>${groupRows}</tbody>
          </table>
        </div>
      </div>

      ${knockoutHtml}

      <div class="card">
        <h2>Bonus</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Spørsmål</th>
                <th>Tips</th>
                <th>Fasit</th>
                <th>Utfall</th>
                <th class="num">Poeng</th>
              </tr>
            </thead>
            <tbody>${bonusRows}</tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function renderContent() {
  const participantPanels = data.participants.map(participantPanel).join("");
  content.innerHTML = standingPanel() + fasitPanel() + participantPanels;
}

function activateTab(tabName, participantName = null) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const isMain = tab.parentElement === mainTabs;
    const isParticipant = tab.parentElement === participantTabs;
    if (isMain) {
      tab.classList.toggle("active", tab.dataset.tab === tabName && !participantName);
    }
    if (isParticipant) {
      tab.classList.toggle("active", tab.dataset.name === participantName);
    }
  });

  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));

  if (participantName) {
    const panel = document.getElementById(`panel-${participantName}`);
    if (panel) panel.classList.add("active");
    return;
  }

  const panel = document.getElementById(`panel-${tabName}`);
  if (panel) panel.classList.add("active");
}

function bindEvents() {
  mainTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".tab");
    if (!button) return;
    activateTab(button.dataset.tab);
  });

  participantTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".tab");
    if (!button) return;
    activateTab("participant", button.dataset.name);
  });

  content.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-jump]");
    if (!row) return;
    activateTab("participant", row.dataset.jump);
  });
}

renderHeader();
renderParticipantTabs();
renderContent();
bindEvents();
