let locations = [];
let selectedDays = new Set();
let searchQuery = '';
let map = null;
let markers = [];
let currentView = 'list';
let todayFilterActive = false;
let tomorrowFilterActive = false;
let thisWeekFilterActive = false;

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const today = dayNames[new Date().getDay()];

// Calculate which week of the month a date falls in
function getWeekOfMonth(date) {
    const day = date.getDate();
    
    // Calculate which occurrence (1st, 2nd, 3rd, 4th)
    const occurrence = Math.ceil(day / 7);
    
    // Check if it's the last occurrence
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const isLast = (day + 7) > lastDayOfMonth;
    
    return { occurrence, isLast };
}

// Check if a location is actually open today based on frequency
function isOpenToday(location) {
    const todayDate = new Date();
    const dayName = dayNames[todayDate.getDay()];
    
    // Check if location is open on this day of week
    if (!location[dayName]) return false;
    
    // Get frequency pattern
    const frequency = location.frequency && location.frequency[dayName];
    if (!frequency || frequency === '') return true; // If no frequency specified, assume weekly
    
    // If weekly, always true
    if (frequency.toLowerCase() === 'weekly') return true;
    
    // Calculate which week we're in
    const { occurrence, isLast } = getWeekOfMonth(todayDate);
    
    // Check if 'last' and it is the last occurrence
    if (frequency.toLowerCase().includes('last') && isLast) return true;
    
    // Split comma-separated values (e.g., "1st,3rd")
    const patterns = frequency.split(/,|\band\b|&/).map(p => p.trim().toLowerCase()).filter(Boolean);
    
    // Check if current occurrence matches
    const occurrenceStr = ['', '1st', '2nd', '3rd', '4th', '5th'][occurrence];
    if (patterns.includes(occurrenceStr)) return true;
    if (patterns.includes(occurrence.toString())) return true;
    
    return false;
}

// Check if a location is open tomorrow based on frequency
function isOpenTomorrow(location) {
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const dayName = dayNames[tomorrowDate.getDay()];

    if (!location[dayName]) return false;

    const frequency = location.frequency && location.frequency[dayName];
    if (!frequency || frequency === '') return true;
    if (frequency.toLowerCase() === 'weekly') return true;

    const { occurrence, isLast } = getWeekOfMonth(tomorrowDate);

    if (frequency.toLowerCase().includes('last') && isLast) return true;

    const patterns = frequency.split(/,|\band\b|&/).map(p => p.trim().toLowerCase()).filter(Boolean);
    const occurrenceStr = ['', '1st', '2nd', '3rd', '4th', '5th'][occurrence];
    if (patterns.includes(occurrenceStr)) return true;
    if (patterns.includes(occurrence.toString())) return true;

    return false;
}

// Check if a location is open on any remaining day this week (today through Sunday)
function isOpenThisWeek(location) {
    const todayIndex = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat

    // Build day indices from today through Saturday, then append Sunday (0) at the end
    // unless today is already Sunday, in which case Sunday is already covered
    const remainingDayIndices = [];
    for (let i = todayIndex; i <= 6; i++) remainingDayIndices.push(i);
    if (todayIndex !== 0) remainingDayIndices.push(0); // Sunday comes after Saturday

    return remainingDayIndices.some((dayIndex, offset) => {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() + offset);
        const dayName = dayNames[dayIndex];

        if (!location[dayName]) return false;

        const frequency = location.frequency && location.frequency[dayName];
        if (!frequency || frequency === '') return true;
        if (frequency.toLowerCase() === 'weekly') return true;

        const { occurrence, isLast } = getWeekOfMonth(checkDate);

        if (frequency.toLowerCase().includes('last') && isLast) return true;

        const patterns = frequency.split(/,|\band\b|&/).map(p => p.trim().toLowerCase()).filter(Boolean);
        const occurrenceStr = ['', '1st', '2nd', '3rd', '4th', '5th'][occurrence];
        if (patterns.includes(occurrenceStr)) return true;
        if (patterns.includes(occurrence.toString())) return true;

        return false;
    });
}

async function loadLocations() {
    try {
        const response = await fetch('feeding_sd_locations.json');
        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                locations = data;
                document.getElementById('lastUpdated').textContent = new Date().toLocaleDateString();
            }
        }
    } catch (error) {
        console.error('Could not load feeding_sd_locations.json:', error);
            document.getElementById('listView').innerHTML = `
                <div class="no-results" style="grid-column: 1/-1;">
                    <h3>⚠️ Could not load locations</h3>
                    <p>Make sure <strong>feeding_sd_locations.json</strong> is in the same folder as this page.</p>
                </div>`;
            document.getElementById('resultsCount').textContent = 'Error loading data';
            return;
    }
    renderLocations();
}

function renderLocations() {
    const filteredLocations = filterLocations();
    
    document.getElementById('resultsCount').textContent = 
        `Showing ${filteredLocations.length} location${filteredLocations.length !== 1 ? 's' : ''}`;

    if (currentView === 'list') {
        renderListView(filteredLocations);
    } else {
        renderMapView(filteredLocations);
    }
}

function renderListView(filteredLocations) {
    const grid = document.getElementById('listView');

    if (filteredLocations.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <h3>No locations found</h3>
                <p>Try adjusting your filters or search terms</p>
                <button class="reset-btn" onclick="resetFilters()">Reset Filters</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredLocations.map(loc => {
        const isActuallyOpenToday = isOpenToday(loc);
        return `
            <article class="location-card" aria-label="${loc.name || 'Food distribution location'}">
                ${isActuallyOpenToday ? '<div class="open-now-badge" aria-label="Open today">OPEN TODAY</div>' : ''}
                <div class="location-name">${loc.name || 'Unknown Location'}</div>
                
                ${loc.location ? `
                    <div class="location-detail">
                        <span class="location-detail-icon" aria-hidden="true">📍</span>
                        <span>${loc.location}, ${loc.city}, CA, ${loc.zip}</span>
                    </div>
                ` : ''}
                
                ${loc.schedule ? `
                    <div class="location-detail">
                        <span class="location-detail-icon" aria-hidden="true">🕒</span>
                        <span>${loc.schedule}</span>
                    </div>
                ` : ''}
                
                ${loc.type ? `
                    <div class="location-detail">
                        <span class="location-detail-icon" aria-hidden="true">🏪</span>
                        <span>${loc.type}</span>
                    </div>
                ` : ''}
                
                ${loc.eligibility ? `
                    <div class="location-detail">
                        <span class="location-detail-icon" aria-hidden="true">ℹ️</span>
                        <span>${loc.eligibility}</span>
                    </div>
                ` : ''}
                
                ${loc.phone ? `
                    <div class="location-detail">
                        <span class="location-detail-icon" aria-hidden="true">📞</span>
                        <span>${loc.phone}</span>
                    </div>
                ` : ''}
                
                <div class="location-days">
                    <div style="font-size: 0.75rem; color: #666; font-weight: 600;">Open:</div>
                    <div class="location-days-grid">
                    ${dayNames.map(day => {
                        if (loc[day]) {
                            const isSelected = selectedDays.has(day);
                            const hours = loc.hours && loc.hours[day] ? loc.hours[day] : '';
                            const displayText = hours ? `${day.slice(0, 3).toUpperCase()}: ${hours}` : day.slice(0, 3).toUpperCase();
                            const fullLabel = `${day.charAt(0).toUpperCase() + day.slice(1)}${hours ? ': ' + hours : ''}`;
                            return `<span class="day-badge ${isSelected ? 'active-day' : ''}" aria-label="${fullLabel}">${displayText}</span>`;
                        }
                        return '';
                    }).join('')}
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function renderMapView(filteredLocations) {
    if (!map) {
        map = L.map('mapView').setView([32.7157, -117.1611], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    }

    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    // Add new markers
    filteredLocations.forEach(loc => {
        if (loc.lat && loc.lng) {
            const marker = L.marker([loc.lat, loc.lng]).addTo(map);
            
            // Build hours display
            let hoursHTML = '';
            if (loc.hours) {
                const openDays = dayNames.filter(day => loc[day] && loc.hours[day]);
                if (openDays.length > 0) {
                    hoursHTML = '<div class="popup-detail">🕒 ' + 
                        openDays.map(day => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${loc.hours[day]}`).join('<br>&nbsp;&nbsp;&nbsp;&nbsp;') + 
                        '</div>';
                } else if (loc.schedule) {
                    hoursHTML = `<div class="popup-detail">🕒 ${loc.schedule}</div>`;
                }
            } else if (loc.schedule) {
                hoursHTML = `<div class="popup-detail">🕒 ${loc.schedule}</div>`;
            }
            
            const popupContent = `
                <div class="popup-name">${loc.name}</div>
                ${loc.location ? `<div class="popup-detail">📍 ${loc.location}, ${loc.city}, CA, ${loc.zip}</div>` : ''}
                ${hoursHTML}
                ${loc.type ? `<div class="popup-detail">🏪 ${loc.type}</div>` : ''}
            `;
            
            marker.bindPopup(popupContent);
            markers.push(marker);
        }
    });

    // Fit bounds to show all markers
    if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

function filterLocations() {
    return locations.filter(loc => {
        // Filter by "Open Today" if active
        if (todayFilterActive) {
            if (!isOpenToday(loc)) return false;
        }

        // Filter by "Open Tomorrow" if active
        if (tomorrowFilterActive) {
            if (!isOpenTomorrow(loc)) return false;
        }

        // Filter by "Open This Week" if active
        if (thisWeekFilterActive) {
            if (!isOpenThisWeek(loc)) return false;
        }

        // Filter by selected days
        if (selectedDays.size > 0) {
            const hasSelectedDay = Array.from(selectedDays).some(day => loc[day]);
            if (!hasSelectedDay) return false;
        }

        // Filter by search query
        if (searchQuery) {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = 
                (loc.name && loc.name.toLowerCase().includes(searchLower)) ||
                (loc.location && loc.location.toLowerCase().includes(searchLower)) ||
                (loc.address && loc.address.toLowerCase().includes(searchLower)) ||
                (loc.zip && loc.zip.includes(searchQuery));
            if (!matchesSearch) return false;
        }

        return true;
    });
}

function resetFilters() {
    selectedDays.clear();
    searchQuery = '';
    todayFilterActive = false;
    tomorrowFilterActive = false;
    thisWeekFilterActive = false;
    document.getElementById('searchBox').value = '';
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
    });
    document.querySelectorAll('.quick-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
    });
    renderLocations();
}

function selectWeekdays() {
    resetFilters();
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
        selectedDays.add(day);
        const btn = document.querySelector(`[data-day="${day}"]`);
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
    });
    const qBtn = document.querySelector('.quick-filter-btn[onclick="selectWeekdays()"]');
    qBtn.classList.add('active');
    qBtn.setAttribute('aria-pressed', 'true');
    renderLocations();
}

function selectWeekends() {
    resetFilters();
    ['saturday', 'sunday'].forEach(day => {
        selectedDays.add(day);
        const btn = document.querySelector(`[data-day="${day}"]`);
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
    });
    const qBtn = document.querySelector('.quick-filter-btn[onclick="selectWeekends()"]');
    qBtn.classList.add('active');
    qBtn.setAttribute('aria-pressed', 'true');
    renderLocations();
}

function selectToday() {
    resetFilters();
    todayFilterActive = true;
    const btn = document.querySelector('.quick-filter-btn[onclick="selectToday()"]');
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    renderLocations();
}

function selectTomorrow() {
    resetFilters();
    tomorrowFilterActive = true;
    const btn = document.querySelector('.quick-filter-btn[onclick="selectTomorrow()"]');
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    renderLocations();
}

function selectThisWeek() {
    resetFilters();
    thisWeekFilterActive = true;
    const btn = document.querySelector('.quick-filter-btn[onclick="selectThisWeek()"]');
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    renderLocations();
}

function sortLocations(sortBy) {
    locations.sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        return aVal.localeCompare(bVal);
    });
    renderLocations();
}

function exportToCSV() {
    const filteredLocations = filterLocations();
    const headers = ['Name', 'Location', 'Phone', 'Type', 'Schedule', 'Eligibility', 'Mon', 'Mon Hours', 'Tue', 'Tue Hours', 'Wed', 'Wed Hours', 'Thu', 'Thu Hours', 'Fri', 'Fri Hours', 'Sat', 'Sat Hours', 'Sun', 'Sun Hours'];
    
    const csvContent = [
        headers.join(','),
        ...filteredLocations.map(loc => [
            `"${loc.name || ''}"`,
            `"${loc.location || ''}"`,
            `"${loc.phone || ''}"`,
            `"${loc.type || ''}"`,
            `"${loc.schedule || ''}"`,
            `"${loc.eligibility || ''}"`,
            loc.monday ? 'Y' : 'N',
            `"${loc.hours && loc.hours.monday || ''}"`,
            loc.tuesday ? 'Y' : 'N',
            `"${loc.hours && loc.hours.tuesday || ''}"`,
            loc.wednesday ? 'Y' : 'N',
            `"${loc.hours && loc.hours.wednesday || ''}"`,
            loc.thursday ? 'Y' : 'N',
            `"${loc.hours && loc.hours.thursday || ''}"`,
            loc.friday ? 'Y' : 'N',
            `"${loc.hours && loc.hours.friday || ''}"`,
            loc.saturday ? 'Y' : 'N',
            `"${loc.hours && loc.hours.saturday || ''}"`,
            loc.sunday ? 'Y' : 'N',
            `"${loc.hours && loc.hours.sunday || ''}"`,
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `food_distributions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// Event listeners
document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const day = this.dataset.day;
        if (selectedDays.has(day)) {
            selectedDays.delete(day);
            this.classList.remove('active');
            this.setAttribute('aria-pressed', 'false');
        } else {
            selectedDays.add(day);
            this.classList.add('active');
            this.setAttribute('aria-pressed', 'true');
        }
        renderLocations();
    });
});

document.getElementById('searchBox').addEventListener('input', function(e) {
    searchQuery = e.target.value;
    renderLocations();
});

document.getElementById('sortSelect').addEventListener('change', function(e) {
    sortLocations(e.target.value);
});

// WCAG 4.1.2: view toggle buttons - guarded in case map view is disabled
const listViewBtn = document.getElementById('listViewBtn');
const mapViewBtn = document.getElementById('mapViewBtn');

if (listViewBtn) {
    listViewBtn.addEventListener('click', function() {
        currentView = 'list';
        document.getElementById('listView').style.display = 'grid';
        document.getElementById('mapView').style.display = 'none';
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
        mapViewBtn.classList.remove('active');
        mapViewBtn.setAttribute('aria-pressed', 'false');
        renderLocations();
    });
}

if (mapViewBtn) {
    mapViewBtn.addEventListener('click', function() {
        currentView = 'map';
        document.getElementById('listView').style.display = 'none';
        document.getElementById('mapView').style.display = 'block';
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
        listViewBtn.classList.remove('active');
        listViewBtn.setAttribute('aria-pressed', 'false');
        renderLocations();
        if (map) {
            setTimeout(() => map.invalidateSize(), 100);
        }
    });
}

// Initialize
loadLocations();