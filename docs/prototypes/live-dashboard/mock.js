// Standalone placement study. All values and pedal samples are synthetic.
// No API calls, game access, persistence or production-app imports. The only control
// is the review-only pattern picker below; the live page would have none.
const mockPatterns = [
  ['Practice', 'session=practice'],
  ['Quali', 'session=quali'],
  ['Pit in 2 · GT3', 'session=race'],
  ['Pit in 2 · LMP2', 'session=race&class=LMP2'],
  ['Damage', 'session=race&condition=damage'],
  ['Puncture', 'session=race&condition=flat'],
  ['Stint · GT3', 'session=race&scenario=stint'],
  ['Stint · LMP2', 'session=race&scenario=stint&class=LMP2'],
  ['Sprint · GT3', 'session=race&scenario=sprint'],
  ['Sprint · LMP2', 'session=race&scenario=sprint&class=LMP2'],
  ['Rain · pit', 'session=race&weather=coming'],
  ['Drying · pit', 'session=race&weather=easing'],
  ['Rain · stint', 'session=race&scenario=stint&weather=coming'],
  ['Game closed', 'state=offline'],
  ['In menu', 'state=menu'],
  ['Before quali · GT3', 'state=between&next=quali'],
  ['Before quali · LMP2', 'state=between&next=quali&class=LMP2'],
  ['Before race · GT3', 'state=between&next=race'],
  ['Before race · LMP2', 'state=between&next=race&class=LMP2'],
  ['Race starting', 'session=race&state=starting'],
  ['Race finished', 'session=race&state=finished'],
];
{
  const params = new URLSearchParams(window.location.search);
  const motion = params.get('motion');
  params.delete('motion');
  const current = params.toString() || 'session=race';
  const picker = document.createElement('select');
  picker.className = 'mock-label';
  picker.setAttribute('aria-label', 'Mock dashboard pattern');
  for (const [label, query] of mockPatterns) picker.add(new Option(label, query, false, query === current));
  picker.addEventListener('change', () => {
    window.location.search = motion ? `${picker.value}&motion=${motion}` : picker.value;
  });
  document.querySelector('.mock-label').replaceWith(picker);
}

const previewSession = new URLSearchParams(window.location.search).get('session');
const session = previewSession === 'practice' || previewSession === 'quali' ? previewSession : 'race';
const requestedClass = new URLSearchParams(window.location.search).get('class');
const mockClass = ['GT3', 'Hypercar', 'LMP2', 'LMP3'].includes(requestedClass) ? requestedClass : 'GT3';
const usesVirtualEnergy = mockClass === 'GT3' || mockClass === 'Hypercar';
// One header weather slot: track temperature when dry and steady; otherwise the
// forecast change (as a chance, never a certainty) or current rain and wetness trends.
const requestedWeather = new URLSearchParams(window.location.search).get('weather');
const weather = requestedWeather === 'coming' || requestedWeather === 'easing' ? requestedWeather : 'steady';
const weatherSlot = document.querySelector('.track-temp');
// Pit and stint views carry rain coming beside the pit lap, so their header keeps track temp.
// Forecast minutes become a lap through the current lap time: one unit for the driver.
if (weather === 'coming' && new URLSearchParams(window.location.search).get('scenario') === 'sprint') {
  weatherSlot.innerHTML = '<span class="quiet">RAIN</span> <b>~LAP 20</b> · <b>60%</b>';
  weatherSlot.setAttribute('aria-label', 'Forecast: sixty percent chance of rain from about lap twenty');
  weatherSlot.dataset.weather = 'coming';
}
if (weather === 'easing') {
  weatherSlot.innerHTML = '<span class="quiet">RAIN</span> <b>20%</b> ↓ <span class="quiet">WET</span> <b>45%</b> ↓';
  weatherSlot.setAttribute('aria-label', 'Rain twenty percent and falling, track wetness forty-five percent and falling');
}
document.body.dataset.session = session;
document.querySelector('.identity > .quiet').textContent = `BAHRAIN GP · ${mockClass}`;
document.title = `${session === 'quali' ? 'Qualifying' : session[0].toUpperCase() + session.slice(1)} dashboard · LMU mock preview`;

const sessionCopy = {
  practice: {
    'session-type': 'PRACTICE',
    'main-heading': '<span class="action-word">LAST LAP</span><span class="action-value">2:01.832</span>',
    'action-note': '−0.184 s',
    'action-detail': 'CURRENT VS BEST',
    'target-heading': 'SESSION TIMING',
    'target-one-label': 'SESSION BEST',
    'target-one': '2:01.406',
    'target-two-label': 'BEST POSSIBLE',
    'target-two': '2:01.284',
  },
  quali: {
    'session-type': 'QUALIFYING',
    'main-heading': '<span class="action-word">PUSH LAP · VS BEST</span><span class="action-value" data-delta="gain">−0.184<span class="unit">s</span></span>',
    'action-note': '−0.184 s',
    'action-detail': 'vs session best',
    'hero-footnote': 'Current lap <strong>VALID</strong><span class="separator">/</span>Second flying lap',
    'target-heading': 'SESSION TIMING',
    'target-one-label': 'BEST LAP',
    'target-one': '2:01.406',
    'target-one-note': 'Your clean session best',
    'target-two-label': 'PROJECTED · EST.',
    'target-two': '2:01.222',
    'target-two-note': 'If current gain is held',
    'target-caption': 'Illustrative delta · own best on this layout',
    'decision-label': 'NEXT ATTEMPT',
    'decision-value': '1 MORE PUSH LAP',
    'decision-note': 'Time and resources include the in-lap',
    'stat-one-label': 'FUEL LEFT',
    'stat-one-value': '14.2<span class="unit">L</span>',
    'stat-one-note': '5.5 L per push lap · est.',
    'stat-two-label': 'VIRTUAL ENERGY',
    'stat-two-value': '23<span class="unit">%</span>',
    'stat-two-note': '8.0% per push lap · est.',
    'stat-three-label': 'TYRE SURFACE AVG',
    'stat-three-value': '82<span class="unit">°C</span>',
    'stat-three-note': '80–84°C across four tyres',
    'last-lap-number': '2',
  },
};
if (session !== 'race') {
  for (const [id, copy] of Object.entries(sessionCopy[session])) {
    document.getElementById(id).innerHTML = copy;
  }
}

if (session === 'race' && new URLSearchParams(window.location.search).get('scenario') === 'sprint') {
  document.body.dataset.scenario = 'sprint';
  document.title = 'Sprint race dashboard · LMU mock preview';
  const sprintCopy = {
    'session-type': 'SPRINT',
    'main-heading': usesVirtualEnergy
      ? '<span class="action-word">SPARE / LAP</span><span class="action-value">0.8<span class="unit">%</span></span>'
      : '<span class="action-word">SPARE / LAP</span><span class="action-value">0.28<span class="unit">L</span></span>',
    'action-note': 'NO PIT STOP',
    'action-detail': '5 laps left',
    'hero-footnote': 'Car condition <strong>NO DAMAGE</strong>',
    'target-heading': 'PROJECTED AT FINISH',
    'target-one-label': 'VIRTUAL ENERGY',
    'target-one': '7<span class="unit">%</span>',
    'target-one-note': 'Above 3% reserve',
    'target-two-label': 'FUEL',
    'target-two': '3.4<span class="unit">L</span>',
    'target-two-note': 'Above 2.0 L reserve',
    'target-caption': 'Current resources cover the remaining race',
    'last-lap-number': '16',
  };
  for (const [id, copy] of Object.entries(sprintCopy)) document.getElementById(id).innerHTML = copy;
}

if (session === 'race') {
  const fuelClass = !usesVirtualEnergy;
  const sprint = document.body.dataset.scenario === 'sprint';
  document.querySelector('.target-grid').classList.add('single-resource');
  // One label line: resource and its moment, no separate panel heading.
  document.getElementById('target-one-label').textContent = `${fuelClass ? 'FUEL' : 'VE'} ${sprint ? 'AT FINISH' : '· MFD'}`;
  document.getElementById('target-heading').remove();
  if (fuelClass) document.getElementById('target-one').innerHTML = `${sprint ? '3.4' : '48'}<span class="unit">L</span>`;
  // Sector deltas stay with damage too: damage takes the last-lap row instead (below).
  {
    document.body.dataset.condition = 'healthy';
    const paceCopy = {
      'decision-label': 'CURRENT VS BEST',
      'decision-value': '−0.184<span class="unit">s</span>',
      'stat-one-label': 'S1 VS BEST',
      'stat-one-value': '−0.120<span class="unit">s</span>',
      'stat-two-label': 'S2 VS BEST',
      'stat-two-value': '−0.064<span class="unit">s</span>',
      'stat-three-label': 'S3 · ACTIVE',
      'stat-three-value': '—',
    };
    for (const [id, copy] of Object.entries(paceCopy)) document.getElementById(id).innerHTML = copy;
  }
}

if (session === 'quali') document.querySelector('.service').classList.add('qualifying-support');

if (session === 'practice') {
  for (const element of document.querySelectorAll('.target-grid p, .target-caption, #hero-footnote, #target-heading')) element.remove();
  document.querySelector('.service').remove();
  document.querySelector('.lap-timing').remove();
  const history = document.createElement('section');
  history.className = 'practice-history';
  history.setAttribute('aria-label', 'Last three completed laps and sector splits');
  history.innerHTML = `
    <table><thead><tr><th scope="col">LAP</th><th scope="col">LAP TIME</th><th scope="col">S1</th><th scope="col">S2</th><th scope="col">S3</th><th scope="col">VS BEST</th></tr></thead>
    <tbody>
      <tr class="latest-lap"><th scope="row">5</th><td>2:01.832</td><td>37.204</td><td>45.116</td><td>39.512</td><td>+0.426</td></tr>
      <tr><th scope="row">4</th><td>2:02.206</td><td>37.404</td><td>45.234</td><td>39.568</td><td>+0.800</td></tr>
      <tr><th scope="row">3</th><td>2:02.202</td><td>37.366</td><td>45.208</td><td>39.628</td><td>+0.796</td></tr>
    </tbody>
    <tfoot><tr><th scope="row">BEST</th><td>2:01.406</td><td>37.150</td><td>44.980</td><td>39.154</td><td></td></tr></tfoot></table>`;
  // Best sectors sum to BEST POSSIBLE; the latest lap's largest sector loss is where to improve.
  history.querySelector('.latest-lap td:nth-child(5)').classList.add('sector-loss');
  document.querySelector('.pedals').before(history);
}

// Cockpit glance mode: keep actionable values and remove paragraph-length context.
for (const element of document.querySelectorAll('.target-grid p, .target-caption, #hero-footnote, .service p')) element.remove();
if (session === 'quali') document.getElementById('target-heading').remove();
if (session === 'race') document.getElementById('action-detail').remove();
else if (session === 'quali') document.querySelector('.action-context').remove();
else document.getElementById('action-detail').textContent = session === 'practice' ? 'CURRENT VS BEST' : 'VS BEST';
const compactLabels = {
  'target-one-label': document.getElementById('target-one-label').textContent === 'VIRTUAL ENERGY' ? 'ENERGY' : document.getElementById('target-one-label').textContent,
  'target-two-label': document.getElementById('target-two-label').textContent === 'VIRTUAL ENERGY' ? 'ENERGY' : document.getElementById('target-two-label').textContent,
  ...(session !== 'practice' ? {
  'decision-label': session === 'race' && document.body.dataset.condition !== 'healthy' ? 'REPAIRS · EST.' : document.getElementById('decision-label').textContent,
  'stat-one-label': document.getElementById('stat-one-label').textContent === 'PACE IMPACT · EST.' ? 'PACE LOSS · EST.' : document.getElementById('stat-one-label').textContent,
  'stat-two-label': document.getElementById('stat-two-label').textContent === 'VIRTUAL ENERGY' ? 'ENERGY' : document.getElementById('stat-two-label').textContent,
  'stat-three-label': session === 'quali' ? 'TYRE TEMP · AVG' : document.getElementById('stat-three-label').textContent,
  } : {}),
};
for (const [id, copy] of Object.entries(compactLabels)) {
  const element = document.getElementById(id);
  if (element) element.textContent = copy;
}
if (session === 'race' || session === 'quali') document.querySelector('.target-grid').lastElementChild.remove();
// Pit-imminent race (no scenario): the tyre call sits beside the resource target for the MFD.
if (session === 'race' && !new URLSearchParams(window.location.search).get('scenario')) {
  const targetGrid = document.querySelector('.target-grid');
  targetGrid.classList.add('with-tyres');
  // The tyre outcome the MFD is set to, stacked under the resource. The compound
  // word carries the colour of the tyre on the car after the stop.
  // Forecast appears only when it changes within the next stint (pit lap 24 onward); it
  // explains, never recommends.
  const tyreCall = {
    steady: ['medium', 'NEW <span class="compound">MEDIUM</span>', ''],
    coming: ['wet', 'NEW <span class="compound">WET</span>', 'RAIN ~LAP 25 · 60%'],
    easing: ['wet', 'NO CHANGE', 'RAIN ENDS ~LAP 25 · 70%'],
  }[weather];
  targetGrid.insertAdjacentHTML('beforeend', `<div><h3>TYRES · MFD</h3><div class="tyre-call" data-compound="${tyreCall[0]}">${tyreCall[1]}</div>${tyreCall[2] ? `<div class="forecast-note">${tyreCall[2]}</div>` : ''}</div>`);
}
// Qualifying keeps the tyre temperature for the out lap; fuel and VE are set in the garage.
if (session === 'quali') {
  for (const id of ['stat-one-label', 'stat-two-label']) document.getElementById(id).closest('.service-stat').remove();
}
if (document.body.dataset.scenario === 'sprint') {
  document.getElementById('target-one-label').textContent = 'TYRES TO FINISH';
  document.getElementById('target-one').textContent = 'OK';
}
// The countdown already says when; the pit lap is on the HUD.
const condition = new URLSearchParams(window.location.search).get('condition');
if (session === 'race' && !new URLSearchParams(window.location.search).get('scenario')) document.getElementById('action-note').remove();
// Damage is common, so it only takes space when it matters: measured pace loss of at least
// 0.3 s/lap over two clean laps since the impact, or a repair estimate of 30 s or more
// (pitstop-estimate.damage; it also reveals suspension damage, which shared memory lacks).
// It then replaces the last-lap row, steady in place (never alternating), and the sector
// deltas stay. Measured, never a guessed repair call; repair time has no live source yet.
if (session === 'race' && condition === 'damage') {
  document.body.dataset.damage = 'true';
  const lapTiming = document.querySelector('.lap-timing');
  lapTiming.classList.add('damage-row');
  lapTiming.setAttribute('aria-label', 'Damage impact');
  lapTiming.innerHTML = `
    <div><h2>PACE LOSS · MEASURED</h2><div data-delta="loss">+0.8<span class="unit">s/lap</span></div></div>
    <div><h2>SINCE IMPACT</h2><div>3<span class="unit">LAPS</span></div></div>
    <div><h2>TO FINISH · 5 LAPS</h2><div data-delta="loss">+4.0<span class="unit">s</span></div></div>
    <div><h2>REPAIR TIME</h2><div>—</div></div>`;
  // A repair stop can leave VE/fuel untouched: the resource then reads like the tyre call.
  document.getElementById('target-one-label').textContent = `${usesVirtualEnergy ? 'VE' : 'FUEL'} · MFD`;
  const resourceCall = document.getElementById('target-one');
  resourceCall.className = 'tyre-call';
  resourceCall.textContent = 'NO CHANGE';
}
// A flat or lost wheel overrides every plan: pit this lap.
if (session === 'race' && condition === 'flat') {
  document.body.dataset.condition = 'flat';
  document.getElementById('main-heading').innerHTML = '<span class="action-value">PIT NOW</span>';
  document.querySelector('.action-context').insertAdjacentHTML('afterbegin', '<span class="action-note">FLAT · REAR LEFT</span>');
}

const deltaReadouts = [...document.querySelectorAll('#lap-change-value, .practice-history tbody td:last-child')];
if (session === 'practice') deltaReadouts.push(document.getElementById('action-note'));
if (document.body.dataset.condition === 'healthy') deltaReadouts.push(...document.querySelectorAll('.service-stat > div, .decision-value'));
for (const readout of deltaReadouts) {
  const deltaSeconds = Number.parseFloat(readout.textContent.replace('−', '-'));
  if (!Number.isFinite(deltaSeconds)) continue;
  readout.dataset.delta = Math.abs(deltaSeconds) <= 0.01 ? 'neutral' : deltaSeconds < 0 ? 'gain' : 'loss';
}

// Mid-stint race: per-lap resource use against the stint target leads; the pit
// countdown stays demoted until two laps out (the plain race preview shows that state).
// Timing strip and last-lap row match the sprint; stint resource/tyre figures sit by the countdown.
if (session === 'race' && new URLSearchParams(window.location.search).get('scenario') === 'stint') {
  document.body.dataset.scenario = 'stint';
  document.title = 'Mid-stint race dashboard · LMU mock preview';
  const resource = usesVirtualEnergy
    ? { label: 'VE / LAP · LAST 3', used: '3.9', spare: '0.2', unit: '%' }
    : { label: 'FUEL / LAP · LAST 3', used: '2.84', spare: '0.06', unit: 'L' };
  const stintCopy = {
    'main-heading': `<span class="action-word">${resource.label}</span><span class="action-value" data-delta="gain">${resource.used}<span class="unit">${resource.unit}</span></span>`,
    'action-note': `${resource.spare} ${resource.unit} SPARE / LAP`,
    'target-one-label': 'PIT IN',
    'target-one': '6<span class="unit">LAPS</span>',
    'last-lap-number': '17',
  };
  for (const [id, copy] of Object.entries(stintCopy)) document.getElementById(id).innerHTML = copy;
  document.getElementById('action-note').dataset.delta = 'gain';
  const targetGrid = document.querySelector('.target-grid');
  targetGrid.classList.add('stint-targets');
  // Tyres judged against the pit lap from the wear rate; rain sits beside the pit when it lands first.
  targetGrid.insertAdjacentHTML('beforeend', `
    <div><h3>TYRES TO PIT</h3><div class="target-value">OK</div></div>
    ${weather === 'coming' ? '<div><h3>RAIN · 60%</h3><div class="target-value rain-lap">~LAP 23</div></div>' : ''}`);
}

// Lifecycle states replace the driving regions with one state screen. Live selection
// would follow the bridge (no shared memory = game closed), the game state (no session =
// menu) and the session phase (grid/formation = starting, session over = finished).
// Laps left in a race, counting the current lap: the HUD shows lap 16/26, the driver
// should not have to subtract. Timed races would show it as an estimate (~11).
if (session === 'race') {
  const lapsLeft = { sprint: 5, stint: 9 }[document.body.dataset.scenario] ?? 5;
  document.querySelector('.personal-record').insertAdjacentHTML('beforebegin', `<span class="laps-left" aria-label="${lapsLeft} laps left including this one"><b>${lapsLeft}</b> <span class="quiet">LAPS LEFT</span></span>`);
}

const lifecycle = new URLSearchParams(window.location.search).get('state');
if (['offline', 'menu', 'between', 'starting', 'finished'].includes(lifecycle)) {
  document.body.dataset.state = lifecycle;
  const resourceLabel = usesVirtualEnergy ? 'TARGET VE / LAP' : 'TARGET FUEL / LAP';
  const resourceValue = usesVirtualEnergy ? '4.1<span class="unit">%</span>' : '2.90<span class="unit">L</span>';
  const resourceName = usesVirtualEnergy ? 'VE' : 'FUEL';
  // Between sessions of one event (garage monitor): what to load for the next session.
  // Per-lap use is measured on clean laps of the earlier sessions; laps come from the
  // next session's length (timed: out lap + laps started before the flag).
  const nextSession = new URLSearchParams(window.location.search).get('next') === 'race' ? 'race' : 'quali';
  const between = nextSession === 'quali'
    ? { title: 'NEXT · QUALIFYING', note: `IN THE GARAGE · ${resourceName} / LAP FROM PRACTICE · 6 CLEAN LAPS`, figures: [
      ['QUALI · 15 MIN', '8<span class="unit">LAPS</span>'], [`${resourceName} / LAP`, resourceValue], ['RESERVE', '1<span class="unit">LAP</span>'],
      [`${resourceName} NEEDED`, usesVirtualEnergy ? '37<span class="unit">%</span>' : '27<span class="unit">L</span>', 'need'],
    ] }
    // More than a tank to finish: the start load is a full tank and the plan names the stop.
    : { title: 'NEXT · RACE', note: `IN THE GARAGE · ${resourceName} / LAP FROM PRACTICE + QUALI · 11 CLEAN LAPS`, figures: [
      ['RACE', '26<span class="unit">LAPS</span>'], [`${resourceName} / LAP`, resourceValue], ['PLAN', '1<span class="unit">STOP · ~LAP 24</span>'],
      [`${resourceName} NEEDED`, usesVirtualEnergy ? '100<span class="unit">%</span>' : '75<span class="unit">L</span>', 'need'],
    ] };
  const screens = {
    between,
    offline: { title: 'WAITING FOR LMU', note: 'GAME NOT RUNNING', figures: [] },
    menu: { title: 'IN MENU', note: 'WAITING FOR A SESSION', figures: [] },
    starting: { title: 'RACE STARTING', note: 'FORMATION LAP', figures: [
      ['PLAN', '1<span class="unit">STOP</span>'], ['PIT', '~LAP 24'], [resourceLabel, resourceValue], ['TYRES', '<span class="tyre-call" data-compound="medium"><span class="compound">MEDIUM</span></span>'],
    ] },
    // Race result first: class position leads, overall and grid in the note; then the
    // battle at the flag, then pace. Gaps are to the class cars either side at the line.
    finished: { title: 'FINISHED <span class="finish-place">P3</span>', note: `IN ${mockClass} · P11 OVERALL · STARTED P7 · DEBRIEF READY IN THE APP`, figures: [
      ['GAINED', '<span data-delta="gain">+4</span>'], ['GAP AHEAD', '1.8<span class="unit">s</span>'], ['GAP BEHIND', '4.2<span class="unit">s</span>'], ['STOPS', '1'],
      ['BEST', '2:01.406'], ['VS PR', '<span data-delta="loss">+0.442</span>'], ['CLEAN AVG', '2:02.118'], ['LAPS', '26'],
    ] },
  };
  const screen = screens[lifecycle];
  document.querySelector('.laps-left')?.remove();
  if (lifecycle === 'offline' || lifecycle === 'menu') {
    // No session: nothing session-specific in the header.
    for (const element of document.querySelectorAll('#session-type, .identity > .quiet, .personal-record, .track-temp')) element.remove();
  }
  for (const region of document.querySelectorAll('.hero, .service, .lap-timing, .practice-history')) region.remove();
  if (lifecycle === 'between') document.getElementById('session-type').textContent = 'GARAGE';
  if (lifecycle !== 'starting') document.querySelector('.pedals').remove();
  const section = document.createElement('section');
  section.className = 'state-screen';
  section.setAttribute('aria-label', 'Session state');
  section.innerHTML = `<h1>${screen.title}</h1><p class="state-note">${screen.note}</p>${screen.figures.length ? `<div class="state-figures">${screen.figures.map(([label, value, kind]) => `<div${kind ? ` class="${kind}"` : ''}><h2>${label}</h2><div>${value}</div></div>`).join('')}</div>` : ''}`;
  document.querySelector('.session-bar').after(section);
}

// Continuous piecewise pedal inputs: braking, release, then throttle pickup.
function pedalsAt(time) {
  const phase = ((time % 8.8) + 8.8) % 8.8;
  if (phase < 2.8) return [100, 0];
  if (phase < 3.05) return [100 * (3.05 - phase) / .25, 0];
  if (phase < 3.25) return [0, 96 * (phase - 3.05) / .2];
  if (phase < 3.6) return [0, 96 - (phase - 3.25) * 12];
  if (phase < 4.7) return [0, 91.8 * (4.7 - phase) / 1.1];
  if (phase < 5) return [0, 0];
  if (phase < 6.5) {
    const ramp = (phase - 5) / 1.5;
    return [100 * ramp * ramp, 0];
  }
  return [100, 0];
}
const throttlePath = document.getElementById('throttle-path');
const brakePath = document.getElementById('brake-path');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const frozen = new URLSearchParams(window.location.search).get('motion') === 'off';
const startedAt = performance.now();
const historySeconds = 20;
const samplesPerSecond = 40;
const traceSamples = historySeconds * samplesPerSecond;
function renderPedals() {
  const now = reducedMotion.matches || frozen ? 22 : 22 + (performance.now() - startedAt) / 1000;
  const throttlePoints = [];
  const brakePoints = [];
  for (let index = 0; index <= traceSamples; index++) {
    const [throttle, brake] = pedalsAt(now - historySeconds + index / samplesPerSecond);
    const x = 32 + index / traceSamples * 2384;
    const prefix = index === 0 ? 'M' : 'L';
    throttlePoints.push(`${prefix}${x.toFixed(1)},${(236 - throttle * 2.2).toFixed(1)}`);
    brakePoints.push(`${prefix}${x.toFixed(1)},${(236 - brake * 2.2).toFixed(1)}`);
  }
  throttlePath.setAttribute('d', throttlePoints.join(' '));
  brakePath.setAttribute('d', brakePoints.join(' '));
}
if (throttlePath) {
  renderPedals();
  window.setInterval(() => { if (!document.hidden && !reducedMotion.matches && !frozen) renderPedals(); }, 50);
}
