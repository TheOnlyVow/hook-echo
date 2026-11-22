// Boot: shell only (Task 12). Later tasks wire the map, feeds and features.
import { createPanel } from './ui/panel.js';
import { $ } from './ui/dom.js';

const skeletons = (n) => Array.from({ length: n }, () => '<div class="skeleton" aria-hidden="true"><i></i><i></i><i></i></div>').join('');
const COUNTS = [
  ['Tornado warnings', '#FF0000'],
  ['Severe thunderstorm', '#FFA500'],
  ['Flash flood', '#8B0000'],
  ['Watches', '#FFFF00'],
];

$('#summary').innerHTML = COUNTS.map(([label, hz]) => `<button class="count is-loading" type="button" style="--hz:${hz}" disabled><span class="count-swatch"></span><span class="count-n">0</span><span class="count-label">${label}</span></button>`).join('');
for (const id of ['view-now', 'view-people', 'view-trips', 'view-reports']) $(`#${id}`).innerHTML = skeletons(4);
$('#live-status').dataset.state = 'loading';

createPanel();
