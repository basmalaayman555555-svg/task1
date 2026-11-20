/* Wanderlust Travel Planner - main.js */

const CONFIG = {
  ticketmasterKey: 'YOUR_TICKETMASTER_API_KEY',
  // Leave empty to use the keyless open.er-api.com endpoint (same response shape)
  exchangeRateKey: '',
  storage: { plans: 'wanderlust:plans', destination: 'wanderlust:destination' },
  maxCities: 400,
  popularCurrencies: ['EUR', 'GBP', 'AED', 'SAR', 'JPY', 'CAD', 'INR', 'CHF'],
  currencyFlags: {
    EUR: 'eu', GBP: 'gb', AED: 'ae', SAR: 'sa', JPY: 'jp', CAD: 'ca', INR: 'in',
    CHF: 'ch', USD: 'us', AUD: 'au', CNY: 'cn', TRY: 'tr', EGP: 'eg',
  },
};

const VIEWS = {
  dashboard: {
    title: 'Dashboard',
    subtitle: (s) => (s.countryCode
      ? `Exploring ${s.city}, ${s.country.name.common}`
      : 'Welcome back! Ready to plan your next adventure?'),
  },
  holidays: {
    title: 'Holidays',
    subtitle: (s) => (s.countryCode
      ? `Public holidays in ${s.country.name.common} for ${s.year}`
      : 'Browse public holidays around the world'),
  },
  events: {
    title: 'Events',
    subtitle: (s) => (s.countryCode ? `Concerts, sports and shows in ${s.city}` : 'Find concerts, sports and shows'),
  },
  weather: {
    title: 'Weather',
    subtitle: (s) => (s.countryCode ? `7-day forecast for ${s.city}` : 'Check the forecast before you go'),
  },
  'long-weekends': {
    title: 'Long Weekends',
    subtitle: (s) => (s.countryCode ? `Mini-trip windows in ${s.country.name.common}, ${s.year}` : 'Plan mini-trips around holidays'),
  },
  currency: { title: 'Currency Converter', subtitle: () => 'Live exchange rates for your trip' },
  'sun-times': {
    title: 'Sun Times',
    subtitle: (s) => (s.countryCode ? `Sunrise and sunset in ${s.city}` : 'Plan around golden hour'),
  },
  'my-plans': { title: 'My Plans', subtitle: () => 'Everything you have saved in one place' },
};

const PLAN_LABELS = { holiday: 'Holiday', event: 'Event', longweekend: 'Long Weekend' };

const EVENT_FILTERS = {
  all: () => true,
  music: (c) => c === 'Music',
  sports: (c) => c === 'Sports',
  arts: (c) => /arts|theatre|film/i.test(c),
};

const PICKER_CSS = `
.wl-picker{position:relative;width:100%}
.wl-picker-btn{display:flex;align-items:center;gap:10px;width:100%;min-height:46px;padding:10px 14px;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#111827;font:inherit;text-align:left;cursor:pointer;box-sizing:border-box}
.wl-picker-btn:focus-visible{outline:2px solid #6366f1;outline-offset:1px}
.wl-picker-btn img,.wl-picker-item img{width:28px;height:20px;flex:none;object-fit:cover;border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.1)}
.wl-picker-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wl-picker-caret{opacity:.55;font-size:12px}
.wl-picker-panel{position:absolute;z-index:80;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.18);overflow:hidden}
.wl-picker-panel[hidden]{display:none}
.wl-picker-search{display:block;width:100%;padding:11px 14px;border:0;border-bottom:1px solid #e5e7eb;background:#fff;color:#111827;font:inherit;outline:none;box-sizing:border-box}
.wl-picker-list{max-height:300px;margin:0;padding:4px;overflow-y:auto;list-style:none}
.wl-picker-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;color:#111827;cursor:pointer}
.wl-picker-item:hover,.wl-picker-item.active{background:#eef2ff}
.wl-picker-empty{padding:14px;color:#6b7280;text-align:center}
`;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const enc = encodeURIComponent;

// "YYYY-MM-DD" -> local Date (avoids the UTC shift of new Date("YYYY-MM-DD"))
const parseDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const fmtDate = (date, opts) => date.toLocaleDateString('en-US', opts);
const flagUrl = (code, size = 80) => `https://flagcdn.com/w${size}/${code.toLowerCase()}.png`;
const capitalize = (text = '') => text.charAt(0).toUpperCase() + text.slice(1);

const readStore = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeStore = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable or full */ }
};

const describeWeather = (code) => {
  if (code === 0) return { label: 'Clear sky', icon: 'fa-sun', theme: 'sunny' };
  if (code === 1) return { label: 'Mainly clear', icon: 'fa-sun', theme: 'sunny' };
  if (code === 2) return { label: 'Partly cloudy', icon: 'fa-cloud-sun', theme: 'cloudy' };
  if (code === 3) return { label: 'Overcast', icon: 'fa-cloud', theme: 'cloudy' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'fa-smog', theme: 'foggy' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'fa-cloud-rain', theme: 'rainy' };
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: 'fa-cloud-showers-heavy', theme: 'rainy' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'fa-snowflake', theme: 'snowy' };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: 'fa-cloud-showers-heavy', theme: 'rainy' };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'fa-snowflake', theme: 'snowy' };
  if (code >= 95) return { label: 'Thunderstorm', icon: 'fa-cloud-bolt', theme: 'stormy' };
  return { label: 'Unknown', icon: 'fa-cloud', theme: 'cloudy' };
};

const emptyState = ({ icon = 'fa-compass', title, text, goto, gotoLabel = 'Choose destination' }) => `
  <div class="empty-state">
    <div class="empty-icon"><i class="fa-solid ${icon}"></i></div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${goto ? `<button type="button" class="btn-primary" data-goto="${goto}"><i class="fa-solid fa-compass"></i> ${esc(gotoLabel)}</button>` : ''}
  </div>`;

const loadingState = (text = 'Loading...') => `
  <div class="empty-state">
    <div class="empty-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
    <p>${esc(text)}</p>
  </div>`;

class WanderlustApp {
  constructor() {
    this.state = this.blankState();
    this.token = 0;
    this.countries = [];
    this.countryCache = new Map();
    this.cityCache = new Map();
    this.catalog = new Map();
    this.plans = readStore(CONFIG.storage.plans, []);
    this.plans.forEach((plan) => this.catalog.set(plan.id, plan));
    this.ratesPromise = null;
    this.picker = null;
  }

  blankState() {
    return {
      view: 'dashboard',
      countryCode: null,
      country: null,
      city: null,
      year: new Date().getFullYear(),
      coords: null,
      timezone: null,
      weather: null,
      events: null,
      eventsKey: null,
      eventFilter: 'all',
      planFilter: 'all',
      rates: null,
      ratesUpdated: null,
    };
  }

  /* ---------- Bootstrap ---------- */

  async init() {
    $$('.view-header-content p').forEach((p) => { p.dataset.default = p.textContent; });
    this.injectPickerStyles();
    this.bindEvents();
    this.initEventFilters();
    this.populateYears();
    this.startClock();
    this.resetDestinationUI();
    this.syncPlanUI();

    const initial = location.hash.slice(1);
    this.route(VIEWS[initial] ? initial : 'dashboard', { push: false });

    await this.loadCountries();
    this.ensureRates().catch(() => {});
    await this.restoreDestination();
  }

  bindEvents() {
    $('#sidebar').addEventListener('click', (e) => {
      const link = e.target.closest('[data-view]');
      if (!link) return;
      e.preventDefault();
      this.route(link.dataset.view);
    });

    $('#mobile-menu-btn').addEventListener('click', () => this.toggleSidebar());
    $('#sidebar-overlay').addEventListener('click', () => this.toggleSidebar(false));
    window.addEventListener('popstate', () => {
      const view = location.hash.slice(1);
      this.route(VIEWS[view] ? view : 'dashboard', { push: false });
    });

    // Picking a country, city or year refreshes every view automatically
    $('#global-country').addEventListener('change', (e) => this.onCountryChange(e.target.value));
    $('#global-city').addEventListener('change', () => this.explore());
    $('#global-year').addEventListener('change', () => this.explore());
    $('#global-search-btn').addEventListener('click', () => this.explore());
    $('#clear-selection-btn').addEventListener('click', () => this.clearDestination());

    $('#convert-btn').addEventListener('click', () => this.convert());
    $('#swap-currencies-btn').addEventListener('click', () => this.swapCurrencies());
    $('#currency-amount').addEventListener('keydown', (e) => e.key === 'Enter' && this.convert());
    ['#currency-from', '#currency-to'].forEach((sel) => $(sel).addEventListener('change', () => this.convert()));

    $('#clear-all-plans-btn').addEventListener('click', () => this.clearPlans());

    // One delegated handler for everything that is re-rendered
    document.addEventListener('click', (e) => {
      const save = e.target.closest('[data-plan-id]');
      if (save) return this.togglePlan(save.dataset.planId);

      const goto = e.target.closest('[data-goto]');
      if (goto) return this.route(goto.dataset.goto);

      const eventFilter = e.target.closest('[data-event-filter]');
      if (eventFilter) return this.setEventFilter(eventFilter.dataset.eventFilter);

      const planFilter = e.target.closest('.plan-filter[data-filter]');
      if (planFilter) return this.setPlanFilter(planFilter.dataset.filter);

      const quick = e.target.closest('[data-currency]');
      if (quick) {
        $('#currency-to').value = quick.dataset.currency;
        this.convert();
      }
    });

    // Drop broken event images instead of showing a broken icon
    document.addEventListener('error', (e) => {
      if (e.target.matches?.('.event-card-image img')) e.target.remove();
    }, true);
  }

  startClock() {
    const tick = () => {
      $('#current-datetime').textContent = new Date().toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      this.tickLocalTime();
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- Routing ---------- */

  route(view, { push = true } = {}) {
    if (!VIEWS[view]) view = 'dashboard';
    this.state.view = view;

    $$('.view').forEach((el) => el.classList.toggle('active', el.id === `${view}-view`));
    $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === view));

    if (push && location.hash.slice(1) !== view) history.pushState({ view }, '', `#${view}`);
    else history.replaceState({ view }, '', `#${view}`);

    this.updateHeader();
    this.toggleSidebar(false);
    window.scrollTo({ top: 0 });

    if (view === 'events') this.ensureEvents();
    if (view === 'my-plans') this.renderPlans();
    if (view === 'currency' && !this.state.rates) this.ensureRates().catch(() => {});
  }

  updateHeader() {
    const meta = VIEWS[this.state.view];
    $('#page-title').textContent = meta.title;
    $('#page-subtitle').textContent = meta.subtitle(this.state);
  }

  toggleSidebar(open) {
    const sidebar = $('#sidebar');
    const next = open ?? !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', next);
    $('#sidebar-overlay').classList.toggle('hidden', !next);
  }

  /* ---------- Shared helpers ---------- */

  timeoutSignal(ms = 12000) {
    return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
  }

  async request(url, options = {}, timeout = 12000) {
    let res;
    try {
      res = await fetch(url, { ...options, signal: this.timeoutSignal(timeout) });
    } catch (err) {
      if (err.name === 'TimeoutError') throw new Error('The request timed out. Check your connection and try again.');
      throw new Error('Network error. Check your connection and try again.');
    }
    if (res.status === 204) return [];
    if (!res.ok) {
      const err = new Error(`Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  fetchJSON(url, timeout) {
    return this.request(url, {}, timeout);
  }

  postJSON(url, body, timeout) {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeout);
  }

  setLoading(visible, text = 'Loading...') {
    $('#loading-text').textContent = text;
    $('#loading-overlay').classList.toggle('hidden', !visible);
  }

  toast(message, type = 'info') {
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] ?? icons.info}"></i><span>${esc(message)}</span>`;
    $('#toast-container').append(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ---------- Country picker (flags next to every country) ---------- */

  injectPickerStyles() {
    if ($('#wl-picker-styles')) return;
    const style = document.createElement('style');
    style.id = 'wl-picker-styles';
    style.textContent = PICKER_CSS;
    document.head.append(style);
  }

  buildCountryPicker() {
    const select = $('#global-country');
    $('.wl-picker')?.remove();

    const root = document.createElement('div');
    root.className = 'wl-picker';
    root.innerHTML = `
      <button type="button" class="wl-picker-btn" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="wl-picker-panel" hidden>
        <input type="text" class="wl-picker-search" placeholder="Search country..." autocomplete="off">
        <ul class="wl-picker-list" role="listbox"></ul>
      </div>`;

    select.style.display = 'none';
    select.after(root);

    const picker = {
      root,
      button: $('.wl-picker-btn', root),
      panel: $('.wl-picker-panel', root),
      search: $('.wl-picker-search', root),
      list: $('.wl-picker-list', root),
    };
    this.picker = picker;

    const open = () => {
      picker.panel.hidden = false;
      picker.button.setAttribute('aria-expanded', 'true');
      picker.search.value = '';
      this.renderPickerList('');
      picker.search.focus();
    };
    const close = () => {
      picker.panel.hidden = true;
      picker.button.setAttribute('aria-expanded', 'false');
    };

    picker.button.addEventListener('click', () => (picker.panel.hidden ? open() : close()));
    picker.search.addEventListener('input', () => this.renderPickerList(picker.search.value));
    picker.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = $('.wl-picker-item', picker.list);
        if (first) first.click();
      }
    });
    picker.list.addEventListener('click', (e) => {
      const item = e.target.closest('.wl-picker-item');
      if (!item) return;
      close();
      select.value = item.dataset.code;
      this.setPickerValue(item.dataset.code);
      select.dispatchEvent(new Event('change'));
    });
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) close();
    });

    this.setPickerValue(select.value);
  }

  renderPickerList(query) {
    const q = query.trim().toLowerCase();
    const matches = this.countries.filter((c) => c.name.toLowerCase().includes(q));
    const current = $('#global-country').value;

    this.picker.list.innerHTML = matches.length
      ? matches.map((c) => `
          <li class="wl-picker-item${c.countryCode === current ? ' active' : ''}" role="option" data-code="${c.countryCode}">
            <img src="${flagUrl(c.countryCode, 40)}" alt="" loading="lazy">
            <span>${esc(c.name)}</span>
          </li>`).join('')
      : '<li class="wl-picker-empty">No country found</li>';
  }

  setPickerValue(code) {
    if (!this.picker) return;
    const country = this.countries.find((c) => c.countryCode === code);
    this.picker.button.innerHTML = country
      ? `<img src="${flagUrl(code, 40)}" alt=""><span class="wl-picker-label">${esc(country.name)}</span><i class="fa-solid fa-chevron-down wl-picker-caret"></i>`
      : '<span class="wl-picker-label">Select Country</span><i class="fa-solid fa-chevron-down wl-picker-caret"></i>';
  }

  /* ---------- Countries & destination ---------- */

  populateYears() {
    const select = $('#global-year');
    const current = new Date().getFullYear();
    select.innerHTML = Array.from({ length: 5 }, (_, i) => current - 1 + i)
      .map((y) => `<option value="${y}"${y === current ? ' selected' : ''}>${y}</option>`)
      .join('');
    this.state.year = current;
  }

  async loadCountries() {
    const select = $('#global-country');
    try {
      const list = await this.fetchJSON('https://date.nager.at/api/v3/AvailableCountries');
      this.countries = list.sort((a, b) => a.name.localeCompare(b.name));
      select.innerHTML = '<option value="">Select Country</option>' + this.countries
        .map((c) => `<option value="${c.countryCode}">${esc(c.name)}</option>`)
        .join('');
      $('#stat-countries').textContent = this.countries.length;
      this.buildCountryPicker();
    } catch (err) {
      console.error(err);
      select.innerHTML = '<option value="">Failed to load countries</option>';
      this.toast('Could not load the countries list. Please refresh.', 'error');
    }
  }

  async getCountry(code) {
    if (this.countryCache.has(code)) return this.countryCache.get(code);

    const base = `https://restcountries.com/v3.1/alpha/${code}`;
    const slim = 'name,cca2,capital,capitalInfo,latlng,region,subregion,population,area,currencies';
    let country = null;

    for (const url of [base, `${base}?fields=${slim}`]) {
      try {
        const data = await this.fetchJSON(url);
        country = Array.isArray(data) ? data[0] : data;
        if (country?.name) break;
      } catch (err) {
        console.error('REST Countries failed:', url, err);
      }
    }

    // Fallback: World Bank provides capital + coordinates when REST Countries is unreachable
    if (!country?.name) {
      const data = await this.fetchJSON(`https://api.worldbank.org/v2/country/${code}?format=json`);
      const wb = data?.[1]?.[0];
      if (!wb) throw new Error('Country details are unavailable right now.');
      const name = this.countries.find((c) => c.countryCode === code)?.name ?? wb.name;
      const lat = parseFloat(wb.latitude);
      const lon = parseFloat(wb.longitude);
      country = {
        name: { common: name, official: name },
        cca2: code,
        capital: wb.capitalCity ? [wb.capitalCity] : [],
        capitalInfo: { latlng: [lat, lon] },
        latlng: [lat, lon],
        region: wb.region?.value,
      };
    }

    this.countryCache.set(code, country);
    return country;
  }

  // Capital(s) first, then the country's other cities (A-Z)
  async getCities(country) {
    const key = country.cca2;
    if (this.cityCache.has(key)) return this.cityCache.get(key);

    const capitals = country.capital ?? [];
    const names = [...new Set([country.name.common, this.countries.find((c) => c.countryCode === key)?.name])].filter(Boolean);
    let extra = [];

    for (const name of names) {
      try {
        const res = await this.postJSON('https://countriesnow.space/api/v0.1/countries/cities', { country: name }, 9000);
        if (!res.error && Array.isArray(res.data) && res.data.length) {
          extra = res.data;
          break;
        }
      } catch (err) {
        console.error('City list failed:', err);
        break;
      }
    }

    const rest = [...new Set(extra.map((c) => String(c).trim()).filter(Boolean))]
      .filter((c) => !capitals.includes(c))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, CONFIG.maxCities);

    const list = [...capitals, ...rest];
    if (!list.length) list.push(country.name.common);

    this.cityCache.set(key, list);
    return list;
  }

  async onCountryChange(code, { autoExplore = true } = {}) {
    const citySelect = $('#global-city');
    if (!code) {
      citySelect.innerHTML = '<option value="">Select a country first</option>';
      citySelect.disabled = true;
      return;
    }

    citySelect.disabled = true;
    citySelect.innerHTML = '<option value="">Loading cities...</option>';
    try {
      const country = await this.getCountry(code);
      const cities = await this.getCities(country);
      if ($('#global-country').value !== code) return;

      citySelect.innerHTML = cities.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      citySelect.disabled = false;
      if (autoExplore) this.explore();
    } catch (err) {
      console.error(err);
      citySelect.innerHTML = '<option value="">Unavailable</option>';
      this.toast(err.message || 'Could not load country details.', 'error');
    }
  }

  async resolveCoords(country, city) {
    const capitalCoords = country.capitalInfo?.latlng;
    if (city === country.capital?.[0] && capitalCoords?.length === 2 && !capitalCoords.some(Number.isNaN)) {
      return { lat: capitalCoords[0], lon: capitalCoords[1] };
    }

    try {
      const geo = await this.fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(city)}&count=1&countryCode=${country.cca2}`);
      const hit = geo.results?.[0];
      if (hit) return { lat: hit.latitude, lon: hit.longitude };
    } catch { /* fall back to the country centre */ }

    const [lat, lon] = country.latlng ?? [];
    if (lat == null || Number.isNaN(lat)) throw new Error('No coordinates available for this destination.');
    return { lat, lon };
  }

  async explore() {
    const code = $('#global-country').value;
    const city = $('#global-city').value;
    const year = Number($('#global-year').value);
    if (!code || !city) return;

    const token = ++this.token;
    this.setLoading(true, `Exploring ${city}...`);

    try {
      const country = await this.getCountry(code);
      const coords = await this.resolveCoords(country, city);
      if (token !== this.token) return;

      Object.assign(this.state, {
        countryCode: code, country, city, year, coords,
        timezone: null, weather: null, events: null, eventsKey: null,
      });
      writeStore(CONFIG.storage.destination, { countryCode: code, city, year });
      this.renderDestination();

      await Promise.all([
        this.loadHolidays(token),
        this.loadLongWeekends(token),
        this.loadWeatherAndSun(token),
        this.loadEvents(token),
        this.syncCurrency(token),
      ]);
    } catch (err) {
      console.error(err);
      if (token === this.token) this.toast(err.message || 'Something went wrong while exploring.', 'error');
    } finally {
      if (token === this.token) this.setLoading(false);
    }
  }

  async restoreDestination() {
    const saved = readStore(CONFIG.storage.destination, null);
    if (!saved || !this.countries.some((c) => c.countryCode === saved.countryCode)) return;

    $('#global-country').value = saved.countryCode;
    this.setPickerValue(saved.countryCode);
    await this.onCountryChange(saved.countryCode, { autoExplore: false });

    const citySelect = $('#global-city');
    if ([...citySelect.options].some((o) => o.value === saved.city)) citySelect.value = saved.city;
    const yearSelect = $('#global-year');
    if ([...yearSelect.options].some((o) => o.value === String(saved.year))) yearSelect.value = saved.year;

    await this.explore();
  }

  clearDestination() {
    this.token += 1;
    this.setLoading(false);
    this.state = { ...this.blankState(), view: this.state.view, rates: this.state.rates, ratesUpdated: this.state.ratesUpdated };
    try { localStorage.removeItem(CONFIG.storage.destination); } catch { /* ignore */ }

    $('#global-country').value = '';
    this.setPickerValue('');
    this.onCountryChange('');
    this.resetDestinationUI();
    this.updateHeader();
  }

  /* ---------- Destination-wide rendering ---------- */

  resetDestinationUI() {
    const prompt = (icon, title, text) => emptyState({ icon, title, text, goto: 'dashboard' });

    $('#selected-destination').classList.add('hidden');
    $('#dashboard-country-info').innerHTML = emptyState({
      icon: 'fa-earth-americas',
      title: 'No destination selected',
      text: 'Choose a country above and everything loads automatically.',
    });
    $('#holidays-content').innerHTML = prompt('fa-calendar-days', 'Select a destination', 'Pick a country on the dashboard to see its public holidays.');
    $('#lw-content').innerHTML = prompt('fa-umbrella-beach', 'Select a destination', 'Pick a country on the dashboard to find long weekends.');
    $('#events-content').innerHTML = prompt('fa-ticket', 'Select a destination', 'Pick a country on the dashboard to see upcoming events.');
    $('#weather-content').innerHTML = prompt('fa-cloud-sun', 'Select a destination', 'Pick a country on the dashboard to see its forecast.');
    $('#sun-times-content').innerHTML = prompt('fa-sun', 'Select a destination', 'Pick a country on the dashboard to see sunrise and sunset times.');

    ['#stat-holidays', '#stat-events'].forEach((sel) => { $(sel).textContent = '–'; });
    const eventsLabel = $('#stat-events').nextElementSibling;
    if (eventsLabel) eventsLabel.textContent = 'Events Nearby';

    $$('.view-header-selection').forEach((el) => { el.innerHTML = ''; });
    $$('.view-header-content p').forEach((p) => { p.textContent = p.dataset.default ?? p.textContent; });
    $('#events-filters')?.classList.add('hidden');
  }

  renderDestination() {
    const { country, countryCode, city, year } = this.state;
    const name = country.name.common;

    $('#selected-destination').classList.remove('hidden');
    $('#selected-country-flag').src = flagUrl(countryCode);
    $('#selected-country-flag').alt = name;
    $('#selected-country-name').textContent = name;
    $('#selected-city-name').textContent = `• ${city}`;

    this.renderCountryInfo();

    const badge = (kind) => `
      <div class="current-selection-badge">
        <img src="${flagUrl(countryCode, 40)}" alt="${esc(name)}" class="selection-flag">
        <span>${esc(name)}</span>
        <span class="${kind === 'year' ? 'selection-year' : 'selection-city'}">${kind === 'year' ? year : `• ${esc(city)}`}</span>
      </div>`;

    const headers = {
      holidays: ['year', `Browse public holidays for ${name} and plan your trips around them`],
      'long-weekends': ['year', `Find holidays near weekends in ${name} - perfect for mini-trips!`],
      events: ['city', `Discover concerts, sports, theatre and more in ${city}`],
      weather: ['city', `Check 7-day weather forecasts for ${city}`],
      'sun-times': ['city', null],
    };
    Object.entries(headers).forEach(([view, [kind, copy]]) => {
      $(`#${view}-view .view-header-selection`).innerHTML = badge(kind);
      if (copy) $(`#${view}-view .view-header-content p`).textContent = copy;
    });

    [['#holidays-content', 'Loading holidays...'], ['#lw-content', 'Finding long weekends...'],
      ['#weather-content', 'Fetching forecast...'], ['#sun-times-content', 'Calculating sun times...'],
      ['#events-content', 'Searching events...']]
      .forEach(([sel, text]) => { $(sel).innerHTML = loadingState(text); });
    $('#events-filters')?.classList.add('hidden');

    this.updateHeader();
  }

  renderCountryInfo() {
    const c = this.state.country;
    const currencies = Object.entries(c.currencies ?? {});
    const languages = Object.values(c.languages ?? {});
    const callingCode = c.idd?.root ? c.idd.root + (c.idd.suffixes?.length === 1 ? c.idd.suffixes[0] : '') : '—';
    const detail = (icon, label, value) => `
      <div class="dashboard-country-detail">
        <i class="fa-solid ${icon}"></i>
        <span class="label">${label}</span>
        <span class="value">${esc(value)}</span>
      </div>`;
    const tags = (items, cls = '') => (items.length
      ? items.map((t) => `<span class="extra-tag ${cls}">${esc(t)}</span>`).join('')
      : '<span class="extra-tag">—</span>');

    $('#dashboard-country-info').innerHTML = `
      <div class="dashboard-country-header">
        <img src="${flagUrl(this.state.countryCode, 160)}" alt="${esc(c.name.common)}" class="dashboard-country-flag">
        <div class="dashboard-country-title">
          <h3>${esc(c.name.common)}</h3>
          <p class="official-name">${esc(c.name.official)}</p>
          <span class="region"><i class="fa-solid fa-location-dot"></i> ${esc([c.region, c.subregion].filter(Boolean).join(' • ') || '—')}</span>
        </div>
      </div>

      <div class="dashboard-local-time">
        <div class="local-time-display">
          <i class="fa-solid fa-clock"></i>
          <span class="local-time-value" id="country-local-time">--:--:--</span>
          <span class="local-time-zone" id="country-local-zone"></span>
        </div>
      </div>

      <div class="dashboard-country-grid">
        ${detail('fa-building-columns', 'Capital', c.capital?.join(', ') || '—')}
        ${detail('fa-users', 'Population', c.population?.toLocaleString('en-US') ?? '—')}
        ${detail('fa-ruler-combined', 'Area', c.area ? `${Math.round(c.area).toLocaleString('en-US')} km²` : '—')}
        ${detail('fa-globe', 'Continent', c.region ?? '—')}
        ${detail('fa-phone', 'Calling Code', callingCode)}
        ${detail('fa-car', 'Driving Side', capitalize(c.car?.side) || '—')}
        ${detail('fa-calendar-week', 'Week Starts', capitalize(c.startOfWeek) || '—')}
      </div>

      <div class="dashboard-country-extras">
        <div class="dashboard-country-extra">
          <h4><i class="fa-solid fa-coins"></i> Currency</h4>
          <div class="extra-tags">${tags(currencies.map(([code, cur]) => `${cur.name} (${code}${cur.symbol ? ` ${cur.symbol}` : ''})`))}</div>
        </div>
        <div class="dashboard-country-extra">
          <h4><i class="fa-solid fa-language"></i> Languages</h4>
          <div class="extra-tags">${tags(languages)}</div>
        </div>
        <div class="dashboard-country-extra">
          <h4><i class="fa-solid fa-map-location-dot"></i> Neighbors</h4>
          <div class="extra-tags">${tags(c.borders ?? [], 'border-tag')}</div>
        </div>
      </div>

      ${c.maps?.googleMaps ? `
        <div class="dashboard-country-actions">
          <a href="${esc(c.maps.googleMaps)}" target="_blank" rel="noopener noreferrer" class="btn-map-link">
            <i class="fa-solid fa-map"></i> View on Google Maps
          </a>
        </div>` : ''}`;

    this.tickLocalTime();
  }

  tickLocalTime() {
    const valueEl = $('#country-local-time');
    const zoneEl = $('#country-local-zone');
    const { country, timezone } = this.state;
    if (!valueEl || !country) return;

    const now = new Date();
    const clock = { hour: '2-digit', minute: '2-digit', second: '2-digit' };

    if (timezone) {
      valueEl.textContent = now.toLocaleTimeString('en-US', { ...clock, timeZone: timezone });
      try {
        const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
          .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
        zoneEl.textContent = part.replace('GMT', 'UTC') || 'UTC';
      } catch {
        zoneEl.textContent = timezone;
      }
      return;
    }

    // Weather has not resolved yet: derive the time from the REST Countries offset
    const label = country.timezones?.[0] ?? 'UTC';
    const match = label.match(/UTC([+-])(\d{2}):(\d{2})/);
    const offset = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
    valueEl.textContent = new Date(now.getTime() + offset * 60000).toLocaleTimeString('en-US', { ...clock, timeZone: 'UTC' });
    zoneEl.textContent = label;
  }

  /* ---------- Holidays & long weekends ---------- */

  async loadHolidays(token) {
    const { countryCode, year, country } = this.state;
    const container = $('#holidays-content');
    try {
      const holidays = await this.fetchJSON(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
      if (token !== this.token) return;

      $('#stat-holidays').textContent = holidays.length;
      container.innerHTML = holidays.length
        ? holidays.map((h) => this.holidayCard(h)).join('')
        : emptyState({ icon: 'fa-calendar-xmark', title: 'No holidays found', text: `No public holidays are published for ${country.name.common} in ${year}.` });
    } catch (err) {
      console.error(err);
      if (token !== this.token) return;
      $('#stat-holidays').textContent = '–';
      container.innerHTML = emptyState({ icon: 'fa-triangle-exclamation', title: 'Could not load holidays', text: err.message });
    }
  }

  holidayCard(h) {
    const date = parseDate(h.date);
    const plan = this.register({
      id: `holiday-${h.countryCode}-${h.date}-${slug(h.name)}`,
      type: 'holiday',
      title: h.localName,
      subtitle: h.name,
      date: h.date,
      country: this.state.country.name.common,
    });

    return `
      <div class="holiday-card">
        <div class="holiday-card-header">
          <div class="holiday-date-box">
            <span class="day">${date.getDate()}</span>
            <span class="month">${fmtDate(date, { month: 'short' })}</span>
          </div>
          ${this.saveButton(plan.id, 'holiday-action-btn')}
        </div>
        <h3>${esc(h.localName)}</h3>
        <p class="holiday-name">${esc(h.name)}</p>
        <div class="holiday-card-footer">
          <span class="holiday-day-badge"><i class="fa-regular fa-calendar"></i> ${fmtDate(date, { weekday: 'long' })}</span>
          <span class="holiday-type-badge">${esc(h.types?.[0] ?? 'Public')}</span>
        </div>
      </div>`;
  }

  async loadLongWeekends(token) {
    const { countryCode, year, country } = this.state;
    const container = $('#lw-content');
    try {
      const list = await this.fetchJSON(`https://date.nager.at/api/v3/LongWeekend/${year}/${countryCode}`);
      if (token !== this.token) return;

      container.innerHTML = list.length
        ? list.map((lw, i) => this.longWeekendCard(lw, i + 1)).join('')
        : emptyState({ icon: 'fa-umbrella-beach', title: 'No long weekends', text: `No long weekends were found for ${country.name.common} in ${year}.` });
    } catch (err) {
      console.error(err);
      if (token !== this.token) return;
      container.innerHTML = emptyState({ icon: 'fa-triangle-exclamation', title: 'Could not load long weekends', text: err.message });
    }
  }

  longWeekendCard(lw, index) {
    const start = parseDate(lw.startDate);
    const end = parseDate(lw.endDate);
    const range = `${fmtDate(start, { month: 'short', day: 'numeric' })} - ${fmtDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      days.push(`<div class="lw-day${weekend ? ' weekend' : ''}"><span class="name">${fmtDate(d, { weekday: 'short' })}</span><span class="num">${d.getDate()}</span></div>`);
    }

    const plan = this.register({
      id: `lw-${this.state.countryCode}-${lw.startDate}`,
      type: 'longweekend',
      title: `Long Weekend (${lw.dayCount} days)`,
      subtitle: range,
      date: lw.startDate,
      country: this.state.country.name.common,
    });

    const info = lw.needBridgeDays
      ? '<div class="lw-info-box warning"><i class="fa-solid fa-info-circle"></i> Requires taking a bridge day off</div>'
      : '<div class="lw-info-box success"><i class="fa-solid fa-check-circle"></i> No extra days off needed!</div>';

    return `
      <div class="lw-card">
        <div class="lw-card-header">
          <span class="lw-badge"><i class="fa-solid fa-calendar-days"></i> ${lw.dayCount} Days</span>
          ${this.saveButton(plan.id, 'holiday-action-btn')}
        </div>
        <h3>Long Weekend #${index}</h3>
        <div class="lw-dates"><i class="fa-regular fa-calendar"></i> ${range}</div>
        ${info}
        <div class="lw-days-visual">${days.join('')}</div>
      </div>`;
  }

  /* ---------- Weather & sun times ---------- */

  async loadWeatherAndSun(token) {
    await this.loadWeather(token);
    await this.loadSunTimes(token);
    this.tickLocalTime();
  }

  async loadWeather(token) {
    const { coords, city } = this.state;
    const container = $('#weather-content');
    const params = [
      `latitude=${coords.lat}`, `longitude=${coords.lon}`,
      'current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,wind_speed_10m',
      'daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max',
      'hourly=temperature_2m,weather_code&forecast_hours=8',
      'timezone=auto',
    ].join('&');

    try {
      const data = await this.fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (token !== this.token) return;
      this.state.weather = data;
      this.state.timezone = data.timezone;
      container.innerHTML = this.weatherMarkup(data, city);
    } catch (err) {
      console.error(err);
      if (token !== this.token) return;
      container.innerHTML = emptyState({ icon: 'fa-triangle-exclamation', title: 'Weather unavailable', text: err.message });
    }
  }

  weatherMarkup(data, city) {
    const { current, daily, hourly } = data;
    const now = describeWeather(current.weather_code);
    const today = parseDate(daily.time[0]);

    const hourlyItems = (hourly?.time ?? []).map((time, i) => {
      const info = describeWeather(hourly.weather_code[i]);
      const label = i === 0 ? 'Now' : new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
      return `
        <div class="hourly-item${i === 0 ? ' now' : ''}">
          <span class="hourly-time">${label}</span>
          <div class="hourly-icon"><i class="fa-solid ${info.icon}"></i></div>
          <span class="hourly-temp">${Math.round(hourly.temperature_2m[i])}°</span>
        </div>`;
    }).join('');

    const forecast = daily.time.map((iso, i) => {
      const date = parseDate(iso);
      const info = describeWeather(daily.weather_code[i]);
      const rain = daily.precipitation_probability_max?.[i] ?? 0;
      return `
        <div class="forecast-day${i === 0 ? ' today' : ''}">
          <div class="forecast-day-name">
            <span class="day-label">${i === 0 ? 'Today' : fmtDate(date, { weekday: 'short' })}</span>
            <span class="day-date">${fmtDate(date, { day: 'numeric', month: 'short' })}</span>
          </div>
          <div class="forecast-icon"><i class="fa-solid ${info.icon}"></i></div>
          <div class="forecast-temps">
            <span class="temp-max">${Math.round(daily.temperature_2m_max[i])}°</span>
            <span class="temp-min">${Math.round(daily.temperature_2m_min[i])}°</span>
          </div>
          <div class="forecast-precip">${rain >= 10 ? `<i class="fa-solid fa-droplet"></i><span>${rain}%</span>` : ''}</div>
        </div>`;
    }).join('');

    const detail = (cls, icon, label, value) => `
      <div class="weather-detail-card">
        <div class="detail-icon ${cls}"><i class="fa-solid ${icon}"></i></div>
        <div class="detail-info"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>
      </div>`;

    return `
      <div class="weather-hero-card weather-${now.theme}">
        <div class="weather-location">
          <i class="fa-solid fa-location-dot"></i>
          <span>${esc(city)}</span>
          <span class="weather-time">${fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <div class="weather-hero-main">
          <div class="weather-hero-left">
            <div class="weather-hero-icon"><i class="fa-solid ${now.icon}"></i></div>
            <div class="weather-hero-temp">
              <span class="temp-value">${Math.round(current.temperature_2m)}</span>
              <span class="temp-unit">°C</span>
            </div>
          </div>
          <div class="weather-hero-right">
            <div class="weather-condition">${now.label}</div>
            <div class="weather-feels">Feels like ${Math.round(current.apparent_temperature ?? current.temperature_2m)}°C</div>
            <div class="weather-high-low">
              <span class="high"><i class="fa-solid fa-arrow-up"></i> ${Math.round(daily.temperature_2m_max[0])}°</span>
              <span class="low"><i class="fa-solid fa-arrow-down"></i> ${Math.round(daily.temperature_2m_min[0])}°</span>
            </div>
          </div>
        </div>
      </div>

      <div class="weather-details-grid">
        ${detail('humidity', 'fa-droplet', 'Humidity', `${current.relative_humidity_2m}%`)}
        ${detail('wind', 'fa-wind', 'Wind', `${Math.round(current.wind_speed_10m ?? 0)} km/h`)}
        ${detail('uv', 'fa-sun', 'UV Index', Math.round(daily.uv_index_max?.[0] ?? 0))}
        ${detail('precip', 'fa-cloud-rain', 'Precipitation', `${daily.precipitation_probability_max?.[0] ?? 0}%`)}
      </div>

      ${hourlyItems ? `
        <div class="weather-section">
          <h3 class="weather-section-title"><i class="fa-solid fa-clock"></i> Hourly Forecast</h3>
          <div class="hourly-scroll">${hourlyItems}</div>
        </div>` : ''}

      <div class="weather-section">
        <h3 class="weather-section-title"><i class="fa-solid fa-calendar-week"></i> 7-Day Forecast</h3>
        <div class="forecast-list">${forecast}</div>
      </div>`;
  }

  async loadSunTimes(token) {
    const { coords, city, timezone, weather } = this.state;
    const container = $('#sun-times-content');
    const tz = timezone || 'UTC';
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const fmt = (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1971
        ? '—'
        : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    };

    let times;
    try {
      const data = await this.fetchJSON(`https://api.sunrise-sunset.org/json?lat=${coords.lat}&lng=${coords.lon}&date=${dateStr}&formatted=0`);
      if (data.status !== 'OK') throw new Error(data.status);
      const r = data.results;
      times = {
        dawn: fmt(r.civil_twilight_begin), sunrise: fmt(r.sunrise), noon: fmt(r.solar_noon),
        sunset: fmt(r.sunset), dusk: fmt(r.civil_twilight_end), dayLength: Number(r.day_length),
      };
    } catch (err) {
      console.error(err);
      // Fall back to the sunrise/sunset already returned by the weather call
      const rise = weather?.daily?.sunrise?.[0];
      const set = weather?.daily?.sunset?.[0];
      if (!rise || !set) {
        if (token === this.token) container.innerHTML = emptyState({ icon: 'fa-triangle-exclamation', title: 'Sun times unavailable', text: err.message });
        return;
      }
      const clock = (s) => new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      times = {
        dawn: '—', sunrise: clock(rise), noon: '—', sunset: clock(set), dusk: '—',
        dayLength: (new Date(set) - new Date(rise)) / 1000,
      };
    }
    if (token !== this.token) return;

    const hours = Math.floor(times.dayLength / 3600);
    const minutes = Math.round((times.dayLength % 3600) / 60);
    const pct = Math.min(100, (times.dayLength / 86400) * 100);
    const dark = 86400 - times.dayLength;
    const date = parseDate(dateStr);

    const card = (cls, icon, label, time, sub) => `
      <div class="sun-time-card ${cls}">
        <div class="icon"><i class="fa-solid ${icon}"></i></div>
        <div class="label">${label}</div>
        <div class="time">${time}</div>
        <div class="sub-label">${sub}</div>
      </div>`;

    container.innerHTML = `
      <div class="sun-main-card">
        <div class="sun-main-header">
          <div class="sun-location">
            <h2><i class="fa-solid fa-location-dot"></i> ${esc(city)}</h2>
            <p>Sun times for your selected location</p>
          </div>
          <div class="sun-date-display">
            <div class="date">${fmtDate(date, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            <div class="day">${fmtDate(date, { weekday: 'long' })}</div>
          </div>
        </div>
        <div class="sun-times-grid">
          ${card('dawn', 'fa-moon', 'Dawn', times.dawn, 'Civil Twilight')}
          ${card('sunrise', 'fa-sun', 'Sunrise', times.sunrise, 'Golden Hour Start')}
          ${card('noon', 'fa-sun', 'Solar Noon', times.noon, 'Sun at Highest')}
          ${card('sunset', 'fa-sun', 'Sunset', times.sunset, 'Golden Hour End')}
          ${card('dusk', 'fa-moon', 'Dusk', times.dusk, 'Civil Twilight')}
          ${card('daylight', 'fa-hourglass-half', 'Day Length', `${hours}h ${String(minutes).padStart(2, '0')}m`, 'Total Daylight')}
        </div>
      </div>

      <div class="day-length-card">
        <h3><i class="fa-solid fa-chart-pie"></i> Daylight Distribution</h3>
        <div class="day-progress">
          <div class="day-progress-bar"><div class="day-progress-fill" style="width: ${pct.toFixed(1)}%"></div></div>
        </div>
        <div class="day-length-stats">
          <div class="day-stat"><div class="value">${hours}h ${String(minutes).padStart(2, '0')}m</div><div class="label">Daylight</div></div>
          <div class="day-stat"><div class="value">${pct.toFixed(1)}%</div><div class="label">of 24 Hours</div></div>
          <div class="day-stat"><div class="value">${Math.floor(dark / 3600)}h ${String(Math.round((dark % 3600) / 60)).padStart(2, '0')}m</div><div class="label">Darkness</div></div>
        </div>
      </div>`;
  }

  /* ---------- Events (Ticketmaster) ---------- */

  initEventFilters() {
    const bar = document.createElement('div');
    bar.id = 'events-filters';
    bar.className = 'plans-filter-bar hidden';
    bar.innerHTML = [['all', 'fa-layer-group', 'All'], ['music', 'fa-music', 'Music'], ['sports', 'fa-futbol', 'Sports'], ['arts', 'fa-masks-theater', 'Arts']]
      .map(([key, icon, label]) => `<button type="button" class="plan-filter${key === 'all' ? ' active' : ''}" data-event-filter="${key}"><i class="fa-solid ${icon}"></i> ${label}</button>`)
      .join('');
    $('#events-content').before(bar);
  }

  async ensureEvents() {
    const { countryCode, city, eventsKey } = this.state;
    if (!countryCode || !city) return;
    if (eventsKey === `${countryCode}:${city}`) return;

    const token = this.token;
    this.setLoading(true, `Loading events in ${city}...`);
    try {
      await this.loadEvents(token);
    } finally {
      this.setLoading(false);
    }
  }

  async loadEvents(token) {
    const { countryCode, city } = this.state;
    const container = $('#events-content');
    const filters = $('#events-filters');

    if (!CONFIG.ticketmasterKey || CONFIG.ticketmasterKey.startsWith('YOUR_')) {
      filters.classList.add('hidden');
      container.innerHTML = emptyState({ icon: 'fa-key', title: 'Ticketmaster key missing', text: 'Add your API key to CONFIG.ticketmasterKey at the top of main.js.' });
      return;
    }

    try {
      const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${CONFIG.ticketmasterKey}&city=${enc(city)}&countryCode=${countryCode}&size=20`;
      const data = await this.fetchJSON(url);
      if (token !== this.token) return;

      this.state.events = (data._embedded?.events ?? []).map((ev) => this.normalizeEvent(ev));
      this.state.eventsKey = `${countryCode}:${city}`;
      this.state.eventFilter = 'all';

      const total = data.page?.totalElements ?? this.state.events.length;
      $('#stat-events').textContent = total.toLocaleString('en-US');
      const label = $('#stat-events').nextElementSibling;
      if (label) label.textContent = `Events in ${city}`;

      this.renderEvents();
    } catch (err) {
      console.error(err);
      if (token !== this.token) return;
      this.state.events = null;
      this.state.eventsKey = null;
      filters.classList.add('hidden');
      container.innerHTML = emptyState({
        icon: 'fa-triangle-exclamation',
        title: 'Could not load events',
        text: err.status === 401 ? 'The Ticketmaster API key was rejected.' : err.message,
      });
    }
  }

  normalizeEvent(ev) {
    const venue = ev._embedded?.venues?.[0];
    const image = [...(ev.images ?? [])].filter((i) => i.width >= 300).sort((a, b) => a.width - b.width)[0] ?? ev.images?.[0];
    return {
      id: ev.id,
      name: ev.name,
      url: ev.url,
      image: image?.url,
      category: ev.classifications?.[0]?.segment?.name ?? 'Event',
      date: ev.dates?.start?.localDate,
      time: ev.dates?.start?.localTime?.slice(0, 5),
      venue: venue?.name,
      city: venue?.city?.name,
    };
  }

  setEventFilter(key) {
    this.state.eventFilter = key;
    this.renderEvents();
  }

  renderEvents() {
    const { events, eventFilter, city } = this.state;
    const container = $('#events-content');
    const filters = $('#events-filters');

    if (!events?.length) {
      filters.classList.add('hidden');
      container.innerHTML = emptyState({ icon: 'fa-ticket', title: 'No events found', text: `Ticketmaster has no upcoming events listed for ${city}. Try a major city in the US, UK, Germany or Canada.` });
      return;
    }

    filters.classList.remove('hidden');
    $$('[data-event-filter]', filters).forEach((btn) => btn.classList.toggle('active', btn.dataset.eventFilter === eventFilter));

    const visible = events.filter((ev) => EVENT_FILTERS[eventFilter](ev.category));
    container.innerHTML = visible.length
      ? visible.map((ev) => this.eventCard(ev)).join('')
      : emptyState({ icon: 'fa-filter', title: 'Nothing in this category', text: 'Try another category to see more events.' });
  }

  eventCard(ev) {
    const date = ev.date ? parseDate(ev.date) : null;
    const when = date
      ? `${fmtDate(date, { month: 'short', day: 'numeric', year: 'numeric' })}${ev.time ? ` at ${ev.time}` : ''}`
      : 'Date to be announced';
    const where = [ev.venue, ev.city].filter(Boolean).join(', ') || 'Venue to be announced';

    const plan = this.register({
      id: `event-${ev.id}`,
      type: 'event',
      title: ev.name,
      subtitle: where,
      date: ev.date,
      url: ev.url,
      country: this.state.country.name.common,
    });

    return `
      <div class="event-card">
        <div class="event-card-image">
          ${ev.image ? `<img src="${esc(ev.image)}" alt="${esc(ev.name)}" loading="lazy">` : ''}
          <span class="event-card-category">${esc(ev.category)}</span>
          ${this.saveButton(plan.id, 'event-card-save')}
        </div>
        <div class="event-card-body">
          <h3>${esc(ev.name)}</h3>
          <div class="event-card-info">
            <div><i class="fa-regular fa-calendar"></i>${esc(when)}</div>
            <div><i class="fa-solid fa-location-dot"></i>${esc(where)}</div>
          </div>
          <div class="event-card-footer">
            ${this.saveButton(plan.id, 'btn-event', true)}
            <a href="${esc(ev.url)}" target="_blank" rel="noopener noreferrer" class="btn-buy-ticket">
              <i class="fa-solid fa-ticket"></i> Buy Tickets
            </a>
          </div>
        </div>
      </div>`;
  }

  /* ---------- Currency ---------- */

  ensureRates() {
    if (this.state.rates) return Promise.resolve(this.state.rates);
    if (this.ratesPromise) return this.ratesPromise;

    const key = CONFIG.exchangeRateKey;
    const url = key
      ? `https://v6.exchangerate-api.com/v6/${key}/latest/USD`
      : 'https://open.er-api.com/v6/latest/USD';

    this.ratesPromise = this.fetchJSON(url)
      .then((data) => {
        if (data.result !== 'success') throw new Error(data['error-type'] || 'Exchange rates unavailable');
        this.state.rates = data.conversion_rates ?? data.rates;
        this.state.ratesUpdated = data.time_last_update_utc;
        this.populateCurrencySelects();
        return this.state.rates;
      })
      .finally(() => { this.ratesPromise = null; });

    return this.ratesPromise;
  }

  populateCurrencySelects() {
    const codes = Object.keys(this.state.rates).sort();
    let names;
    try { names = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch { names = null; }
    const options = codes.map((c) => `<option value="${c}">${c} - ${esc(names?.of(c) ?? c)}</option>`).join('');

    const from = $('#currency-from');
    const to = $('#currency-to');
    const prev = { from: from.value, to: to.value };
    from.innerHTML = options;
    to.innerHTML = options;
    from.value = codes.includes(prev.from) ? prev.from : 'USD';
    to.value = codes.includes(prev.to) ? prev.to : 'EUR';
  }

  async syncCurrency(token) {
    try {
      const rates = await this.ensureRates();
      if (token !== this.token) return;

      const code = Object.keys(this.state.country.currencies ?? {})[0];
      if (code && rates[code]) {
        $('#currency-to').value = code;
        if ($('#currency-from').value === code) $('#currency-from').value = code === 'USD' ? 'EUR' : 'USD';
      }
      await this.convert();
    } catch (err) {
      console.error(err); // the currency view shows its own error when opened
    }
  }

  async convert() {
    const resultEl = $('#currency-result');
    const amount = parseFloat($('#currency-amount').value);
    if (Number.isNaN(amount) || amount < 0) return this.toast('Enter a valid amount.', 'warning');

    let rates;
    try {
      rates = await this.ensureRates();
    } catch (err) {
      resultEl.innerHTML = emptyState({ icon: 'fa-triangle-exclamation', title: 'Rates unavailable', text: err.message });
      return;
    }

    const from = $('#currency-from').value;
    const to = $('#currency-to').value;
    const rate = rates[to] / rates[from];
    const money = (n, digits = 2) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const updated = this.state.ratesUpdated ? fmtDate(new Date(this.state.ratesUpdated), { month: 'long', day: 'numeric', year: 'numeric' }) : '';

    resultEl.innerHTML = `
      <div class="conversion-display">
        <div class="conversion-from"><span class="amount">${money(amount)}</span><span class="currency-code">${from}</span></div>
        <div class="conversion-equals"><i class="fa-solid fa-equals"></i></div>
        <div class="conversion-to"><span class="amount">${money(amount * rate)}</span><span class="currency-code">${to}</span></div>
      </div>
      <div class="exchange-rate-info">
        <p>1 ${from} = ${money(rate, 4)} ${to}</p>
        ${updated ? `<small>Last updated: ${updated}</small>` : ''}
      </div>`;

    this.renderPopularCurrencies(from);
  }

  renderPopularCurrencies(from) {
    const { rates, country, countryCode } = this.state;
    let names;
    try { names = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch { names = null; }

    const destCode = Object.keys(country?.currencies ?? {})[0];
    const codes = [...new Set([destCode, ...CONFIG.popularCurrencies])].filter((c) => c && rates[c] && c !== from);

    $('#popular-currencies').innerHTML = codes.map((code) => {
      const flag = code === destCode && countryCode ? countryCode.toLowerCase() : CONFIG.currencyFlags[code];
      return `
        <div class="popular-currency-card" data-currency="${code}" role="button" tabindex="0">
          ${flag ? `<img src="${flagUrl(flag, 40)}" alt="${code}" class="flag">` : ''}
          <div class="info"><div class="code">${code}</div><div class="name">${esc(names?.of(code) ?? code)}</div></div>
          <div class="rate">${(rates[code] / rates[from]).toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
        </div>`;
    }).join('');
  }

  swapCurrencies() {
    const from = $('#currency-from');
    const to = $('#currency-to');
    [from.value, to.value] = [to.value, from.value];
    this.convert();
  }

  /* ---------- My Plans ---------- */

  register(plan) {
    this.catalog.set(plan.id, plan);
    return plan;
  }

  isSaved(id) {
    return this.plans.some((p) => p.id === id);
  }

  heartMarkup(saved, withLabel) {
    return `<i class="fa-${saved ? 'solid' : 'regular'} fa-heart"></i>${withLabel ? (saved ? ' Saved' : ' Save') : ''}`;
  }

  saveButton(id, cls, withLabel = false) {
    const saved = this.isSaved(id);
    return `<button type="button" class="${cls}${saved ? ' saved' : ''}" data-plan-id="${esc(id)}" title="${saved ? 'Remove from' : 'Save to'} My Plans">${this.heartMarkup(saved, withLabel)}</button>`;
  }

  togglePlan(id) {
    const index = this.plans.findIndex((p) => p.id === id);
    if (index >= 0) {
      this.plans.splice(index, 1);
      this.toast('Removed from My Plans', 'info');
    } else {
      const plan = this.catalog.get(id);
      if (!plan) return;
      this.plans.unshift(plan);
      this.toast('Saved to My Plans', 'success');
    }

    writeStore(CONFIG.storage.plans, this.plans);
    this.syncPlanUI(id);
    if (this.state.view === 'my-plans') this.renderPlans();
  }

  syncPlanUI(changedId) {
    const total = this.plans.length;
    const badge = $('#plans-count');
    badge.textContent = total;
    badge.classList.toggle('hidden', total === 0);
    $('#stat-saved').textContent = total;

    const count = (type) => this.plans.filter((p) => p.type === type).length;
    $('#filter-all-count').textContent = total;
    $('#filter-holiday-count').textContent = count('holiday');
    $('#filter-event-count').textContent = count('event');
    $('#filter-lw-count').textContent = count('longweekend');

    $$('[data-plan-id]').forEach((btn) => {
      if (changedId && btn.dataset.planId !== changedId) return;
      const saved = this.isSaved(btn.dataset.planId);
      btn.classList.toggle('saved', saved);
      btn.title = `${saved ? 'Remove from' : 'Save to'} My Plans`;
      btn.innerHTML = this.heartMarkup(saved, btn.classList.contains('btn-event'));
    });
  }

  setPlanFilter(filter) {
    this.state.planFilter = filter;
    this.renderPlans();
  }

  renderPlans() {
    const { planFilter } = this.state;
    $$('.plan-filter[data-filter]').forEach((btn) => btn.classList.toggle('active', btn.dataset.filter === planFilter));

    const container = $('#plans-content');
    const list = planFilter === 'all' ? this.plans : this.plans.filter((p) => p.type === planFilter);

    if (!list.length) {
      container.innerHTML = this.plans.length
        ? emptyState({ icon: 'fa-filter', title: 'Nothing here yet', text: 'You have no saved plans in this category.' })
        : emptyState({ icon: 'fa-heart-crack', title: 'No Saved Plans Yet', text: 'Start exploring and save holidays, events, or long weekends you like!', goto: 'dashboard', gotoLabel: 'Start Exploring' });
      return;
    }

    container.innerHTML = list.map((plan) => {
      const date = plan.date ? parseDate(plan.date) : null;
      const box = date
        ? `<div class="holiday-date-box"><span class="day">${date.getDate()}</span><span class="month">${fmtDate(date, { month: 'short' })}</span></div>`
        : '<div class="holiday-date-box"><i class="fa-solid fa-ticket"></i></div>';

      return `
        <div class="holiday-card">
          <div class="holiday-card-header">${box}${this.saveButton(plan.id, 'holiday-action-btn')}</div>
          <h3>${esc(plan.title)}</h3>
          <p class="holiday-name">${esc(plan.subtitle)}</p>
          <div class="holiday-card-footer">
            <span class="holiday-day-badge"><i class="fa-solid fa-location-dot"></i> ${esc(plan.country ?? '')}</span>
            <span class="holiday-type-badge">${PLAN_LABELS[plan.type]}</span>
          </div>
          ${plan.url ? `<a href="${esc(plan.url)}" target="_blank" rel="noopener noreferrer" class="btn-buy-ticket"><i class="fa-solid fa-ticket"></i> Buy Tickets</a>` : ''}
        </div>`;
    }).join('');
  }

  async clearPlans() {
    if (!this.plans.length) return;

    const confirmed = typeof Swal !== 'undefined'
      ? (await Swal.fire({
        title: 'Clear all saved plans?',
        text: 'This cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, clear them',
      })).isConfirmed
      : window.confirm('Clear all saved plans?');
    if (!confirmed) return;

    this.plans = [];
    writeStore(CONFIG.storage.plans, this.plans);
    this.syncPlanUI();
    this.renderPlans();
    this.toast('All plans cleared', 'success');
  }
}

new WanderlustApp().init();