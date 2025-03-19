// Initialize MapLibre GL JS

// On DOM load, initialize the map

document.addEventListener('DOMContentLoaded', function () {
    const debug = true;
    const MAPTILER_API_KEY = "BkQkq2NwcJAaCLNx663p";

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

            
            // Quick and dirty way to get the coordinates of the building
            const buildings = e.features[0].geometry.coordinates
            for (let i = 0; i < buildings.length; i++) {
                const perimeter = buildings[i][0];
                if (turf.booleanPointInPolygon([pointer.lng, pointer.lat], turf.polygon([perimeter]))) {
                    //console.log(perimeter);
                    map.addSource('highlighted-building', {
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
                }
            }
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
                //map.once('idle', function () {
                    // Set the map to interactive
                    map.dragPan.enable();
                    map.scrollZoom.enable();
                    map.touchZoomRotate.enable();
                    map.boxZoom.enable();
                    map.keyboard.enable();
                    map.doubleClickZoom.enable();

                    selectBuildingAtLngLat(coords[0], coords[1]);
                //});
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

    const getQuoteButton = document.getElementById('iq-get-quote');
    getQuoteButton.addEventListener('click', function () {
        getQuote();
    });


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


    function getQuote() {
        var roofArea = 0;
        for (let i = 0; i < selectedBuildings.length; i++) {
            buildingArea = selectedBuildings[i].area;
            if (selectedBuildings[i].roofPitch === 'shallow') {
                roofArea += buildingArea * 1.1;
            }
            if (selectedBuildings[i].roofPitch === 'medium') {
                roofArea += buildingArea * 1.2;
            }
            if (selectedBuildings[i].roofPitch === 'steep') {
                roofArea += buildingArea * 1.3;
            }
        }

        var roofPriceLow = (roofArea * 4.87).toFixed(2);
        var roofPriceLowFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(roofPriceLow);
        var roofPriceHigh = (roofArea * 5.24).toFixed(2);
        var roofPriceHighFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(roofPriceHigh);
        alert('The estimated price for the roof is ' + roofPriceLowFormatted + '-' + roofPriceHighFormatted + '.');
        
        };

    function updateStructureListUI() {
        const structureList = document.getElementById('iq-structure-list');
        structureList.innerHTML = '';
        for (let i = 0; i < selectedBuildings.length; i++) {
            const structure = selectedBuildings[i];
            const area = structure.area;
            const areaRounded = Math.round(area);
            const areaSqft = areaRounded.toLocaleString();
            const structureItem = document.createElement('div');
            structureItem.classList.add('iq-structure-item');
            structureItem.setAttribute('data-structure-index', i);
            structureItem.innerHTML = `

                <h3 class="iq-structure-item-title">${logicalIndex(i)} Structure</h3>

                <span class="iq-structure-item-area">${areaSqft} ft²</span>

                <span class="iq-visual-option-group-title">Roof pitch</span>

                <div class="iq-visual-option-group iq-roof-pitch-options" data-field="roofPitch">

                    <div class="iq-visual-option" data-value="shallow">
                        <svg width="100" height="100" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                        <polygon points="0,120 100,60 200,120, 200,200, 0,200" fill="currentColor"/>
                        </svg>
                        <span class="iq-visual-option-title">Shallow</span>
                    </div>
                    
                    <div class="iq-visual-option" data-value="medium">
                        <svg width="100" height="100" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <polygon points="0,120 100,30 200,120, 200,200, 0,200" fill="currentColor"/>
                        </svg>
                        <span class="iq-visual-option-title">Medium</span>
                    </div>
                    
                    <div class="iq-visual-option" data-value="steep">
                        <svg width="100" height="100" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <polygon points="0,120 100,0 200,120, 200,200, 0,200" fill="currentColor"/>
                        </svg>
                        <span class="iq-visual-option-title">Steep</span>
                    </div>
                
                </div>
            `;
            structureList.appendChild(structureItem);

            const pitchOptionsGroup = structureItem.querySelector('.iq-visual-option-group.iq-roof-pitch-options');

            const pitchOptions = pitchOptionsGroup.querySelectorAll('.iq-visual-option');

            // If the roof pitch is already set, highlight the corresponding option
            if (structure.roofPitch) {
                pitchOptions.forEach(option => {
                    if (option.getAttribute('data-value') === structure.roofPitch) {
                        option.classList.add('iq-active');
                    }
                });
            }

            pitchOptions.forEach(option => {
                option.addEventListener('click', function () {
                    pitchOptions.forEach(option => {
                        option.classList.remove('iq-active');
                    });
                    option.classList.add('iq-active');
                    const selectedPitch = option.getAttribute('data-value');
                    selectedBuildings[i].roofPitch = selectedPitch;
                    console.log(selectedBuildings);
                    updateGetQuoteButton();
                });
            });
        }
    }

    function updateGetQuoteButton() {
        // Only enable the button if there is at least one structure selected and all structures have a roof pitch selected
        const getQuoteButton = document.getElementById('iq-get-quote');

        if (selectedBuildings.length > 0) {
            let allRoofPitchesSelected = true;
            for (let i = 0; i < selectedBuildings.length; i++) {
                if (!selectedBuildings[i].roofPitch) {
                    allRoofPitchesSelected = false;
                    break;
                }
            }
            if (allRoofPitchesSelected) {
                getQuoteButton.disabled = false;
            } else {
                getQuoteButton.disabled = true;
            }
        } else {
            getQuoteButton.disabled = true;
        }
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
    async function selectBuildingAtLngLat(lng, lat) {
        console.log('Selecting building at ' + lng + ', ' + lat);
        const tile = getTileForLatLon(lat, lng, 15);

        const buildingsCenter = await getBuildingsForTile(tile.x, tile.y, tile.z);
        console.log('Center buildings: ' + buildingsCenter.length);
        // Save buildingsCenter json to a file
        const json = JSON.stringify(buildingsCenter);
        // create a blob object
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        // create a link element
        const a = document.createElement("a");
        a.href = url;
        a.download = "buildingsCenter.json";
        // trigger the download
        a.click();

        const buildingsWest = await getBuildingsForTile(tile.x - 1, tile.y, tile.z);
        console.log('West buildings: ' + buildingsWest.length);
        // Save buildingsWest json to a file
        const jsonWest = JSON.stringify(buildingsWest);
        // create a blob object
        const blobWest = new Blob([jsonWest], { type: "application/json" });
        const urlWest = URL.createObjectURL(blobWest);
        // create a link element
        const aWest = document.createElement("a");
        aWest.href = urlWest;
        aWest.download = "buildingsWest.json";
        // trigger the download
        aWest.click();


        const buildings = buildingsCenter.concat(buildingsWest);
        console.log('Total buildings: ' + buildings.length);

        for (let i = 0; i < buildings.length; i++) {
            var perimeter = buildings[i];
            var newPerimeter = perimeter;
            if (turf.booleanPointInPolygon([lng, lat], turf.polygon([perimeter]))) {
                console.log(perimeter);

                var buildingsToCheck = buildings;

                console.log('Checking for overlaps with ' + buildingsToCheck.length + ' buildings');
                for (let j = 0; j < buildings.length; j++) {
                    const otherPerimeter = buildings[j];
                    if (perimeter !== otherPerimeter && turf.booleanIntersects(turf.polygon([perimeter]), turf.polygon([otherPerimeter]))) {
                        newPerimeter = turf.union(turf.featureCollection([turf.polygon([perimeter]), turf.polygon([otherPerimeter])]));
                        buildingsToCheck.splice(j, 1);

                        perimeter = newPerimeter.geometry.coordinates[0];
                    }
                }

                console.log(perimeter);

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
        }
    }

});