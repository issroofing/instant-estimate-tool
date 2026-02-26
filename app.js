// Initialize MapLibre GL JS

// Load external dependencies, then initialize the app
(function() {
    const dependencies = {
        styles: [
            'https://unpkg.com/maplibre-gl@4.3.2/dist/maplibre-gl.css',
            'https://unpkg.com/@maptiler/geocoding-control@latest/style.css'
        ],
        scripts: [
            'https://unpkg.com/maplibre-gl@4.3.2/dist/maplibre-gl.js',
            'https://unpkg.com/@maptiler/geocoding-control@latest/maplibregl.umd.js',
            'https://unpkg.com/@turf/turf@6.5.0/turf.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
        ]
    };

    function loadStyle(href) {
        return new Promise(function(resolve) {
            // Skip if already loaded
            if (document.querySelector('link[href="' + href + '"]')) { resolve(); return; }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = resolve; // continue even if a stylesheet fails
            document.head.appendChild(link);
        });
    }

    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            // Skip if already loaded
            if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function loadAllDependencies() {
        // Load all stylesheets in parallel
        const stylePromises = dependencies.styles.map(loadStyle);

        // Load scripts sequentially (order matters: maplibre must load before geocoding control)
        const scriptsLoaded = dependencies.scripts.reduce(function(chain, src) {
            return chain.then(function() { return loadScript(src); });
        }, Promise.resolve());

        return Promise.all([Promise.all(stylePromises), scriptsLoaded]);
    }

    function onReady(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    onReady(function() {
        loadAllDependencies().then(initApp).catch(function(err) {
            console.error('Failed to load dependencies:', err);
        });
    });

function initApp() {
    const debug = false;
    // Suppress console.log unless debug mode is on
    const debugLog = debug ? console.log.bind(console) : function() {};
    const MAPTILER_API_KEY = "BkQkq2NwcJAaCLNx663p";

    const contactURL = '/contact'; // Base URL for contact form, will append query params

    // Multi-step wizard state
    let currentStep = 1;
    let selectedCategory = null;
    let selectedService = null;
    let selectedAddress = '';
    // Address parts (top-level scope)
    var selectedStreet = '';
    var selectedCity = '';
    var selectedState = '';
    var selectedZip = '';
    // Pricing database parsed from HTML
    let pricingDatabase = [];
    let categories = [];
    let services = {}; // keyed by category name

    // Company info parsed from HTML
    let companyInfo = {};
    function parseCompanyInfo() {
        const el = document.querySelector('.iq-company-info');
        if (!el) return;
        companyInfo = {
            logo: el.querySelector('.iq-company-logo')?.src || '',
            name: el.querySelector('.iq-company-name')?.innerText?.trim() || '',
            street: el.querySelector('.iq-company-street-address')?.innerText?.trim() || '',
            cityStateZip: el.querySelector('.iq-company-city-state-zip')?.innerText?.trim() || '',
            phone: el.querySelector('.iq-company-phone')?.innerText?.trim() || '',
            email: el.querySelector('.iq-company-email')?.innerText?.trim() || '',
            website: el.querySelector('.iq-company-website')?.innerText?.trim() || '',
            license: el.querySelector('.iq-company-license')?.innerText?.trim() || ''
        };
    }

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
            const productDescription = option.querySelector('.iq-product-description')?.innerText?.trim() || '';

            const product = {
                category: categoryName,
                service: serviceName,
                product: productName,
                description: productDescription,
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

        debugLog('Parsed pricing database:', pricingDatabase);
        debugLog('Categories:', categories);
        debugLog('Services:', services);
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

    // Inject all styles into the page
    function injectStyles() {
        if (document.getElementById('iq-injected-styles')) return;
        const style = document.createElement('style');
        style.id = 'iq-injected-styles';
        style.textContent = `
#iq-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
}

#iq-main {
    background-color: white;
    height: auto;
    width: 600px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-radius: 16px;
    box-shadow: 0 0 12px rgba(29, 35, 56, 0.2);
    box-sizing: border-box;
    overflow: hidden;
}

/* Step Indicator */
#iq-step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
    gap: 4px;
}

.iq-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    opacity: 0.4;
    transition: opacity 0.3s ease;
}

.iq-step.iq-step-active,
.iq-step.iq-step-completed {
    opacity: 1;
}

.iq-step-number {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: #cfd8e2;
    color: #4a5d74;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
    transition: background-color 0.3s ease, color 0.3s ease;
}

.iq-step.iq-step-active .iq-step-number {
    background-color: #007aff;
    color: white;
}

.iq-step.iq-step-completed .iq-step-number {
    background-color: #34c759;
    color: white;
}

.iq-step-label {
    font-size: 10px;
    color: #4a5d74;
    text-align: center;
    white-space: nowrap;
}

.iq-step-connector {
    width: 20px;
    height: 2px;
    background-color: #cfd8e2;
    margin-bottom: 18px;
}

/* Option List (Categories/Services) */
.iq-option-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.iq-option-card {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    background-color: #f2f4f8;
    border: 2px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 1.1em;
    font-weight: 500;
    color: #0e1012;
}

.iq-option-card:hover {
    background-color: #e8ebf0;
    border-color: #007aff;
}

.iq-option-card.iq-active {
    background-color: #f0f7ff;
    border-color: #007aff;
}

.iq-option-card-icon {
    margin-right: 12px;
    font-size: 1.5em;
}

/* Views Container */
#iq-views-container {
    position: relative;
}

/* Views */
.iq-view {
    display: none;
    flex-direction: column;
    gap: 16px;
    opacity: 0;
    transform: translateX(30px);
}

.iq-view.iq-view-entering {
    display: flex;
    opacity: 0;
    transform: translateX(30px);
    transition: none;
}

.iq-view.iq-view-entering-back {
    display: flex;
    opacity: 0;
    transform: translateX(-30px);
    transition: none;
}

.iq-view.iq-view-active {
    display: flex;
    opacity: 1;
    transform: translateX(0);
    transition: opacity 0.3s ease, transform 0.3s ease;
}

.iq-view.iq-view-exiting {
    display: flex;
    opacity: 0;
    transform: translateX(-30px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
}

.iq-view.iq-view-exiting-back {
    display: flex;
    opacity: 0;
    transform: translateX(30px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
}

.iq-view-title {
    margin: 0;
    color: #0e1012;
    text-align: center;
    font-size: 1.5em;
}

.iq-view-subtitle {
    margin: 0;
    font-size: 0.95em;
    color: #637182;
    text-align: center;

}

/* Step 3 - Find Property */
#iq-step3-bottom {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

#iq-step3-hint {
    margin: 0;
    color: #637182;
    font-size: 0.9em;
    text-align: center;
}

#iq-selected-summary {
    text-align: center;
    font-weight: 500;
    color: #007aff;
    min-height: 1.2em;
}

/* Structure Questions */
.iq-structure-questions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-left: auto;
}

.iq-question-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background-color: #f8f9fa;
    border: 1px solid #e4e8ed;
    border-radius: 12px;
    padding: 12px 16px;
    gap: 8px;
}

.iq-question-group .iq-visual-option-group-title {
    margin-bottom: 0;
    font-weight: 600;
    color: #0e1012;
}

.iq-question-group .iq-visual-option-group {
    justify-content: flex-start;
}

/* Navigation Buttons */
.iq-nav-buttons {
    display: flex;
    gap: 12px;
    margin-top: 8px;
}

.iq-nav-buttons .iq-button {
    flex: 1;
}

.iq-button-secondary {
    background-color: #f2f4f8 !important;
    color: #4a5d74 !important;
}

.iq-button-secondary:hover {
    background-color: #e4e8ed !important;
}

a.iq-button {
    text-decoration: none;
    text-align: center;
}

/* Pricing View */
#iq-pricing-breakdown {
    display: flex;
    flex-direction: column;
    gap: 80px;
}

.iq-pricing-structure {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.iq-pricing-structure-thumbnail {
    width: 80px;
    height: 80px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
}

.iq-pricing-structure-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e4e8ed;
}

.iq-pricing-structure-info {
    display: flex;
    flex-direction: column;
}

.iq-pricing-structure-name {
    font-weight: 600;
    font-size: 1.1em;
    color: #0e1012;
}

.iq-pricing-structure-details {
    font-size: 0.85em;
    color: #637182;
}

.iq-pricing-option-label {
    font-weight: 600;
    font-size: 0.9em;
    color: #4a5d74;
    margin-top: 4px;
}

.iq-pricing-products {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.iq-pricing-product {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    background-color: #f2f4f8;
    border-radius: 12px;
    padding: 12px;
}

.iq-pricing-product-thumb {
    width: 60px;
    height: 60px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    object-fit: cover;
}

.iq-pricing-product-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
}

.iq-pricing-product-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 4px;
}

.iq-pricing-product-name {
    font-weight: 600;
    color: #0e1012;
    font-size: 0.95em;
}

.iq-pricing-product-price {
    font-weight: 600;
    color: #007aff;
    white-space: nowrap;
    font-size: 0.95em;
}

.iq-pricing-product-description {
    font-size: 0.85em;
    color: #637182;
    margin: 0;
    line-height: 1.4;
}

.iq-pricing-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    background-color: #f2f4f8;
    border-radius: 12px;
    padding: 12px;
}

.iq-pricing-thumbnail {
    width: 60px;
    height: 60px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
}

.iq-pricing-item-content {
    display: flex;
    flex-direction: column;
    flex: 1;
}

.iq-pricing-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
}

.iq-pricing-item-name {
    font-weight: 600;
    color: #0e1012;
}

.iq-pricing-item-price {
    font-weight: 600;
    color: #007aff;
}

.iq-pricing-item-details {
    font-size: 0.85em;
    color: #637182;
}

#iq-map-wrapper {
    width: 600px;
    max-width: 100%;
    aspect-ratio: 16/9;
    border-radius: 16px;
    overflow: hidden;
    box-sizing: border-box;
}

#iq-map {
    height: 100%;
    width: 100%;
}

.iq-visual-option-group {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    background-color: transparent;
}

.iq-visual-option {
    appearance: none;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background-color: white;
    border: 0.5px solid #cfd8e2;
    border-radius: 8px;
    padding: 12px 16px;
    cursor: pointer;
    transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease;
    box-sizing: border-box;
}

.iq-visual-option:hover {
    background-color: #f8f9fa;
}

.iq-visual-option:active {
    transform: scale(0.925);
}

.iq-visual-option svg {
    width: 24px;
    height: 24px;
    color: #4a5d74;
    object-fit: contain;
}

.iq-visual-option.iq-active {
    border-color: #007aff;
    background-color: #f0f7ff;
    box-shadow: 0 0 0 1.5px #007aff;
}

.iq-visual-option.iq-active svg {
    color: #007aff;
}

.iq-visual-option-title {
    margin-top: 0.5em;
    font-size: 0.8em;
}

.iq-structure-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    background-color: #f2f4f8;
    color: #0e1012;
    border-radius: 16px;
    padding: 16px;
    flex-wrap: wrap;
}

.iq-structure-thumbnail {
    width: 80px;
    height: 80px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
}

.iq-structure-item-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 100px;
}

.iq-structure-item h3 {
    font-size: 1.15em;
    margin: 0 0 0.125em 0;
}

.iq-structure-item-area {
    font-size: 0.9em;
    color: #637182;
    margin-bottom: 0;
}

.iq-structure-item-pitch {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex: 1;
    margin-left: auto;
}

.iq-visual-option-group-title {
    margin-bottom: 0.5em;
    font-size: 0.85em;
    color: #4a5d74;
}

#iq-structure-list {
    list-style-type: none;
    padding: 0;
    margin: 0;
    margin-block-start: 0;
    margin-block-end: 0;
    padding-inline-start: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

#iq-bottom-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.iq-button {
    appearance: none;
    border: none;
    background-color: #007aff;
    color: white;
    padding: 16px 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1em;
    transition: background-color 0.2s;
}

.iq-button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
}

/* Map attribution */
.maplibregl-ctrl-attrib.maplibregl-compact {
    margin: 32px;
}

/* Geocoding control */
.maplibregl-ctrl-top-left .maplibregl-ctrl {
    margin: 32px;
}

.maplibregl-ctrl-geocoder form {
    font-family: var(--font) !important;
    border-radius: 12px !important;
    width: 100% !important;
    min-width: 300px !important;
    max-width: 100% !important;
}

.maplibregl-ctrl-geocoder form div {
    padding: 8px;
    border-radius: 16px !important;
}

.maplibregl-ctrl-geocoder form div input {
    font-size: 14px !important;
    text-overflow: ellipsis;
}

@media screen and (max-width: 480px) {
    .maplibregl-ctrl-geocoder form div input {
        font-size: 16px !important;
    }

    .maplibregl-ctrl-attrib.maplibregl-compact {
        margin: 8px;
    }

    .maplibregl-ctrl-top-left .maplibregl-ctrl {
        margin: 8px;
    }

    .maplibregl-ctrl-geocoder form {
        font-family: var(--font) !important;
        border-radius: 12px !important;
        width: 100% !important;
        min-width: unset !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    #iq-main {
        width: 100%;
        box-sizing: border-box;
    }

    #iq-map-wrapper {
        width: 100%;
        aspect-ratio: 1/1;
    }

    #iq-step-indicator {
        gap: 2px;
        padding: 12px 0;
    }

    .iq-step-connector {
        width: 12px;
    }

    .iq-step-label {
        font-size: 8px;
    }

    .iq-step-number {
        width: 24px;
        height: 24px;
        font-size: 11px;
    }

    .iq-structure-item {
        flex-direction: column;
        align-items: center;
    }

    .iq-structure-thumbnail {
        width: 100%;
        height: 120px;
    }

    .iq-structure-item-info {
        align-items: center;
        margin-bottom: 8px;
    }

    .iq-structure-questions {
        align-items: center;
        margin-left: 0;
        width: 100%;
    }

    .iq-question-group {
        align-items: center;
        width: 100%;
    }

    .iq-structure-item-pitch {
        align-items: center;
        margin-left: 0;
    }

    .iq-visual-option-group {
        justify-content: center;
    }

    .iq-visual-option {
        padding: 12px 10px;
    }

    .iq-pricing-item {
        flex-direction: column;
        align-items: stretch;
    }

    .iq-pricing-thumbnail {
        width: 100%;
        height: 100px;
    }

    .iq-pricing-item-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
    }

    .iq-pricing-product {
        flex-direction: column;
        align-items: stretch;
    }

    .iq-pricing-product-thumb {
        width: 100%;
        height: 100px;
    }

    .iq-pricing-product-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .iq-nav-buttons {
        flex-direction: column;
    }
}

.maplibregl-ctrl-geocoder form div div.clear-button-container,
.maplibregl-ctrl-geocoder form div div.clear-button-container button {
    cursor: pointer !important;
}

.maplibregl-ctrl-geocoder form div button.search-button {
    padding-left: 4px;
}

.maplibregl-ctrl-geocoder form ul {
    border-radius: 16px !important;
}

.maplibregl-ctrl-geocoder form ul li {
    cursor: pointer !important;
    animation: none !important;
    padding-left: 12px !important;
    padding-right: 12px !important;
}

.maplibregl-ctrl-geocoder form ul li img {
    display: none !important;
}

.maplibregl-ctrl-geocoder form div.no-results {
    display: none !important;
}
        `;
        document.head.appendChild(style);
    }

    // Inject styles before anything else
    injectStyles();

    // Inject the wizard UI into the page
    function injectWizardHTML() {
        // Don't inject if already present
        if (document.getElementById('iq-main')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'iq-wrapper';

        // Insert directly after the script tag that loaded this file
        const scriptTag = document.querySelector('script[src*="app.js"]');
        if (scriptTag && scriptTag.parentNode) {
            scriptTag.parentNode.insertBefore(wrapper, scriptTag.nextSibling);
        } else {
            document.body.appendChild(wrapper);
        }

        wrapper.innerHTML = `
            <div id="iq-main">

                <!-- Step Indicator -->
                <div id="iq-step-indicator">
                    <div class="iq-step iq-step-active" data-step="1">
                        <div class="iq-step-number">1</div>
                        <div class="iq-step-label">Type of Work</div>
                    </div>
                    <div class="iq-step-connector"></div>
                    <div class="iq-step" data-step="2">
                        <div class="iq-step-number">2</div>
                        <div class="iq-step-label">Service</div>
                    </div>
                    <div class="iq-step-connector"></div>
                    <div class="iq-step" data-step="3">
                        <div class="iq-step-number">3</div>
                        <div class="iq-step-label">Find Property</div>
                    </div>
                    <div class="iq-step-connector"></div>
                    <div class="iq-step" data-step="4">
                        <div class="iq-step-number">4</div>
                        <div class="iq-step-label">Confirm Details</div>
                    </div>
                    <div class="iq-step-connector"></div>
                    <div class="iq-step" data-step="5">
                        <div class="iq-step-number">5</div>
                        <div class="iq-step-label">See Pricing</div>
                    </div>
                </div>

                <div id="iq-views-container">
                    <!-- Step 1: Choose Category -->
                    <div id="iq-view-1" class="iq-view iq-view-active">
                        <h2 class="iq-view-title">What type of work do you need?</h2>
                        <p class="iq-view-subtitle">Select a category to get started</p>
                        <div id="iq-category-list" class="iq-option-list"></div>
                    </div>

                    <!-- Step 2: Choose Service -->
                    <div id="iq-view-2" class="iq-view">
                        <h2 class="iq-view-title">What service do you need?</h2>
                        <p class="iq-view-subtitle">Select a service</p>
                        <div id="iq-service-list" class="iq-option-list"></div>
                        <div class="iq-nav-buttons">
                            <button id="iq-back-step2" class="iq-button iq-button-secondary">Back</button>
                        </div>
                    </div>

                    <!-- Step 3: Find Property -->
                    <div id="iq-view-3" class="iq-view">
                        <div id="iq-top-container"></div>
                        <div id="iq-middle-container">
                            <div id="iq-map-wrapper">
                                <div id="iq-map"></div>
                            </div>
                        </div>
                        <div id="iq-step3-bottom">
                            <p id="iq-step3-hint">Search for your address, then click on each structure you'd like included in your quote.</p>
                            <div id="iq-selected-summary"></div>
                            <div class="iq-nav-buttons">
                                <button id="iq-back-step3" class="iq-button iq-button-secondary">Back</button>
                                <button id="iq-next-step3" class="iq-button" disabled>Continue</button>
                            </div>
                        </div>
                    </div>

                    <!-- Step 4: Confirm Selection -->
                    <div id="iq-view-4" class="iq-view">
                        <h2 class="iq-view-title">Confirm Details</h2>
                        <p class="iq-view-subtitle" id="iq-step4-subtitle">Answer a few questions about each structure</p>
                        <ul id="iq-structure-list"></ul>
                        <div class="iq-nav-buttons">
                            <button id="iq-back-step4" class="iq-button iq-button-secondary">Back</button>
                            <button id="iq-next-step4" class="iq-button" disabled>See Pricing</button>
                        </div>
                    </div>

                    <!-- Step 5: See Pricing -->
                    <div id="iq-view-5" class="iq-view">
                        <h2 class="iq-view-title" id="iq-step5-title">Your Estimate</h2>
                        <p class="iq-view-subtitle" id="iq-step5-subtitle">Here's your instant estimate</p>
                        <div id="iq-pricing-breakdown"></div>
                        <div class="iq-nav-buttons">
                            <button id="iq-back-step5" class="iq-button iq-button-secondary">Back</button>
                            <button id="iq-save-estimate" class="iq-button iq-button-secondary">Save Estimate as PDF</button>
                            <a id="iq-request-quote" href="/contact" target="_blank" class="iq-button">Request a Formal Quote</a>
                        </div>
                    </div>
                </div>

            </div>
        `;
    }

    // Inject the UI before initializing
    injectWizardHTML();

    // Initialize pricing database and company info
    parsePricingDatabase();
    parseCompanyInfo();

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
        debugLog('Debug mode enabled');
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
            tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
            tileSize: 256,
            attribution: '© Google'
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
                    debugLog('Clicked on a selected building');
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

                    debugLog(selectedBuildings);
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
            // Log the full geocoder pick event for inspection
            debugLog('Geocoder pick event:', e);
            // Parse and store address parts
            if (e.feature && e.feature.place_name) {
                let addr = e.feature.place_name.replace(/, United States$/, '');
                selectedAddress = addr;
                // Example: "6697 Promontory Drive, Eden Prairie, Minnesota 55346"
                const parts = addr.split(',').map(s => s.trim());
                selectedStreet = parts[0] || '';
                selectedCity = parts[1] || '';
                let stateZip = parts[2] || '';
                // State and zip
                let state = '', zip = '';
                const stateZipMatch = stateZip.match(/([A-Za-z ]+)\s*(\d{5})?/);
                if (stateZipMatch) {
                    state = stateZipMatch[1].trim();
                    zip = stateZipMatch[2] || '';
                }
                // Convert state to 2-letter code
                const stateMap = {
                    'Minnesota': 'MN', 'Wisconsin': 'WI', 'Iowa': 'IA', 'Illinois': 'IL', 'North Dakota': 'ND', 'South Dakota': 'SD',
                    'Missouri': 'MO', 'Michigan': 'MI', 'Nebraska': 'NE', 'Kansas': 'KS', 'Indiana': 'IN', 'Ohio': 'OH', 'Colorado': 'CO',
                    'Texas': 'TX', 'California': 'CA', 'New York': 'NY', 'Florida': 'FL', 'Georgia': 'GA', 'Pennsylvania': 'PA', 'Virginia': 'VA',
                    'North Carolina': 'NC', 'South Carolina': 'SC', 'Tennessee': 'TN', 'Kentucky': 'KY', 'Alabama': 'AL', 'Arkansas': 'AR',
                    'Oklahoma': 'OK', 'Louisiana': 'LA', 'Mississippi': 'MS', 'West Virginia': 'WV', 'Maryland': 'MD', 'Delaware': 'DE',
                    'New Jersey': 'NJ', 'Connecticut': 'CT', 'Rhode Island': 'RI', 'Massachusetts': 'MA', 'New Hampshire': 'NH', 'Vermont': 'VT',
                    'Maine': 'ME', 'Alaska': 'AK', 'Hawaii': 'HI', 'Montana': 'MT', 'Idaho': 'ID', 'Wyoming': 'WY', 'Arizona': 'AZ', 'New Mexico': 'NM',
                    'Nevada': 'NV', 'Utah': 'UT', 'Oregon': 'OR', 'Washington': 'WA'
                };
                selectedState = stateMap[state] || state;
                selectedZip = zip;
            }
            // Return if the feature is not a building
            // Necessary because clicking the clear button fires a pick event with no feature for some reason
            if (!e.feature || !e.feature.geometry.coordinates) {
                return;
            }
            const coords = e.feature.geometry.coordinates;

            // Save the address from the geocoder input
            if (e.feature.place_name) {
                selectedAddress = e.feature.place_name;
            }

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
    const saveEstimateButton = document.getElementById('iq-save-estimate');

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

    saveEstimateButton.addEventListener('click', function () {
        generateEstimatePDF();
    });

    function goToStep(step) {
        const previousStep = currentStep;
        const isGoingBack = step < previousStep;
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

        // Update views with animation
        const views = document.querySelectorAll('.iq-view');
        const currentView = document.querySelector('.iq-view.iq-view-active');
        const nextView = views[step - 1];
        const viewsContainer = document.getElementById('iq-views-container');

        // Run step-specific logic FIRST to populate content before measuring height
        if (step === 1) {
            renderCategories();
        } else if (step === 2) {
            renderServices();
        } else if (step === 4) {
            updateStructureListUI();
            updateStep4Button();
        } else if (step === 5) {
            renderPricing();
            saveEstimateData();
            updateContactButton();
        }

        if (currentView && currentView !== nextView) {
            // Capture current height
            const startHeight = viewsContainer.offsetHeight;
            
            // Add exiting class to current view
            currentView.classList.remove('iq-view-active');
            currentView.classList.add(isGoingBack ? 'iq-view-exiting-back' : 'iq-view-exiting');
            
            // Prepare next view for entrance - start in entering state
            nextView.classList.add(isGoingBack ? 'iq-view-entering-back' : 'iq-view-entering');
            
            // Force reflow to ensure the entering state is applied
            nextView.offsetHeight;
            
            // Measure the target height (content is now populated)
            const endHeight = nextView.offsetHeight;
            
            // Set explicit start height and enable transition
            viewsContainer.style.height = startHeight + 'px';
            viewsContainer.style.transition = 'height 0.3s ease';
            viewsContainer.offsetHeight; // Force reflow
            
            // Animate to end height
            viewsContainer.style.height = endHeight + 'px';
            
            // Remove entering class and add active to trigger animation
            nextView.classList.remove('iq-view-entering', 'iq-view-entering-back');
            nextView.classList.add('iq-view-active');
            
            // Clean up after animation
            setTimeout(() => {
                currentView.classList.remove('iq-view-exiting', 'iq-view-exiting-back');
                viewsContainer.style.height = '';
                viewsContainer.style.transition = '';
                
                // Resize mini maps and re-fit bounds after animation completes
                miniMaps.forEach(m => {
                    m.resize();
                    if (m._structureBounds) {
                        m.fitBounds(m._structureBounds, { padding: m._fitPadding || 20, duration: 0 });
                    }
                });
            }, 300);
        } else if (!currentView) {
            // First load, just show the view
            nextView.classList.add('iq-view-active');
        }

        // Map resize needs to happen after view is visible
        if (step === 3) {
            setTimeout(() => {
                map.resize();
            }, 100);
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
        
        // Update title and subtitle
        const title = document.getElementById('iq-step5-title');
        const subtitle = document.getElementById('iq-step5-subtitle');
        if (selectedStreet && selectedCity && selectedState) {
            // Full formatted address in subtitle with line break
            title.textContent = `Instant ${selectedService || ''} Estimate`;
            subtitle.innerHTML = `${selectedStreet}<br>${selectedCity}, ${selectedState} ${selectedZip}`;
        } else {
            title.textContent = `Instant ${selectedService || ''} Estimate`;
            subtitle.textContent = selectedAddress || 'Your Estimate';
        }
        
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
                roofArea = buildingArea * 1.054;
                pitchLabel = 'Shallow pitch';
            } else if (building.roofPitch === 'medium') {
                roofArea = buildingArea * 1.202;
                pitchLabel = 'Medium pitch';
            } else if (building.roofPitch === 'steep') {
                roofArea = buildingArea * 1.414;
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
            relevantProducts.forEach((product, optionIndex) => {
                const priceLow = evaluateFormula(product.formulaLow, variables);
                const priceHigh = evaluateFormula(product.formulaHigh, variables);
                
                const priceLowFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(priceLow);
                const priceHighFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(priceHigh);
                
                productsHTML += `
                    <div class="iq-pricing-option-label">Option ${optionIndex + 1}</div>
                    <div class="iq-pricing-product">
                        <img class="iq-pricing-product-thumb" src="${product.productThumb}" alt="${product.product}">
                        <div class="iq-pricing-product-content">
                            <div class="iq-pricing-product-header">
                                <span class="iq-pricing-product-name">${product.product}</span>
                                <span class="iq-pricing-product-price">${priceLowFormatted} - ${priceHighFormatted}</span>
                            </div>
                            ${product.description ? '<p class="iq-pricing-product-description">' + product.description + '</p>' : ''}
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

    function updateContactButton() {
        // Update the "Request a Formal Quote" button with address query params
        const requestQuoteButton = document.getElementById('iq-request-quote');
        const params = new URLSearchParams({
            street: selectedStreet || '',
            city: selectedCity || '',
            state: selectedState || '',
            zip: selectedZip || ''
        });
        requestQuoteButton.href = contactURL + '?' + params.toString();
    }

    function saveEstimateData() {
        const relevantProducts = pricingDatabase.filter(p =>
            p.category === selectedCategory && p.service === selectedService
        );

        const entry = {
            id: Date.now(),
            savedAt: new Date().toLocaleString(),
            category: selectedCategory,
            service: selectedService,
            address: selectedAddress,
            street: selectedStreet,
            city: selectedCity,
            state: selectedState,
            zip: selectedZip,
            buildings: selectedBuildings.map((b, i) => {
                const perimeterMeters = turf.length(turf.lineString(b.polygon), { units: 'meters' });
                const perimeterFeet = perimeterMeters * 3.28084;

                let roofArea = b.area;
                if (b.roofPitch === 'shallow') roofArea = b.area * 1.054;
                else if (b.roofPitch === 'medium') roofArea = b.area * 1.202;
                else if (b.roofPitch === 'steep') roofArea = b.area * 1.414;

                const wallArea = b.stories ? perimeterFeet * b.stories * 10 : 0;
                const gutterLength = b.gutterPercent ? perimeterFeet * (b.gutterPercent / 100) : 0;
                const variables = { roofArea, wallArea, gutterLength };

                return {
                    name: logicalIndex(i) + ' Structure',
                    area: b.area,
                    roofPitch: b.roofPitch,
                    stories: b.stories,
                    gutterPercent: b.gutterPercent,
                    products: relevantProducts.map(p => ({
                        name: p.product,
                        priceLow: Math.floor(evaluateFormula(p.formulaLow, variables) * 100) / 100,
                        priceHigh: Math.floor(evaluateFormula(p.formulaHigh, variables) * 100) / 100
                    }))
                };
            })
        };

        // Load existing estimates
        let estimates = [];
        try {
            const raw = localStorage.getItem('iq-estimates');
            if (raw) estimates = JSON.parse(raw);
        } catch (e) {
            estimates = [];
        }

        // Append new estimate
        estimates.push(entry);

        // Optional: trim to last 50 estimates so storage doesn't grow forever
        if (estimates.length > 50) estimates = estimates.slice(-50);

        localStorage.setItem('iq-estimates', JSON.stringify(estimates));
    }

    // Generate and save a PDF of the estimate
    // Helper: load an image as a data URL (handles cross-origin)
    function loadImageAsDataURL(src, whiteBackground) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function() {
                try {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth;
                    c.height = img.naturalHeight;
                    const ctx = c.getContext('2d');
                    if (whiteBackground) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, c.width, c.height);
                    }
                    ctx.drawImage(img, 0, 0);
                    resolve(c.toDataURL(whiteBackground ? 'image/jpeg' : 'image/png', 0.9));
                } catch (e) {
                    resolve(null);
                }
            };
            img.onerror = function() { resolve(null); };
            img.src = src;
        });
    }

    // Helper: draw a rounded-corner clipping path on a 2D canvas context
    function roundedClip(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.clip();
    }

    // Helper: apply rounded corners to an image data URL
    function roundImageCorners(dataUrl, radius) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = function() {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                const ctx = c.getContext('2d');
                const r = radius * (img.naturalWidth / 100); // scale radius relative to image
                roundedClip(ctx, 0, 0, c.width, c.height, r);
                ctx.drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
            };
            img.onerror = function() { resolve(dataUrl); };
            img.src = dataUrl;
        });
    }

    async function generateEstimatePDF() {

        try {
            saveEstimateButton.disabled = true;
            saveEstimateButton.textContent = 'Saving...';

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'pt', 'letter');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 40;
            const contentWidth = pageWidth - margin * 2;
            let y = margin;

            // Helper: add a new page if needed
            function checkPage(needed) {
                if (y + needed > pageHeight - margin) {
                    pdf.addPage();
                    y = margin;
                }
            }

            // --- Pre-load all product images in parallel ---
            const relevantProducts = pricingDatabase.filter(p =>
                p.category === selectedCategory && p.service === selectedService
            );
            const productImageCache = {};
            await Promise.all(relevantProducts.map(async (product) => {
                if (product.productThumb) {
                    productImageCache[product.productThumb] = await loadImageAsDataURL(product.productThumb);
                }
            }));

            // --- Company header ---
            const logoHeight = 60;
            if (companyInfo.logo) {
                try {
                    const logoData = await loadImageAsDataURL(companyInfo.logo, true);
                    if (logoData) {
                        const img = new Image();
                        img.src = logoData;
                        await new Promise(r => { img.onload = r; });
                        const aspect = img.naturalWidth / img.naturalHeight;
                        const logoW = logoHeight * aspect;
                        pdf.addImage(logoData, 'JPEG', margin, y, logoW, logoHeight);
                    }
                } catch (e) {
                    // Logo failed to load, skip it
                }
            }

            // Company info text (right-aligned)
            pdf.setFontSize(9);
            pdf.setTextColor(99, 113, 130); // #637182
            const infoLines = [
                companyInfo.street,
                companyInfo.cityStateZip,
                companyInfo.phone,
                companyInfo.email,
                companyInfo.website,
                companyInfo.license
            ].filter(Boolean);
            infoLines.forEach((line, i) => {
                pdf.text(line, pageWidth - margin, y + 10 + i * 13, { align: 'right' });
            });

            y += Math.max(logoHeight, infoLines.length * 13) + 20;

            // Divider line
            pdf.setDrawColor(228, 232, 237); // #e4e8ed
            pdf.setLineWidth(0.5);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 30;

            // --- Title ---
            pdf.setFontSize(20);
            pdf.setTextColor(14, 16, 18); // #0e1012
            pdf.setFont(undefined, 'bold');
            const titleText = `Instant ${selectedService || ''} Estimate`;
            pdf.text(titleText, margin, y);
            y += 30;

            // Subtitle (Address)
            pdf.setFontSize(11);
            pdf.setTextColor(99, 113, 130); // #637182
            pdf.setFont(undefined, 'normal');
            if (selectedStreet && selectedCity && selectedState) {
                pdf.text(selectedStreet, margin, y);
                y += 14;
                pdf.text(`${selectedCity}, ${selectedState} ${selectedZip}`, margin, y);
                y += 20;
            } else if (selectedAddress) {
                let addr = selectedAddress.replace(/, United States$/, '');
                const parts = addr.split(',').map(s => s.trim());
                const street = parts[0] || '';
                const city = parts[1] || '';
                const stateZip = parts[2] || '';
                pdf.text(street, margin, y);
                y += 14;
                pdf.text(`${city}, ${stateZip}`, margin, y);
                y += 20;
            } else {
                pdf.text('Your Estimate', margin, y);
                y += 20;
            }

            // Date
            const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            pdf.setFontSize(10);
            pdf.setTextColor(99, 113, 130);
            pdf.text(dateStr, margin, y);
            y += 10;
            y += 10;

            // --- Structures ---
            for (let i = 0; i < selectedBuildings.length; i++) {
                const building = selectedBuildings[i];
                const buildingArea = building.area;
                const perimeterMeters = turf.length(turf.lineString(building.polygon), { units: 'meters' });
                const perimeterFeet = perimeterMeters * 3.28084;

                let roofArea = buildingArea;
                let pitchLabel = '';
                if (building.roofPitch === 'shallow') { roofArea = buildingArea * 1.1; pitchLabel = 'Shallow pitch'; }
                else if (building.roofPitch === 'medium') { roofArea = buildingArea * 1.2; pitchLabel = 'Medium pitch'; }
                else if (building.roofPitch === 'steep') { roofArea = buildingArea * 1.3; pitchLabel = 'Steep pitch'; }

                let wallArea = 0, storiesLabel = '';
                if (building.stories) {
                    wallArea = perimeterFeet * building.stories * 10;
                    storiesLabel = building.stories + (building.stories === 1 ? ' story' : ' stories');
                }

                let gutterLength = 0, gutterLabel = '';
                if (building.gutterPercent) {
                    gutterLength = perimeterFeet * (building.gutterPercent / 100);
                    gutterLabel = building.gutterPercent + '% coverage';
                }

                const variables = { roofArea, wallArea, gutterLength };
                const areaSqft = Math.round(buildingArea).toLocaleString();
                let detailParts = [areaSqft + ' ft²'];
                if (pitchLabel) detailParts.push(pitchLabel);
                if (storiesLabel) detailParts.push(storiesLabel);
                if (gutterLabel) detailParts.push(gutterLabel);
                const detailString = detailParts.join(' · ');

                // --- Thumbnail map capture + structure header (inline) ---
                const thumbnailEl = document.getElementById('pricing-structure-thumbnail-' + i);
                const mapThumbSize = 56;
                let mapThumbData = null;
                if (thumbnailEl) {
                    try {
                        const miniMap = miniMaps.find(m => m.getContainer().parentElement === thumbnailEl || m.getContainer() === thumbnailEl);
                        if (miniMap) {
                            miniMap.triggerRepaint();
                            await new Promise(r => miniMap.once('render', r));
                            
                            const glCanvas = miniMap.getCanvas();
                            const composite = document.createElement('canvas');
                            composite.width = glCanvas.width;
                            composite.height = glCanvas.height;
                            const ctx = composite.getContext('2d');
                            ctx.drawImage(glCanvas, 0, 0);
                            
                            const imgData = composite.toDataURL('image/png');
                            mapThumbData = await roundImageCorners(imgData, 6);
                        }
                    } catch (e) { /* skip */ }
                }

                checkPage(mapThumbSize + 30);

                // Draw thumbnail + structure header on same line
                const headerY = y;
                if (mapThumbData) {
                    pdf.addImage(mapThumbData, 'PNG', margin, y, mapThumbSize, mapThumbSize);
                }
                const textX = mapThumbData ? margin + mapThumbSize + 12 : margin;

                // Structure name
                pdf.setFontSize(14);
                pdf.setTextColor(14, 16, 18);
                pdf.setFont(undefined, 'bold');
                pdf.text(logicalIndex(i) + ' Structure', textX, y + 16);

                // Structure details
                pdf.setFontSize(10);
                pdf.setTextColor(99, 113, 130);
                pdf.setFont(undefined, 'normal');
                pdf.text(detailString, textX, y + 32);

                y += mapThumbSize + 8;

                // Divider
                pdf.setDrawColor(228, 232, 237);
                pdf.line(margin, y, pageWidth - margin, y);
                y += 14;

                // --- Products ---
                for (let optionIndex = 0; optionIndex < relevantProducts.length; optionIndex++) {
                    const product = relevantProducts[optionIndex];
                    const priceLow = evaluateFormula(product.formulaLow, variables);
                    const priceHigh = evaluateFormula(product.formulaHigh, variables);
                    const fmt = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);

                    const thumbSize = 44;
                    const cardPadding = 12;
                    const descLines = product.description ? pdf.splitTextToSize(product.description, contentWidth - thumbSize - cardPadding * 3 - 10) : [];
                    const cardHeight = Math.max(thumbSize + cardPadding * 2, 36 + descLines.length * 11);
                    checkPage(cardHeight + 26);

                    // Option label
                    pdf.setFontSize(10);
                    pdf.setTextColor(74, 93, 116); // #4a5d74
                    pdf.setFont(undefined, 'bold');
                    pdf.text('Option ' + (optionIndex + 1), margin, y);
                    y += 16;

                    // Product card background
                    pdf.setFillColor(242, 244, 248); // #f2f4f8
                    pdf.roundedRect(margin, y - 10, contentWidth, cardHeight, 6, 6, 'F');

                    // Product thumbnail image
                    const productImgData = productImageCache[product.productThumb];
                    const textLeft = margin + cardPadding;
                    if (productImgData) {
                        try {
                            const roundedProduct = await roundImageCorners(productImgData, 6);
                            pdf.addImage(roundedProduct, 'PNG', margin + cardPadding, y - 10 + cardPadding, thumbSize, thumbSize);
                        } catch (e) { /* skip */ }
                    }
                    const textX = productImgData ? margin + cardPadding + thumbSize + 10 : margin + cardPadding;
                    const textMaxWidth = contentWidth - (textX - margin) - cardPadding;

                    // Product name
                    pdf.setFontSize(11);
                    pdf.setTextColor(14, 16, 18);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(product.product, textX, y + 4);

                    // Price (right-aligned)
                    pdf.setTextColor(0, 122, 255); // #007aff
                    pdf.text(fmt(priceLow) + ' - ' + fmt(priceHigh), pageWidth - margin - cardPadding, y + 4, { align: 'right' });

                    if (product.description) {
                        pdf.setFontSize(9);
                        pdf.setFont(undefined, 'normal');
                        pdf.setTextColor(99, 113, 130);
                        pdf.text(descLines, textX, y + 20);
                    }

                    y += cardHeight + 8;
                }

                y += 20; // spacing between structures
            }

            // --- Disclaimer ---
            checkPage(50);
            pdf.setFontSize(8);
            pdf.setTextColor(150, 160, 175);
            pdf.setFont(undefined, 'italic');
            const disclaimer = 'This estimate is for informational purposes only and does not constitute a binding quote or contract. Please contact us for a detailed quote.';
            pdf.text(disclaimer, margin, y, { maxWidth: contentWidth });

            // Save
            const filename = 'Estimate - ' + (selectedService || 'Quote') + ' - ' + companyInfo.name + ' - ' + dateStr + '.pdf';
            pdf.save(filename);
         } finally {
            saveEstimateButton.disabled = false;
            saveEstimateButton.textContent = 'Save Estimate as PDF';
        }
    }


    // Store mini map instances for cleanup
    let miniMaps = [];

    function cleanupMiniMaps() {
        miniMaps.forEach(m => m.remove());
        miniMaps = [];
    }

    function createStructureThumbnail(containerId, polygon, center, padding = 15) {
        const bounds = new maplibregl.LngLatBounds();
        polygon.forEach(coord => bounds.extend(coord));
        
        const miniMap = new maplibregl.Map({
            container: containerId,
            style: {
                version: 8,
                sources: {
                    'google-satellite': {
                        type: 'raster',
                        tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
                        tileSize: 256,
                        attribution: '© Google'
                    }
                },
                layers: [{
                    id: 'satellite-layer',
                    type: 'raster',
                    source: 'google-satellite',
                    minzoom: 0,
                    maxzoom: 22
                }]
            },
            center: center.geometry.coordinates,
            zoom: 18,
            interactive: false,
            attributionControl: false,
            preserveDrawingBuffer: true
        });
        
        // Store bounds and padding on the map instance for re-fitting after resize
        miniMap._structureBounds = bounds;
        miniMap._fitPadding = padding;

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
                    'fill-opacity': 0.1
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
            miniMap.fitBounds(bounds, { padding: padding, duration: 0 });
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
                                <svg viewBox="-2 -20 28 22" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M 1 0 L 1 -12 L 0 -12 L 0 -13 L 12 -18 L 24 -13 L 24 -12 L 23 -12 L 23 0 L 14 0 L 14 -6 L 10 -6 L 10 0 Z" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">Shallow</span>
                            </div>
                            <div class="iq-visual-option${structure.roofPitch === 'medium' ? ' iq-active' : ''}" data-value="medium">
                                <svg viewBox="-2 -31 28 33" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M 1 0 L 1 -15 L 0 -15 L 0 -16 L 14 -27 L 27 -16 L 27 -15 L 26 -15 L 26 0 L 16 0 L 16 -6 L 12 -6 L 12 0 Z" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">Normal</span>
                            </div>
                            <div class="iq-visual-option${structure.roofPitch === 'steep' ? ' iq-active' : ''}" data-value="steep">
                                <svg viewBox="-2 -30 28 32" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M 1 0 L 1 -12 L 0 -12 L 0 -13 L 12 -28 L 24 -13 L 24 -12 L 23 -12 L 23 0 L 14 0 L 14 -6 L 10 -6 L 10 0 Z" fill="currentColor"/>
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
                                <svg viewBox="-2 -21 28 23" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M 1 0 L 1 -10 L 0 -10 L 0 -11 L 12 -19 L 24 -11 L 24 -10 L 23 -10 L 23 0 L 14 0 L 14 -6 L 10 -6 L 10 0 Z" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">1 Story</span>
                            </div>
                            <div class="iq-visual-option${structure.stories === 1.5 ? ' iq-active' : ''}" data-value="1.5">
                                <svg viewBox="-2 -32 31 34" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M 1 0 L 1 -15 L 0 -15 L 0 -16 L 14 -30 L 27 -16 L 27 -15 L 26 -15 L 26 0 L 16 0 L 16 -6 L 12 -6 L 12 0 Z" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">1.5 Story</span>
                            </div>
                            <div class="iq-visual-option${structure.stories === 2 ? ' iq-active' : ''}" data-value="2">
                                <svg viewBox="-2 -34 50 36" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M 1 0 L 1 -12 L 0 -12 L 0 -13 L 12 -20 L 21 -20 L 21 -23 L 20 -23 L 20 -24 L 33 -32 L 46 -24 L 46 -23 L 45 -23 L 45 0 L 36 0 L 36 -6 L 32 -6 L 32 0 L 20 0 L 20 -7 L 4 -7 L 4 0 Z" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">2 Story</span>
                            </div>
                            <div class="iq-visual-option${structure.stories === 2.5 ? ' iq-active' : ''}" data-value="2.5">
                                <svg viewBox="-2 -38 50 40" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M 1 0 L 1 -12 L 0 -12 L 0 -13 L 12 -21 L 21 -21 L 21 -25 L 20 -25 L 20 -26 L 33 -36 L 46 -26 L 46 -25 L 45 -25 L 45 0 L 35 0 L 35 -6 L 31 -6 L 31 0 L 20 0 L 20 -7 L 4 -7 L 4 0 Z" fill="currentColor"/>
                                </svg>
                                <span class="iq-visual-option-title">2.5 Story</span>
                            </div>
                            <div class="iq-visual-option${structure.stories === 3 ? ' iq-active' : ''}" data-value="3">
                                <svg viewBox="-12 -46 72 54" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M -9 6 L -9 -10 L -10 -10 L -10 -11 L 2 -19 L 15 -19 L 15 -28 L 14 -28 L 14 -29 L 34 -44 L 54 -29 L 54 -28 L 53 -28 L 53 -11 L 59 -7 L 59 -6 L 58 -6 L 58 6 L 36 6 L 36 -1 L 32 -1 L 32 6 L 20 6 L 20 -1 L 4 -1 L 4 6 L 2 6 L 2 -1 L -6 -1 L -6 6 Z" fill="currentColor"/>
                                </svg>
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
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/>
                                    <line x1="2" y1="2" x2="2" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                                </svg>
                                <span class="iq-visual-option-title">25%</span>
                            </div>
                            <div class="iq-visual-option${structure.gutterPercent === 50 ? ' iq-active' : ''}" data-value="50">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/>
                                    <line x1="2" y1="2" x2="2" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                                    <line x1="2" y1="22" x2="22" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                                </svg>
                                <span class="iq-visual-option-title">50%</span>
                            </div>
                            <div class="iq-visual-option${structure.gutterPercent === 75 ? ' iq-active' : ''}" data-value="75">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/>
                                    <line x1="2" y1="2" x2="2" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                                    <line x1="2" y1="22" x2="22" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                                    <line x1="22" y1="22" x2="22" y2="2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                                </svg>
                                <span class="iq-visual-option-title">75%</span>
                            </div>
                            <div class="iq-visual-option${structure.gutterPercent === 100 ? ' iq-active' : ''}" data-value="100">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
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
                        debugLog('Updated building', structureIndex, field, value);
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
    
            debugLog('Loading tile ' + x + ', ' + y + ' at zoom ' + z + ' from ' + tileURL);
            
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

    // Check URL query params for a pre-selected service category
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedCategory = urlParams.get('service-category');
    const matchedCategory = preselectedCategory
        ? categories.find(c => c.toLowerCase() === preselectedCategory.toLowerCase())
        : null;

    if (matchedCategory) {
        // Skip step 1 and jump straight to step 2
        selectedCategory = matchedCategory;
        goToStep(2);
    } else {
        // Initialize step 1
        renderCategories();
    }

}
})();