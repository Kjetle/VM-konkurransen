const data = window.APP_DATA;

const content = document.getElementById("content");
const mainTabs = document.getElementById("main-tabs");
const participantTabs = document.getElementById("participant-tabs");

const CHART_COLORS = [
  "#3d8bfd", "#2ecc71", "#f1c40f", "#e74c3c", "#9b59b6",
  "#1abc9c", "#e67e22", "#3498db", "#95a5a6", "#ff6b9d",
  "#ffd700", "#6c7a89",
];

let trendMode = "rank";
let standingView = "table";

function badgeClass(status) {
  return `badge ${status || "ventar"}`;
}

function formatUpdated(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return `Sist bygd: ${date.toLocaleString("nb-NO")}`;
}

function formatDayLabel(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function totalGroupPlayed() {
  if (!data.participants.length) return { played: 0, total: 0 };
  const first = data.participants[0].scores;
  return { played: first.groupPlayed, total: first.groupTotal };
}

function matchDays() {
  return data.meta.history?.matchDays || [];
}

function participantHistory(name) {
  return data.meta.history?.participants?.[name] || null;
}

function enrichedParticipants() {
  return data.participants.map((p) => {
    const hist = participantHistory(p.name);
    return {
      ...p,
      history: hist
        ? {
            totals: hist.totals,
            ranks: hist.ranks,
            dayPoints: hist.dayPoints,
          }
        : { totals: [p.scores.total], ranks: [1], dayPoints: [p.scores.total] },
      exact: hist?.exact ?? 0,
      outcomes: hist?.outcomes ?? 0,
      streak: hist?.streak ?? 0,
      recentPoints: hist?.recentPoints ?? [],
    };
  });
}

function rankChange(prev, current) {
  if (prev == null || current == null) return { cls: "same", arrow: "—", delta: "" };
  const delta = prev - current;
  if (delta > 0) return { cls: "up", arrow: "↑", delta: `+${delta}` };
  if (delta < 0) return { cls: "down", arrow: "↓", delta: `${delta}` };
  return { cls: "same", arrow: "—", delta: "" };
}

function lastDayPoints(p) {
  const pts = p.history.dayPoints;
  if (!pts.length) return 0;
  return pts[pts.length - 1];
}

function sparklineColorFromRanks(ranks) {
  if (ranks.length < 2) return "var(--gray)";
  const change = rankChange(ranks[ranks.length - 2], ranks[ranks.length - 1]);
  if (change.cls === "up") return "var(--green)";
  if (change.cls === "down") return "var(--red)";
  return "var(--gray)";
}

function trendColor(values, invert) {
  const last = values[values.length - 1];
  const first = values[0];
  const same = last === first;
  if (same) return "var(--gray)";
  const improved = invert ? last < first : last > first;
  return improved ? "var(--green)" : "var(--red)";
}

function renderSparkline(values, { scale = "value", maxRank, w = 56, h = 22, color = null, title = "" } = {}) {
  if (!values.length) return "";
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const strokeColor = color ?? trendColor(values, scale === "rank");
  const rankMax = maxRank ?? data.participants.length;
  const rankSpan = Math.max(rankMax - 1, 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = scale === "rank"
      ? pad + ((v - 1) / rankSpan) * (h - pad * 2)
      : pad + (1 - (v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastPt = points[points.length - 1].split(",");
  const aria = title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"';
  return `
    <svg class="sparkline" viewBox="0 0 ${w} ${h}"${aria}${title ? ` title="${title}"` : ""}>
      <polyline fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        points="${points.join(" ")}"/>
      <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="2" fill="${strokeColor}"/>
    </svg>
  `;
}

function renderFullChart(participants, mode) {
  const days = matchDays();
  const isRank = mode === "rank";
  const w = 720;
  const h = 320;
  const padL = 44;
  const padR = 16;
  const padT = 20;
  const padB = 36;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const n = days.length || 1;
  const maxRank = participants.length;

  let yMin;
  let yMax;
  if (isRank) {
    yMin = 1;
    yMax = maxRank;
  } else {
    yMin = 0;
    yMax = Math.max(...participants.flatMap((p) => p.history.totals), 1);
  }

  const ySpan = yMax - yMin || 1;
  const xStep = n > 1 ? chartW / (n - 1) : chartW;

  function toY(v) {
    if (isRank) return padT + ((v - yMin) / ySpan) * chartH;
    return padT + chartH - ((v - yMin) / ySpan) * chartH;
  }

  function toX(i) {
    return padL + i * xStep;
  }

  const gridLines = isRank
    ? [1, Math.ceil(maxRank / 2), maxRank].map((v) => {
        const y = toY(v);
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="4 4"/>`;
      }).join("")
    : [0, Math.round(yMax / 2), yMax].filter((v, i, arr) => i === 0 || v !== arr[i - 1]).map((v) => {
        const y = toY(v);
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="4 4"/>`;
      }).join("");

  const yLabels = isRank
    ? [1, Math.ceil(maxRank / 2), maxRank].map((v) =>
        `<text x="${padL - 8}" y="${toY(v) + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${v}</text>`
      ).join("")
    : [0, Math.round(yMax / 2), yMax].filter((v, i, arr) => i === 0 || v !== arr[i - 1]).map((v) =>
        `<text x="${padL - 8}" y="${toY(v) + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${v}</text>`
      ).join("");

  const xLabels = days.map((d, i) =>
    `<text x="${toX(i)}" y="${h - 8}" text-anchor="middle" fill="var(--muted)" font-size="10">${formatDayLabel(d)}</text>`
  ).join("");

  const lines = participants.map((p, idx) => {
    const series = isRank ? p.history.ranks : p.history.totals;
    const pts = series.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts}" opacity="0.9"/>`;
  }).join("");

  const dots = participants.map((p, idx) => {
    const series = isRank ? p.history.ranks : p.history.totals;
    const last = series[series.length - 1];
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return `<circle cx="${toX(n - 1)}" cy="${toY(last)}" r="3.5" fill="${color}"/>`;
  }).join("");

  const yTitle = isRank ? "Plassering (1 = best)" : "Totalpoeng";

  return `
    <svg class="trend-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Trendgraf ${isRank ? "plassering" : "poeng"}">
      ${gridLines}
      ${yLabels}
      ${xLabels}
      ${lines}
      ${dots}
      <text x="${padL}" y="14" fill="var(--muted)" font-size="11">${yTitle}</text>
    </svg>
  `;
}

function factLeaders(participants, valueFn, direction = "max") {
  if (!participants.length) return { leaders: [], value: 0 };
  const values = participants.map(valueFn);
  const target = direction === "max" ? Math.max(...values) : Math.min(...values);
  const leaders = participants.filter((p) => valueFn(p) === target);
  return { leaders, value: target };
}

function leaderNames(leaders) {
  return leaders.map((p) => p.name).join(", ");
}

function computeFacts(participants) {
  const withDay = participants.map((p) => ({ ...p, dayPts: lastDayPoints(p) }));
  return {
    inForm: factLeaders(withDay, (p) => p.dayPts, "max"),
    outOfForm: factLeaders(withDay, (p) => p.dayPts, "min"),
    bestOdds: factLeaders(participants, (p) => p.outcomes, "max"),
    mostExact: factLeaders(participants, (p) => p.exact, "max"),
    bestStreak: factLeaders(participants, (p) => p.streak, "max"),
  };
}

function rankChangeLabel() {
  const days = matchDays();
  if (days.length < 2) return "Plassering";
  return `Plassering ${formatDayLabel(days[days.length - 2])} → ${formatDayLabel(days[days.length - 1])}`;
}

function renderFactsSidebar(facts) {
  const days = matchDays();
  const prevDay = days.length >= 2 ? formatDayLabel(days[days.length - 2]) : "førre";
  return `
    <aside class="facts-sidebar">
      <div class="fact-card highlight">
        <h3>Dagens vinnar</h3>
        <div class="fact-value">${leaderNames(facts.inForm.leaders)} +${facts.inForm.value}p</div>
        <div class="fact-detail">Mest poeng sidan ${prevDay}</div>
      </div>
      <div class="fact-card">
        <h3>Ute av form</h3>
        <div class="fact-value">${leaderNames(facts.outOfForm.leaders)}</div>
        <div class="fact-detail">+${facts.outOfForm.value}p siste kampdag</div>
      </div>
      <div class="fact-card">
        <h3>Best på oddsen</h3>
        <div class="fact-value">${leaderNames(facts.bestOdds.leaders)}</div>
        <div class="fact-detail">${facts.bestOdds.value} rette tips i gruppespel</div>
      </div>
      <div class="fact-card">
        <h3>Flest rette resultat</h3>
        <div class="fact-value">${leaderNames(facts.mostExact.leaders)}</div>
        <div class="fact-detail">${facts.mostExact.value} rette resultat (25p)</div>
      </div>
      <div class="fact-card">
        <h3>Streak</h3>
        <div class="fact-value">${leaderNames(facts.bestStreak.leaders)}</div>
        <div class="fact-detail">${facts.bestStreak.value} kampar på rad med poeng</div>
      </div>
    </aside>
  `;
}

function renderDetailRow(p, index) {
  const days = matchDays();
  const lastDay = days[days.length - 1];
  const recent = p.recentPoints.filter((r) => r.points > 0);
  const recentHtml = recent.length
    ? recent.map((r) =>
        `<li><span>${r.match} <span class="badge ${r.points >= 25 ? "rett" : "delvis"}">${r.label}</span></span><strong>+${r.points}p</strong></li>`
      ).join("")
    : `<li><span>Ingen poeng siste kampdag</span></li>`;

  return `
    <tr class="detail-row hidden" id="detail-${index}">
      <td colspan="9">
        <div class="detail-panel">
          <div class="detail-grid">
            <div class="detail-stat"><span>Gruppespel</span><strong>${p.scores.group}p</strong></div>
            <div class="detail-stat"><span>Sluttspel</span><strong>${p.scores.knockout}p</strong></div>
            <div class="detail-stat"><span>Bonus</span><strong>${p.scores.bonus}p</strong></div>
            <div class="detail-stat"><span>Siste kampdag</span><strong>+${lastDayPoints(p)}p</strong></div>
          </div>
          <div class="detail-recent">
            <h4>Poeng siste kampdag${lastDay ? ` (${formatDayLabel(lastDay)})` : ""}</h4>
            <ul>${recentHtml}</ul>
          </div>
          <p class="detail-hint">Klikk på namnet for full oversikt → · Sjå <strong>Trend</strong>-fane ved tabellen for full graf</p>
        </div>
      </td>
    </tr>
  `;
}

function renderTrendContent(participants) {
  return `
    <div class="standing-trend-content">
      <div class="card trend-chart-card">
        <div class="trend-header">
          <div class="trend-mode-toggle" role="group" aria-label="Vel graf-type">
            <button type="button" class="mode-btn ${trendMode === "rank" ? "active" : ""}" data-mode="rank">Plassering</button>
            <button type="button" class="mode-btn ${trendMode === "points" ? "active" : ""}" data-mode="points">Totalpoeng</button>
          </div>
        </div>
        <div class="chart-wrap">
          ${renderFullChart(participants, trendMode)}
        </div>
        <div class="chart-legend">
          ${participants.map((p, i) =>
            `<span class="legend-item"><span class="trend-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${p.name}</span>`
          ).join("")}
        </div>
      </div>
      <div class="card">
        <h2>Per deltakar</h2>
        <div class="trend-cards-grid">${renderTrendCards(participants)}</div>
      </div>
    </div>
  `;
}

function standingPanel() {
  const participants = enrichedParticipants();
  const facts = computeFacts(participants);
  const changeLabel = rankChangeLabel();

  const rows = participants.flatMap((p, index) => {
    const rank = index + 1;
    const ranks = p.history.ranks;
    const prevRank = ranks.length >= 2 ? ranks[ranks.length - 2] : null;
    const change = rankChange(prevRank, rank);
    const rankClass = rank <= 3 ? `rank-${rank}` : "";

    const mainRow = `
      <tr class="${rankClass}" data-name="${p.name}">
        <td class="col-expand">
          <button type="button" class="expand-btn" aria-expanded="false" aria-label="Vis poengsum for ${p.name}" data-expand="${index}">+</button>
        </td>
        <td class="num">${rank}</td>
        <td class="col-rank-change">
          <span class="rank-change ${change.cls}" title="${changeLabel}">
            ${change.arrow}${change.delta ? ` ${change.delta}` : ""}
          </span>
        </td>
        <td>
          <a href="#" class="participant-link" data-goto="${p.name}"><strong>${p.name}</strong></a>
        </td>
        <td class="num">${p.scores.group}</td>
        <td class="num">${p.scores.knockout}</td>
        <td class="num">${p.scores.bonus}</td>
        <td class="num"><strong>${p.scores.total}</strong></td>
        <td class="sparkline-cell">${renderSparkline(p.history.ranks, {
          scale: "rank",
          maxRank: data.participants.length,
          color: sparklineColorFromRanks(p.history.ranks),
          title: `Plassering: ${p.history.ranks.join(" → ")} (1 = topp)`,
        })}</td>
      </tr>
    `;
    return [mainRow, renderDetailRow(p, index)];
  }).join("");

  return `
    <section class="panel active" id="panel-standing">
      <div class="card standing-main-card">
        <nav class="standing-subtabs" aria-label="Standing-visning">
          <button type="button" class="subtab ${standingView === "table" ? "active" : ""}" data-standing-view="table">Standing</button>
          <button type="button" class="subtab ${standingView === "trend" ? "active" : ""}" data-standing-view="trend">Trend</button>
        </nav>
        <div class="standing-subview ${standingView === "table" ? "active" : ""}" id="standing-subview-table">
          <div class="standing-layout">
            <div class="card standing-table-card">
              <div class="table-wrap">
                <table class="standing-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th class="num">Plass</th>
                      <th>Δ</th>
                      <th>Deltakar</th>
                      <th class="num">Gruppespel</th>
                      <th class="num">Sluttspel</th>
                      <th class="num">Bonus</th>
                      <th class="num">Total</th>
                      <th title="Plassering over tid (1 = topp)">Trend</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
            ${renderFactsSidebar(facts)}
          </div>
        </div>
        <div class="standing-subview ${standingView === "trend" ? "active" : ""}" id="standing-subview-trend">
          ${renderTrendContent(participants)}
        </div>
      </div>
    </section>
  `;
}

function renderTrendCards(participants) {
  return participants.map((p, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return `
      <div class="trend-card">
        <div class="trend-card-header">
          <span class="trend-dot" style="background:${color}"></span>
          <strong>${p.name}</strong>
          <span class="trend-card-meta">${p.scores.total}p · plass ${p.history.ranks[p.history.ranks.length - 1]}</span>
        </div>
        <div class="trend-card-charts">
          <div class="trend-mini-chart">
            <span class="trend-mini-label">Plassering</span>
            ${renderSparkline(p.history.ranks, {
              scale: "rank",
              maxRank: data.participants.length,
              w: 120,
              h: 36,
              color: sparklineColorFromRanks(p.history.ranks),
              title: `Plassering: ${p.history.ranks.join(" → ")} (1 = topp)`,
            })}
          </div>
          <div class="trend-mini-chart">
            <span class="trend-mini-label">Poeng</span>
            ${renderSparkline(p.history.totals, { w: 120, h: 36 })}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function refreshTrendSubview() {
  const subview = document.getElementById("standing-subview-trend");
  if (!subview) return;
  subview.innerHTML = renderTrendContent(enrichedParticipants());
}

function setStandingView(view) {
  standingView = view;
  document.querySelectorAll(".standing-subtabs .subtab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.standingView === view);
  });
  document.querySelectorAll(".standing-subview").forEach((el) => {
    el.classList.toggle("active", el.id === `standing-subview-${view}`);
  });
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
                  <th>Kvalifisert</th>
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
    const expandBtn = event.target.closest(".expand-btn");
    if (expandBtn) {
      event.preventDefault();
      event.stopPropagation();
      const index = expandBtn.dataset.expand;
      const detail = document.getElementById(`detail-${index}`);
      const open = expandBtn.getAttribute("aria-expanded") === "true";
      expandBtn.setAttribute("aria-expanded", open ? "false" : "true");
      expandBtn.textContent = open ? "+" : "−";
      detail.classList.toggle("hidden", open);
      return;
    }

    const link = event.target.closest(".participant-link");
    if (link) {
      event.preventDefault();
      activateTab("participant", link.dataset.goto);
      return;
    }

    const subtab = event.target.closest("[data-standing-view]");
    if (subtab) {
      event.preventDefault();
      setStandingView(subtab.dataset.standingView);
      return;
    }

    const modeBtn = event.target.closest(".mode-btn");
    if (modeBtn) {
      trendMode = modeBtn.dataset.mode;
      refreshTrendSubview();
      return;
    }
  });
}

renderHeader();
renderParticipantTabs();
renderContent();
bindEvents();
