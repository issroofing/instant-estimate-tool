// Initialize MapLibre GL JS

// On DOM load, initialize the map

document.addEventListener('DOMContentLoaded', function () {
    const debug = false;
    const MAPTILER_API_KEY = "BkQkq2NwcJAaCLNx663p";

    // Multi-step wizard state
    let currentStep = 1;
    let selectedCategory = null;
    let selectedService = null;
    
    // Pricing database parsed from HTML
    let pricingDatabase = [];
    let categories = [];
    let services = {}; // keyed by category name

    // Parse the pricing database from HTML
    function parsePricingDatabase() {
        const options = document.querySelectorAll('.iq-pricing-database .iq-option');
        pricingDatabase = [];
        const categorySet = new Set();
        services = {};

        options.forEach(option => {
            const categoryName = option.querySelector('.iq-category-name')?.innerText?.trim() || '';
            const serviceName = option.querySelector('.iq-service-name')?.innerText?.trim() || '';
            const productName = option.querySelector('.iq-product-name')?.innerText?.trim() || '';
            const formulaLow = option.querySelector('.iq-price-formula-low')?.innerText?.trim() || '';
            const formulaHigh = option.querySelector('.iq-price-formula-high')?.innerText?.trim() || '';
            const brandLogo = option.querySelector('.iq-brand-logo')?.src || '';
            const productThumb = option.querySelector('.iq-product-thumbnail')?.src || '';

            const product = {
                category: categoryName,
                service: serviceName,
                product: productName,
                formulaLow: formulaLow,
                formulaHigh: formulaHigh,
                brandLogo: brandLogo,
                productThumb: productThumb
            };

            pricingDatabase.push(product);
            categorySet.add(categoryName);

            if (!services[categoryName]) {
                services[categoryName] = new Set();
            }
            services[categoryName].add(serviceName);
        });

        categories = Array.from(categorySet);
        
        // Convert service sets to arrays
        for (const cat in services) {
            services[cat] = Array.from(services[cat]);
        }

        console.log('Parsed pricing database:', pricingDatabase);
        console.log('Categories:', categories);
        console.log('Services:', services);
    }

    // Get required variables from product formulas
    function getRequiredVariables(category, service) {
        const relevantProducts = pricingDatabase.filter(p => 
            p.category === category && p.service === service
        );
        
        const variables = new Set();
        const variablePattern = /\{\{(\w+)\}\}/g;
        
        relevantProducts.forEach(product => {
            let match;
            while ((match = variablePattern.exec(product.formulaLow)) !== null) {
                variables.add(match[1]);
            }
            variablePattern.lastIndex = 0;
            while ((match = variablePattern.exec(product.formulaHigh)) !== null) {
                variables.add(match[1]);
            }
            variablePattern.lastIndex = 0;
        });
        
        return Array.from(variables);
    }

    // Evaluate a formula with given variables
    function evaluateFormula(formula, variables) {
        let expression = formula;
        
        // Replace all template variables with their values
        for (const [key, value] of Object.entries(variables)) {
            const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            expression = expression.replace(pattern, value);
        }
        
        // Safely evaluate the mathematical expression
        try {
            // Only allow numbers, operators, parentheses, and whitespace
            if (!/^[\d\s+\-*/().]+$/.test(expression)) {
                console.error('Invalid expression:', expression);
                return 0;
            }
            return Function('"use strict"; return (' + expression + ')')();
        } catch (e) {
            console.error('Error evaluating formula:', formula, e);
            return 0;
        }
    }

    // Category icons
    const categoryIcons = {
        'Roofing': '🏠',
        'Siding': '🧱',
        'Gutters': '🌧️'
    };

    // Initialize pricing database
    parsePricingDatabase();

    const map = new maplibregl.Map({
        container: 'iq-map',
        style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=' + MAPTILER_API_KEY,
        center: [-93.18215, 44.96401],
        zoom: 8,
        TerrainControl: true,
        fadeDuration: 0,
        minzoom: 0,
        maxzoom: 22,
    });

    if (debug === true) {
        console.log('Debug mode enabled');
        map.showTileBoundaries = true;
        map.showCollisionBoxes = true;
    }

    /*
    map.dragPan.disable();
    map.scrollZoom.disable();
    map.touchZoomRotate.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.doubleClickZoom.disable();
    */

    // Collapse the attribution control
    document.querySelector('.maplibregl-ctrl-attrib').classList.remove('maplibregl-compact-show');

    
    map.on('load', function () {

        map.addSource('satellite-source', {
            type: 'raster',
            tiles: ['https://api.maptiler.com/maps/satellite/{z}/{x}/{y}@2x.jpg?key=' + MAPTILER_API_KEY],
            tileSize: 512,
            attribution: '© MapTiler'
        });

        map.addLayer({
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite-source',
            minzoom: 15,
            maxzoom: 22
        });

        map.addSource('maptiler-world', {
            type: 'vector',
            url: 'https://api.maptiler.com/tiles/v3/tiles.json?key=BkQkq2NwcJAaCLNx663p'
        }, 'Road labels'); // Render underneath the lowest label layer in the map style

        map.addSource('buildings-buffer', {
            type: 'vector'
        });

        map.addLayer({
            'id': 'buffer-debug-layer',
            'type': 'fill',
            'source': 'buildings-buffer',
            'source-layer': 'building',
            'layout': {
                'visibility': 'none'
            },
            'paint': {
                'fill-color': '#ff0000',
                'fill-opacity': 0.5
            }
        });

        // Unselected buildings fill
        map.addLayer({
            'id': 'maptiler-world-layer',
            'type': 'vector',
            'source': 'maptiler-world',
            'source-layer': 'building',
            'layout': {
                'visibility': 'visible',
            },
            'type': 'fill',
            'minzoom': 15,
            'maxzoom': 22,
            'paint': {
                'fill-color': '#007aff',
                'fill-opacity': 0.1
            }
        });

        // Unselected buildings outline
        map.addLayer({
            'id': 'maptiler-world-outline',
            'type': 'line',
            'minzoom': 15,
            'maxzoom': 22,
            'source': 'maptiler-world',
            'source-layer': 'building',
            'paint': {
                'line-color': '#007aff',
                'line-width': 1.5,
                'line-opacity': 0.8,
                'line-dasharray': [2, 2]
            }
        });


        map.on('mouseenter', 'maptiler-world-layer', function (e) {
            map.getCanvas().style.cursor = 'pointer';
            // highlight the building

            //if the highlighted buildings layer is present, remove it
            if (map.getLayer('highlighted-building-layer')) {
                map.removeLayer('highlighted-building-layer');
            }
            if (map.getSource('highlighted-building')) {
                map.removeSource('highlighted-building');
            }

            // Add an outline layer for hovered buildings
            if (map.getLayer('highlighted-building-outline')) {
                map.removeLayer('highlighted-building-outline');
            }

            // First check if the user hovered inside a building in selectedBuildings
            const pointer = e.lngLat;
            for (let i = 0; i < selectedBuildings.length; i++) {
                const source = selectedBuildings[i].source;
                const layer = selectedBuildings[i].layer;
                const perimeter = map.getSource(source)._data.features[0].geometry.coordinates[0];
                if (turf.booleanPointInPolygon([pointer.lng, pointer.lat], turf.polygon([perimeter]))) {
                    return;
                }
            }

            // Find the polygon under the cursor
            const geometry = e.features[0].geometry;
            let hoveredPolygon = null;

            if (geometry.type === 'MultiPolygon') {
                const buildings = geometry.coordinates;
                for (let i = 0; i < buildings.length; i++) {
                    const perimeter = buildings[i][0];
                    if (turf.booleanPointInPolygon([pointer.lng, pointer.lat], turf.polygon([perimeter]))) {
                        hoveredPolygon = turf.polygon([perimeter]);
                        break;
                    }
                }
            } else if (geometry.type === 'Polygon') {
                const perimeter = geometry.coordinates[0];
                if (turf.booleanPointInPolygon([pointer.lng, pointer.lat], turf.polygon([perimeter]))) {
                    hoveredPolygon = turf.polygon([perimeter]);
                }
            }

            if (!hoveredPolygon) {
                return;
            }

            // Query all building features and merge adjacent fragments
            const allBuildingFeatures = map.querySourceFeatures('maptiler-world', {
                sourceLayer: 'building'
            });
            
            const mergedPolygon = findAndMergeAdjacentFragments(hoveredPolygon, allBuildingFeatures);
            const finalPerimeter = mergedPolygon.geometry.coordinates[0];

            map.addSource('highlighted-building', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [
                        {
                            type: 'Feature',
                            geometry: {
                                type: 'Polygon',
                                coordinates: [finalPerimeter]
                            }
                        }
                    ]
                }
            });

            map.addLayer({
                id: 'highlighted-building-layer',
                type: 'fill',
                source: 'highlighted-building',
                paint: {
                    'fill-color': '#007aff',
                    'fill-opacity': 0.1
                }
            });

            map.addLayer({
                id: 'highlighted-building-outline',
                type: 'line',
                source: 'highlighted-building',
                paint: {
                    'line-color': '#007aff',
                    'line-width': 3
                }
            });
        });
        
        map.on('mouseleave', 'maptiler-world-layer', function (e) {
            map.getCanvas().style.cursor = '';

            //if the highlighted buildings layer is present, remove it
            if (map.getLayer('highlighted-building-layer')) {
                map.removeLayer('highlighted-building-layer');
            }

            //if the highlighted buildings outline layer is present, remove it
            if (map.getLayer('highlighted-building-outline')) {
                map.removeLayer('highlighted-building-outline');
            }

            if (map.getSource('highlighted-building')) {
                map.removeSource('highlighted-building');
            }
        });

        // Clicking on a building display the coordinates of the building in the console
        map.on('click', 'maptiler-world-layer', function (e) {

            //if the highlighted buildings layer is present, remove it
            if (map.getLayer('highlighted-building-layer')) {
                map.removeLayer('highlighted-building-layer');
            }
            if (map.getLayer('highlighted-building-outline')) {
                map.removeLayer('highlighted-building-outline');
            }
            if (map.getSource('highlighted-building')) {
                map.removeSource('highlighted-building');
            }

            const pointer = e.lngLat;
            // First check if the user clicked inside a building in selectedBuildings
            for (let i = 0; i < selectedBuildings.length; i++) {
                const sourceName = selectedBuildings[i].source;
                const layerFillName = selectedBuildings[i].layerFill;
                const layerOutlineName = selectedBuildings[i].layerOutline;
                const layerLabelName = selectedBuildings[i].layerLabel;
                const perimeter = map.getSource(sourceName)._data.features[0].geometry.coordinates[0];
                if (turf.booleanPointInPolygon([pointer.lng, pointer.lat], turf.polygon([perimeter]))) {
                    console.log('Clicked on a selected building');
                    // remove the building from the selectedBuildings array and remove the layer from the map
                    map.removeLayer(layerFillName);
                    map.removeLayer(layerOutlineName);
                    map.removeLayer(layerLabelName);
                    map.removeSource(sourceName);
                    selectedBuildings.splice(i, 1);

                    // Update labels
                    for (let j = 0; j < selectedBuildings.length; j++) {
                        const sourceLabelName = selectedBuildings[j].sourceLabel;
                        const centerPoint = selectedBuildings[j].center;
                        map.getSource(sourceLabelName).setData({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: centerPoint.geometry.coordinates
                            },
                            properties: {
                                title: logicalIndex(j) + ' Structure'
                            }
                        });
                    }
                    
                    updateStructureListUI();
                    updateGetQuoteButton();

                    console.log(selectedBuildings);
                    return;
                }
            }

            //Add selected building from lnglat
            selectBuildingAtLngLat(pointer.lng, pointer.lat);

        });

        //Geocoder initializer
        const gc = new maplibreglMaptilerGeocoder.GeocodingControl({
            apiKey: MAPTILER_API_KEY,
            maplibregl,
            country: 'us',
            noResultsMessage: 'No results found.',
            placeholder: `Enter your address to see your price`,
            types: ['address'],
            proximity: [-93.18215, 44.96401],
            showFullGeometry: false
        });

        gc.on('pick', function (e) {

            // Return if the feature is not a building
            // Necessary because clicking the clear button fires a pick event with no feature for some reason
            if (!e.feature || !e.feature.geometry.coordinates) {
                return;
            }

            const coords = e.feature.geometry.coordinates
            const marker = document.querySelector('.maplibregl-marker');
            const pin = marker.querySelector('svg');
            const pinPath = pin.querySelector('path');
            pinPath.style.fill = '#ffffff';
            pinPath.style.stroke = '#0a84ff';
            // move the pin up by 10px
            // pin.style.transform = 'translateY(-25px)';

            map.flyTo({
                center: coords,
                zoom: 18,
                speed: 3
            });

            setTimeout(() => {
                // wait until the map is idle again
                map.once('idle', function () {
                    // Set the map to interactive
                    map.dragPan.enable();
                    map.scrollZoom.enable();
                    map.touchZoomRotate.enable();
                    map.boxZoom.enable();
                    map.keyboard.enable();
                    map.doubleClickZoom.enable();

                    selectBuildingAtLngLat(coords[0], coords[1]);
                });
            }, 10);
            
        });


        document.getElementById('iq-top-container').appendChild(gc.onAdd(map));

        // Geocoder reset button event listener (clear the map markers and reset the view)
        const clearButton = document.querySelector('.maplibregl-ctrl-geocoder .clear-button-container button');
        clearButton.addEventListener('click', function() {
            const marker = document.querySelector('.maplibregl-marker');
            if (marker) {
                marker.remove();
            }
            // Remove all selected buildings
            selectedBuildings.forEach(function (building) {
                map.removeLayer(building.layerFill);
                map.removeLayer(building.layerOutline);
                map.removeLayer(building.layerLabel)
                map.removeSource(building.source);
                map.removeSource(building.sourceLabel);
            });
            selectedBuildings = [];
            updateStructureListUI();
            updateGetQuoteButton();
        });

        // Geocoder input event listener
        // If the input is cleared, remove the marker and any selected buildings
        const input = document.querySelector('.maplibregl-ctrl-geocoder input');
        input.addEventListener('input', function() {
            if (input.value === '') {
                // remove the marker
                const marker = document.querySelector('.maplibregl-marker');
                if (marker) {
                    marker.remove();
                }
                // Remove all selected buildings
                selectedBuildings.forEach(function (building) {
                    map.removeLayer(building.layerFill);
                    map.removeLayer(building.layerOutline);
                    map.removeLayer(building.layerLabel)
                    map.removeSource(building.source);
                    map.removeSource(building.sourceLabel);
                });
                selectedBuildings = [];
                updateStructureListUI();
                updateGetQuoteButton();
            }
        });

        // Add navigation control (zoom buttons)
        map.addControl(new maplibregl.NavigationControl());

        // Add geolocate control
        map.addControl(new maplibregl.GeolocateControl({
            positionOptions: {
                enableHighAccuracy: true
            },
            trackUserLocation: true
        }));

    });

    var buildingUUID = 0;
    var selectedBuildings = [];

    // Render step 1: Categories
    function renderCategories() {
        const container = document.getElementById('iq-category-list');
        container.innerHTML = '';
        
        categories.forEach(category => {
            const card = document.createElement('div');
            card.className = 'iq-option-card';
            card.innerHTML = `
                <span class="iq-option-card-icon">${categoryIcons[category] || '📋'}</span>
                <span>${category}</span>
            `;
            card.addEventListener('click', () => {
                selectedCategory = category;
                goToStep(2);
            });
            container.appendChild(card);
        });
    }

    // Render step 2: Services
    function renderServices() {
        const container = document.getElementById('iq-service-list');
        container.innerHTML = '';
        
        const availableServices = services[selectedCategory] || [];
        
        availableServices.forEach(service => {
            const card = document.createElement('div');
            card.className = 'iq-option-card';
            card.textContent = service;
            card.addEventListener('click', () => {
                selectedService = service;
                goToStep(3);
            });
            container.appendChild(card);
        });
    }

    // Navigation button event listeners
    const backStep2Button = document.getElementById('iq-back-step2');
    const backStep3Button = document.getElementById('iq-back-step3');
    const nextStep3Button = document.getElementById('iq-next-step3');
    const backStep4Button = document.getElementById('iq-back-step4');
    const nextStep4Button = document.getElementById('iq-next-step4');
    const backStep5Button = document.getElementById('iq-back-step5');
    const startOverButton = document.getElementById('iq-start-over');

    backStep2Button.addEventListener('click', function () {
        goToStep(1);
    });

    backStep3Button.addEventListener('click', function () {
        goToStep(2);
    });

    nextStep3Button.addEventListener('click', function () {
        goToStep(4);
    });

    backStep4Button.addEventListener('click', function () {
        goToStep(3);
    });

    nextStep4Button.addEventListener('click', function () {
        goToStep(5);
    });

    backStep5Button.addEventListener('click', function () {
        goToStep(4);
    });

    startOverButton.addEventListener('click', function () {
        // Clear everything and start over
        const clearButton = document.querySelector('.maplibregl-ctrl-geocoder .clear-button-container button');
        if (clearButton) {
            clearButton.click();
        }
        selectedCategory = null;
        selectedService = null;
        goToStep(1);
    });

    function goToStep(step) {
        currentStep = step;

        // Update step indicator
        const steps = document.querySelectorAll('.iq-step');
        steps.forEach((stepEl, index) => {
            stepEl.classList.remove('iq-step-active', 'iq-step-completed');
            if (index + 1 < step) {
                stepEl.classList.add('iq-step-completed');
            } else if (index + 1 === step) {
                stepEl.classList.add('iq-step-active');
            }
        });

        // Update views
        const views = document.querySelectorAll('.iq-view');
        views.forEach((view, index) => {
            view.classList.remove('iq-view-active');
            if (index + 1 === step) {
                view.classList.add('iq-view-active');
            }
        });

        // Step-specific logic
        if (step === 1) {
            renderCategories();
        } else if (step === 2) {
            renderServices();
        } else if (step === 3) {
            // Resize map when going to step 3
            setTimeout(() => {
                map.resize();
            }, 100);
        } else if (step === 4) {
            updateStructureListUI();
            updateStep4Button();
        } else if (step === 5) {
            renderPricing();
        }
    }

    function updateStep3Button() {
        nextStep3Button.disabled = selectedBuildings.length === 0;
        
        // Update selected summary
        const summary = document.getElementById('iq-selected-summary');
        if (selectedBuildings.length === 0) {
            summary.textContent = '';
        } else if (selectedBuildings.length === 1) {
            summary.textContent = '1 structure selected';
        } else {
            summary.textContent = selectedBuildings.length + ' structures selected';
        }
    }

    function updateStep4Button() {
        const requiredVars = getRequiredVariables(selectedCategory, selectedService);
        let allAnswered = true;
        
        for (let i = 0; i < selectedBuildings.length; i++) {
            const building = selectedBuildings[i];
            
            if (requiredVars.includes('roofArea') && !building.roofPitch) {
                allAnswered = false;
                break;
            }
            if (requiredVars.includes('wallArea') && !building.stories) {
                allAnswered = false;
                break;
            }
            if (requiredVars.includes('gutterLength') && !building.gutterPercent) {
                allAnswered = false;
                break;
            }
        }
        
        nextStep4Button.disabled = !allAnswered;
    }

    function renderPricing() {
        cleanupMiniMaps();
        const breakdownContainer = document.getElementById('iq-pricing-breakdown');
        
        // Update subtitle
        const subtitle = document.getElementById('iq-step5-subtitle');
        subtitle.textContent = `Here's your instant ${selectedService.toLowerCase()} estimate`;
        
        breakdownContainer.innerHTML = '';
        
        // Get relevant products for this service
        const relevantProducts = pricingDatabase.filter(p => 
            p.category === selectedCategory && p.service === selectedService
        );

        for (let i = 0; i < selectedBuildings.length; i++) {
            const building = selectedBuildings[i];
            
            // Calculate variables for this building
            const buildingArea = building.area; // square feet
            const perimeterMeters = turf.length(turf.lineString(building.polygon), { units: 'meters' });
            const perimeterFeet = perimeterMeters * 3.28084;
            
            // Calculate roofArea based on pitch
            let roofArea = buildingArea;
            let pitchLabel = '';
            if (building.roofPitch === 'shallow') {
                roofArea = buildingArea * 1.1;
                pitchLabel = 'Shallow pitch';
            } else if (building.roofPitch === 'medium') {
                roofArea = buildingArea * 1.2;
                pitchLabel = 'Medium pitch';
            } else if (building.roofPitch === 'steep') {
                roofArea = buildingArea * 1.3;
                pitchLabel = 'Steep pitch';
            }
            
            // Calculate wallArea based on stories
            let wallArea = 0;
            let storiesLabel = '';
            if (building.stories) {
                const height = building.stories * 10; // 10 ft per story
                wallArea = perimeterFeet * height;
                storiesLabel = building.stories + (building.stories === 1 ? ' story' : ' stories');
            }
            
            // Calculate gutterLength based on percentage
            let gutterLength = 0;
            let gutterLabel = '';
            if (building.gutterPercent) {
                gutterLength = perimeterFeet * (building.gutterPercent / 100);
                gutterLabel = building.gutterPercent + '% coverage';
            }
            
            const variables = {
                roofArea: roofArea,
                wallArea: wallArea,
                gutterLength: gutterLength
            };
            
            // Build detail string
            const areaSqft = Math.round(buildingArea).toLocaleString();
            let detailParts = [areaSqft + ' ft²'];
            if (pitchLabel) detailParts.push(pitchLabel);
            if (storiesLabel) detailParts.push(storiesLabel);
            if (gutterLabel) detailParts.push(gutterLabel);
            const detailString = detailParts.join(' · ');
            
            const thumbnailId = 'pricing-structure-thumbnail-' + i;
            
            // Create structure section
            const structureDiv = document.createElement('div');
            structureDiv.className = 'iq-pricing-structure';
            
            let productsHTML = '';
            relevantProducts.forEach(product => {
                const priceLow = evaluateFormula(product.formulaLow, variables);
                const priceHigh = evaluateFormula(product.formulaHigh, variables);
                
                const priceLowFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(priceLow);
                const priceHighFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(priceHigh);
                
                productsHTML += `
                    <div class="iq-pricing-product">
                        <img class="iq-pricing-product-thumb" src="${product.productThumb}" alt="${product.product}">
                        <div class="iq-pricing-product-content">
                            <div class="iq-pricing-product-header">
                                <span class="iq-pricing-product-name">${product.product}</span>
                                <span class="iq-pricing-product-price">${priceLowFormatted} - ${priceHighFormatted}</span>
                            </div>
                            <img class="iq-pricing-product-brand" src="${product.brandLogo}" alt="">
                        </div>
                    </div>
                `;
            });
            
            structureDiv.innerHTML = `
                <div class="iq-pricing-structure-header">
                    <div class="iq-pricing-structure-thumbnail" id="${thumbnailId}"></div>
                    <div class="iq-pricing-structure-info">
                        <span class="iq-pricing-structure-name">${logicalIndex(i)} Structure</span>
                        <span class="iq-pricing-structure-details">${detailString}</span>
                    </div>
                </div>
                <div class="iq-pricing-products">
                    ${productsHTML}
                </div>
            `;
            
            breakdownContainer.appendChild(structureDiv);
            
            // Create thumbnail map
            createStructureThumbnail(thumbnailId, building.polygon, building.center);
        }
    }


    // Remove extraneous suggestions from the geocoder and clean up the address
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            const suggestions = document.querySelectorAll('.maplibregl-ctrl-geocoder form ul li');
            suggestions.forEach(function(suggestion) {
                if (suggestion.innerHTML.includes('street.svg')) {
                    suggestion.remove();
                }
                suggestionLine2s = suggestion.querySelectorAll('span span.line2');
                suggestionLine2s.forEach(function(suggestionLine2) {
                    if (suggestionLine2.innerHTML.includes('United States')) {
                        suggestionLine2.innerHTML = suggestionLine2.innerHTML.replace(', United States', '');
                    }
                });

            });

        });
    });
    observer.observe(document, {
        childList: true,
        subtree: true
    });


    // Store mini map instances for cleanup
    let miniMaps = [];

    function cleanupMiniMaps() {
        miniMaps.forEach(m => m.remove());
        miniMaps = [];
    }

    function createStructureThumbnail(containerId, polygon, center) {
        const miniMap = new maplibregl.Map({
            container: containerId,
            style: 'https://api.maptiler.com/maps/satellite/style.json?key=' + MAPTILER_API_KEY,
            center: center.geometry.coordinates,
            zoom: 18,
            interactive: false,
            attributionControl: false
        });

        miniMap.on('load', function() {
            miniMap.addSource('structure-polygon', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [polygon]
                    }
                }
            });

            miniMap.addLayer({
                id: 'structure-fill',
                type: 'fill',
                source: 'structure-polygon',
                paint: {
                    'fill-color': '#0a84ff',
                    'fill-opacity': 0.4
                }
            });

            miniMap.addLayer({
                id: 'structure-outline',
                type: 'line',
                source: 'structure-polygon',
                paint: {
                    'line-color': '#0a84ff',
                    'line-width': 2
                }
            });

            // Fit to bounds of the polygon with padding
            const bounds = new maplibregl.LngLatBounds();
            polygon.forEach(coord => bounds.extend(coord));
            miniMap.fitBounds(bounds, { padding: 20, duration: 0 });
        });

        miniMaps.push(miniMap);
        return miniMap;
    }

    function updateStructureListUI() {
        cleanupMiniMaps();
        const structureList = document.getElementById('iq-structure-list');
        structureList.innerHTML = '';
        
        // Get required variables for this service
        const requiredVars = getRequiredVariables(selectedCategory, selectedService);
        
        // Update subtitle based on required vars
        const subtitle = document.getElementById('iq-step4-subtitle');
        subtitle.textContent = 'Answer a few questions about each structure';
        
        for (let i = 0; i < selectedBuildings.length; i++) {
            const structure = selectedBuildings[i];
            const area = structure.area;
            const areaRounded = Math.round(area);
            const areaSqft = areaRounded.toLocaleString();
            const structureItem = document.createElement('div');
            structureItem.classList.add('iq-structure-item');
            structureItem.setAttribute('data-structure-index', i);
            const thumbnailId = 'structure-thumbnail-' + i;
            
            // Build questions HTML based on required variables
            let questionsHTML = '';
            
            if (requiredVars.includes('roofArea')) {
                questionsHTML += `
                    <div class="iq-question-group">
                        <span class="iq-visual-option-group-title">Roof pitch</span>
                        <div class="iq-visual-option-group" data-field="roofPitch" data-structure="${i}">
                            <div class="iq-visual-option${structure.roofPitch === 'shallow' ? ' iq-active' : ''}" data-value="shallow">
                                <svg width="100" height="100" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                <polygon points="0,120 100,60 200,120, 200,200, 0,200" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">Shallow</span>
                            </div>
                            <div class="iq-visual-option${structure.roofPitch === 'medium' ? ' iq-active' : ''}" data-value="medium">
                                <svg width="100" height="100" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                    <polygon points="0,120 100,30 200,120, 200,200, 0,200" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">Medium</span>
                            </div>
                            <div class="iq-visual-option${structure.roofPitch === 'steep' ? ' iq-active' : ''}" data-value="steep">
                                <svg width="100" height="100" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                    <polygon points="0,120 100,0 200,120, 200,200, 0,200" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">Steep</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            if (requiredVars.includes('wallArea')) {
                questionsHTML += `
                    <div class="iq-question-group">
                        <span class="iq-visual-option-group-title">Building height</span>
                        <div class="iq-visual-option-group" data-field="stories" data-structure="${i}">
                            <div class="iq-visual-option${structure.stories === 1 ? ' iq-active' : ''}" data-value="1">
                                <span class="iq-visual-option-title">1 Story</span>
                            </div>
                            <div class="iq-visual-option${structure.stories === 1.5 ? ' iq-active' : ''}" data-value="1.5">
                                <span class="iq-visual-option-title">1.5 Story</span>
                            </div>
                            <div class="iq-visual-option${structure.stories === 2 ? ' iq-active' : ''}" data-value="2">
                                <span class="iq-visual-option-title">2 Story</span>
                            </div>
                            <div class="iq-visual-option${structure.stories === 2.5 ? ' iq-active' : ''}" data-value="2.5">
                                <span class="iq-visual-option-title">2.5 Story</span>
                            </div>
                            <div class="iq-visual-option${structure.stories === 3 ? ' iq-active' : ''}" data-value="3">
                                <span class="iq-visual-option-title">3 Story</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            if (requiredVars.includes('gutterLength')) {
                questionsHTML += `
                    <div class="iq-question-group">
                        <span class="iq-visual-option-group-title">Gutter coverage</span>
                        <div class="iq-visual-option-group" data-field="gutterPercent" data-structure="${i}">
                            <div class="iq-visual-option${structure.gutterPercent === 25 ? ' iq-active' : ''}" data-value="25">
                                <span class="iq-visual-option-title">25%</span>
                            </div>
                            <div class="iq-visual-option${structure.gutterPercent === 50 ? ' iq-active' : ''}" data-value="50">
                                <span class="iq-visual-option-title">50%</span>
                            </div>
                            <div class="iq-visual-option${structure.gutterPercent === 75 ? ' iq-active' : ''}" data-value="75">
                                <span class="iq-visual-option-title">75%</span>
                            </div>
                            <div class="iq-visual-option${structure.gutterPercent === 100 ? ' iq-active' : ''}" data-value="100">
                                <span class="iq-visual-option-title">100%</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            structureItem.innerHTML = `
                <div class="iq-structure-thumbnail" id="${thumbnailId}"></div>
                <div class="iq-structure-item-info">
                    <h3 class="iq-structure-item-title">${logicalIndex(i)} Structure</h3>
                    <span class="iq-structure-item-area">${areaSqft} ft²</span>
                </div>
                <div class="iq-structure-questions">
                    ${questionsHTML}
                </div>
            `;
            structureList.appendChild(structureItem);

            // Create thumbnail map after element is in DOM
            createStructureThumbnail(thumbnailId, structure.polygon, structure.center);

            // Add event listeners for all option groups in this structure item
            const optionGroups = structureItem.querySelectorAll('.iq-visual-option-group');
            optionGroups.forEach(group => {
                const field = group.getAttribute('data-field');
                const structureIndex = parseInt(group.getAttribute('data-structure'));
                const options = group.querySelectorAll('.iq-visual-option');
                
                options.forEach(option => {
                    option.addEventListener('click', function() {
                        // Remove active from all options in this group
                        options.forEach(opt => opt.classList.remove('iq-active'));
                        // Add active to clicked option
                        option.classList.add('iq-active');
                        
                        // Get value and update building
                        let value = option.getAttribute('data-value');
                        
                        // Convert numeric values
                        if (field === 'stories' || field === 'gutterPercent') {
                            value = parseFloat(value);
                        }
                        
                        selectedBuildings[structureIndex][field] = value;
                        console.log('Updated building', structureIndex, field, value);
                        updateStep4Button();
                    });
                });
            });
        }
    }

    function updateGetQuoteButton() {
        // Update step 3 button (which is now the "Continue" button)
        updateStep3Button();
    }

    function logicalIndex(integer){

        // For 0, return Primary
        if (integer === 0){
            return 'Main';
        }

        // For all other numbers, return 2nd, 3rd, 45th, and so on
        integer += 1;
        const suffixes = ['th', 'st', 'nd', 'rd'];
        const suffix = suffixes[integer % 10] || suffixes[0];

        return integer + suffix;

    }


    // MARK: - getVisibleBuildings
    function getVisibleBuildings() {
        
        var visibleBuildings = [];
        const features = map.querySourceFeatures('maptiler-world', {
            sourceLayer: 'building'
        });
        features.forEach(feature => {
            var subfeatures = feature.geometry.coordinates
            subfeatures.forEach(subfeature => {
                if (subfeature[0].length > 2){
                    visibleBuildings.push(subfeature[0]);
                }
            });
        });
        return visibleBuildings;
    }

    function getTileForLatLon(lat, lon, zoom) {
        const latRad = lat * Math.PI / 180;
        const n = Math.pow(2, zoom);
        const xTile = Math.floor((lon + 180) / 360 * n);
        const yTile = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { z: zoom, x: xTile, y: yTile };
      }

    function getTileBounds(x, y, z) {
        const n = Math.pow(2, z);
        const lon1 = (x / n) * 360 - 180;
        const lat1 = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
        const lon2 = ((x + 1) / n) * 360 - 180;
        const lat2 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
        return [[lon1, lat1], [lon2, lat2]];
    }

    // MARK: - getBuildingsForTile
    async function getBuildingsForTile(x, y, z) {
        return new Promise((resolve, reject) => {
            var buildings = [];

            const tileURL = 'https://api.maptiler.com/tiles/v3/' + z + '/' + x + '/' + y + '.pbf?key=' + MAPTILER_API_KEY;
    
            console.log('Loading tile ' + x + ', ' + y + ' at zoom ' + z + ' from ' + tileURL);
            
            const tileName = 'tile-' + x + '-' + y + '-' + z;

    
            map.addSource(tileName + '-source', {
                type: 'vector',
                tiles: [tileURL],
                minzoom: 15,
                maxzoom: 15,
            });
    
            map.addLayer({
                'id': tileName + '-layer',
                'type': 'fill',
                'source': tileName + '-source',
                'source-layer': 'building',
                'paint': {
                    'fill-color': '#ff0000',
                    'fill-opacity': 0.5
                },
                'bounds': getTileBounds(x, y, z)
            });
    
            
            map.on('sourcedata', function (e) {
                if (e.sourceId === (tileName + '-source') && e.isSourceLoaded) {
                    const features = map.querySourceFeatures(tileName + '-source', {
                        sourceLayer: 'building'
                    });
    
                    features.forEach(feature => {
                        var subfeatures = feature.geometry.coordinates;
                        subfeatures.forEach(subfeature => {
                            if (subfeature[0].length > 2) {
                                buildings.push(subfeature[0]);
                            }
                        });
                    });

                    resolve(buildings);
                }
            });
        });
    }


    // MARK: - selectBuildingAtLngLat
    function selectBuildingAtLngLat(lng, lat) {
        const point = map.project([lng, lat]);
        const features = map.queryRenderedFeatures(point, { layers: ['maptiler-world-layer'] });

        if (features.length === 0) {
            return;
        }

        const feature = features[0];
        
        // Query all building features from the source for merging
        const allBuildingFeatures = map.querySourceFeatures('maptiler-world', {
            sourceLayer: 'building'
        });
        
        const geometry = feature.geometry;
        
        let clickedPolygon = null;

        if (geometry.type === 'MultiPolygon') {
            const buildings = geometry.coordinates;
            for (let i = 0; i < buildings.length; i++) {
                const perimeter = buildings[i][0];
                if (turf.booleanPointInPolygon([lng, lat], turf.polygon([perimeter]))) {
                    clickedPolygon = turf.polygon([perimeter]);
                    break;
                }
            }
        } else if (geometry.type === 'Polygon') {
            const perimeter = geometry.coordinates[0];
            if (turf.booleanPointInPolygon([lng, lat], turf.polygon([perimeter]))) {
                clickedPolygon = turf.polygon([perimeter]);
            }
        }

        if (!clickedPolygon) {
            return;
        }

        // Find and merge adjacent building fragments
        const mergedPolygon = findAndMergeAdjacentFragments(clickedPolygon, allBuildingFeatures);
        const finalPerimeter = mergedPolygon.geometry.coordinates[0];

        const perimeter = finalPerimeter;
        const centerPoint = turf.centerOfMass(turf.polygon([perimeter]));

        const sourceName = buildingUUID + '-source';
        const layerFillName = buildingUUID + '-layer-fill';
        const layerOutlineName = buildingUUID + '-layer-outline';
        const layerLabelName = buildingUUID + '-layer-label';
        const sourceLabelName = buildingUUID + '-source-label';
        
        // Add an empty geojson source
        map.addSource(sourceName, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [perimeter]
                        }
                    }
                ]
            }
        });

        // Add a layer to the map
        map.addLayer({
            id: layerFillName,
            type: 'fill',
            source: sourceName,
            paint: {
                'fill-color': '#0a84ff',
                'fill-opacity': 0.5
            }
        });

        map.addLayer({
            id: layerOutlineName,
            type: 'line',
            source: sourceName,
            paint: {
                'line-color': '#0a84ff',
                'line-width': 3
            }
        });

        // Add a label at the centerPoint

        map.addSource(sourceLabelName, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: centerPoint.geometry.coordinates
                },
                properties: {
                    title: logicalIndex(selectedBuildings.length) + ' Structure'
                }
            }
        });

        map.addLayer({
            id: layerLabelName,
            type: 'symbol',
            source: sourceLabelName,
            layout: {
                'text-field': ['get', 'title'],
                'text-font': ['Arial Bold'],
                'text-size': 12,
                'text-allow-overlap': true
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#0a84ff',
                'text-halo-width': 2
            }
        });

        const area = turf.area(turf.polygon([perimeter])); // in square meters
        const areaSqft = area * 10.7639; // in square feet

        selectedBuildings.push({
            source: sourceName,
            layerFill: layerFillName,
            layerOutline: layerOutlineName,
            layerLabel: layerLabelName,
            sourceLabel: sourceLabelName,
            polygon: perimeter,
            center: centerPoint,
            area: areaSqft,
            roofPitch: 'medium'
        });

        updateStructureListUI();
        updateGetQuoteButton();

        buildingUUID++;
    }

    // MARK: - findAndMergeAdjacentFragments
    // This function finds building fragments that share edges (due to tile boundaries)
    // and merges them into a single polygon
    function findAndMergeAdjacentFragments(startPolygon, allFeatures) {
        let merged = startPolygon;
        
        // Extract all polygons from the features with their bbox
        const allPolygons = [];
        allFeatures.forEach(feature => {
            if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(coords => {
                    if (coords[0] && coords[0].length > 2) {
                        const poly = turf.polygon([coords[0]]);
                        const bbox = turf.bbox(poly);
                        allPolygons.push({
                            polygon: poly,
                            bbox: bbox,
                            bboxKey: bbox.join(',')
                        });
                    }
                });
            } else if (feature.geometry.type === 'Polygon') {
                if (feature.geometry.coordinates[0] && feature.geometry.coordinates[0].length > 2) {
                    const poly = turf.polygon([feature.geometry.coordinates[0]]);
                    const bbox = turf.bbox(poly);
                    allPolygons.push({
                        polygon: poly,
                        bbox: bbox,
                        bboxKey: bbox.join(',')
                    });
                }
            }
        });
        
        // Track which polygons we've already merged (by bbox key)
        const mergedBboxKeys = new Set();
        const startBboxKey = turf.bbox(startPolygon).join(',');
        mergedBboxKeys.add(startBboxKey);
        
        let mergedAny = true;
        let iterations = 0;
        const maxIterations = 10;
        
        // Helper function to check if two bboxes are close enough to potentially touch
        // bbox format: [minX, minY, maxX, maxY]
        const bboxBuffer = 0.0002; // ~20m buffer for bbox check
        function bboxesOverlap(bbox1, bbox2) {
            return !(bbox2[0] > bbox1[2] + bboxBuffer || // bbox2 is right of bbox1
                     bbox2[2] < bbox1[0] - bboxBuffer || // bbox2 is left of bbox1
                     bbox2[1] > bbox1[3] + bboxBuffer || // bbox2 is above bbox1
                     bbox2[3] < bbox1[1] - bboxBuffer);  // bbox2 is below bbox1
        }
        
        // Keep trying to merge until no more merges are possible
        while (mergedAny && iterations < maxIterations) {
            mergedAny = false;
            iterations++;
            
            const mergedBbox = turf.bbox(merged);
            
            // Pre-filter: only check polygons whose bbox overlaps with merged bbox
            const candidates = allPolygons.filter(p => 
                !mergedBboxKeys.has(p.bboxKey) && bboxesOverlap(mergedBbox, p.bbox)
            );
            
            for (let i = 0; i < candidates.length; i++) {
                const candidateObj = candidates[i];
                const candidate = candidateObj.polygon;
                
                // Check if polygons actually touch/overlap
                try {
                    const bufferedMerged = turf.buffer(merged, 0.0001, { units: 'kilometers' });
                    const intersects = turf.booleanIntersects(bufferedMerged, candidate);
                    
                    if (intersects) {
                        const unionResult = turf.union(merged, candidate);
                        
                        if (unionResult && unionResult.geometry) {
                            mergedBboxKeys.add(candidateObj.bboxKey);
                            
                            if (unionResult.geometry.type === 'Polygon') {
                                merged = unionResult;
                                mergedAny = true;
                            } else if (unionResult.geometry.type === 'MultiPolygon') {
                                let largestArea = 0;
                                let largestPolygon = null;
                                unionResult.geometry.coordinates.forEach(coords => {
                                    const poly = turf.polygon(coords);
                                    const area = turf.area(poly);
                                    if (area > largestArea) {
                                        largestArea = area;
                                        largestPolygon = poly;
                                    }
                                });
                                if (largestPolygon) {
                                    merged = largestPolygon;
                                    mergedAny = true;
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Silently handle merge errors
                }
            }
        }
        
        return merged;
    }

    // Initialize step 1
    renderCategories();

});