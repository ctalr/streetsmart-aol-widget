const REQUIRE_CONFIG = {
    async: true,
    locale: 'en',
    paths: {
        'react': 'https://unpkg.com/react@16.12.0/umd/react.production.min',
        'react-dom': 'https://unpkg.com/react-dom@16.12.0/umd/react-dom.production.min',
        'openlayers': 'https://cdnjs.cloudflare.com/ajax/libs/openlayers/4.3.3/ol',
        'lodash': 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.10/lodash.min'
    }
};

require(REQUIRE_CONFIG, [], function () {
    return define([
        'dojo/_base/declare',
        'dojo/on',
        'dojo/dom',
        'dijit/Tooltip',
        'jimu/BaseWidget',
        'jimu/WidgetManager',
        'esri/request',
        'esri/SpatialReference',
        'esri/geometry/Point',
        'esri/geometry/ScreenPoint',
        'esri/tasks/locator',
        "esri/tasks/query",
        "esri/geometry/webMercatorUtils",
        // 'http://localhost:8081/StreetSmartApi.js',
        'https://streetsmart.cyclomedia.com/api/v21.4/StreetSmartApi.js',
        './utils',
        './RecordingClient',
        './LayerManager',
        './MeasurementHandler',
        './SidePanelManager',
        './OverlayManager',
        './FeatureLayerManager',
        './AttributeManager',
        './arcgisToGeojson',
    ], function (
        declare,
        on,
        dom,
        Tooltip,
        BaseWidget,
        WidgetManager,
        esriRequest,
        SpatialReference,
        Point,
        ScreenPoint,
        Locator,
        Query,
        webMercatorUtils,
        StreetSmartApi,
        utils,
        RecordingClient,
        LayerManager,
        MeasurementHandler,
        SidePanelManager,
        OverlayManager,
        FeatureLayerManager,
        Attributemanager,
        geojsonUtils
    ) {
        //To create a widget, you need to derive from BaseWidget.
        return declare([BaseWidget], {
            // Custom widget code goes here
            baseClass: 'jimu-widget-streetsmartwidget',

            // This property is `set by the framework when widget is loaded.
            name: 'Street Smart by CycloMedia',

            _zoomThreshold: null,
            _viewerType: StreetSmartApi.ViewerType.PANORAMA,
            _listeners: [],
            _disableLinkToMap: false,

            // CM properties
            _cmtTitleColor: '#98C23C',
            _apiKey: 'C3oda7I1S_49-rgV63wtWbgtOXcVe3gJWPAVWnAZK3whi7UxCjMNWzIJyv4Fmrcp',

            _mapIdLayerId: {},
            _visibleLayers: {},

            // Initial construction, might not be added to DOM yet.
            postCreate() {
                this.inherited(arguments);

                this.wkid = parseInt(this.config.srs.split(':')[1]);
                this.streetIndicatorShouldBeVisible = true

                utils.setProj4(CM.Proj4.getProj4());

                this._locator = new Locator("https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer");

                if(!this.config.showStreetName){
                    this.streetIndicatorContainer.classList.add('hidden');
                }

                this._recordingClient = new RecordingClient({
                    config: this.config,
                    apiKey: this._apiKey,
                    map: this.map,
                });
                this._layerManager = new LayerManager({
                    wkid: this.wkid,
                    map: this.map,
                    onRecordingLayerClick: this._handleRecordingClick.bind(this),
                    setPanoramaViewerOrientation: this.setPanoramaViewerOrientation.bind(this),
                    addEventListener: this.addEventListener.bind(this),
                    config: this.config,
                    nls: this.nls,
                    removeEventListener: this.removeEventListener.bind(this),
                });

                this._measurementHandler = new MeasurementHandler({
                    wkid: this.wkid,
                    map: this.map,
                    layer: this._layerManager.measureLayer,
                    StreetSmartApi: StreetSmartApi
                });

                this._sidePanelManager = new SidePanelManager({
                    sidePanel: this.sidePanel,
                    panoramaViewerDiv: this.panoramaViewerDiv,
                    widget: this,
                });

                this._overlayManager = new OverlayManager({
                    widget: this,
                    wkid: this.wkid,
                    map: this.map,
                    config: this.config,
                    StreetSmartApi: StreetSmartApi,
                });

                this._featureLayerManager = new FeatureLayerManager({
                    widget: this,
                    map: this.map,
                    wkid: this.wkid,
                    StreetSmartApi: StreetSmartApi
                });

                this._attributeManager = new Attributemanager({
                    widget: this,
                    map: this.map,
                    wkid: this.wkid,
                    config: this.config,
                    nls: this.nls,
                    api: StreetSmartApi
                })

                this._applyWidgetStyle();
                this._determineZoomThreshold();
            },

            startup() {
                this.inherited(arguments);
            },

            _handleRecordingClick(event) {
                const recordingId = event.graphic.attributes.recordingId;
                this.query(recordingId);
            },

            async _initApi() {
                if (this.config.agreement !== true) {
                    alert(this.nls.agreementWarning);
                    return
                }

                const CONFIG = {
                    targetElement: this.panoramaViewerDiv, // I have no idea where this comes from
                    username: this.config.uName,
                    password: this.config.uPwd,
                    apiKey: this._apiKey,
                    srs: this.config.srs,
                    locale: this.config.locale,
                    configurationUrl: this.config.atlasHost + '/configuration',
                    addressSettings: {
                        locale: this.config.locale,
                        database: 'Nokia'
                    }
                };

                return StreetSmartApi.init(CONFIG).then(() => {
                    this.loadingIndicator.classList.add('hidden');
                    this._bindInitialMapHandlers();
                    this._loadRecordings();
                    this._centerViewerToMap();
                    this.streetNameLayerID = this._overlayManager.addStreetNameLayer();

                    const unitPrefs = _.get(StreetSmartApi, "Settings.UNIT_PREFERENCE")
                    if(unitPrefs){
                        const units = this.config.units || unitPrefs.DEFAULT
                        if(Object.values(unitPrefs).includes(units)){
                            StreetSmartApi.Settings.setUnitPreference(units);
                        }
                    }

                });
            },

            _bindInitialMapHandlers() {
                const measurementChanged = StreetSmartApi.Events.measurement.MEASUREMENT_CHANGED;
                this.addEventListener(StreetSmartApi, measurementChanged, this._handleMeasurementChanged.bind(this));
                this.addEventListener(this.map, 'extent-change', this._handleExtentChange.bind(this));
                this.addEventListener(this.map, 'pan-end', this._handleMapMovement.bind(this));
                this.addEventListener(this.map, 'click', this._handleMapClick.bind(this));
                this._sidePanelManager.bindEventListeners()
            },

            _handleMapClick(e) {
                const mapFeature = e.graphic
                if(!mapFeature) {
                    return
                }

                const layer = mapFeature.getLayer();
                if(layer.type !== 'Feature Layer') return

                const wm = WidgetManager.getInstance();
                const editWidgets = wm.getWidgetsByName('Edit');

                if (editWidgets.length === 0) {
                    this._attributeManager.showInfoOfFeature(mapFeature);
                }

                if (!layer.getEditCapabilities().canUpdate) return;

                // rotate towards clicked feature
                const extent = mapFeature.geometry.getExtent && mapFeature.geometry.getExtent();
                const centroid = (extent && extent.getCenter()) || mapFeature.geometry;
                const featureWkid = centroid.spatialReference.latestWkid || centroid.spatialReference.wkid
                this._panoramaViewer.lookAtCoordinate([centroid.x, centroid.y], `EPSG:${featureWkid}`);

                const idField = layer.objectIdField;
                const wkid = layer.spatialReference.latestWkid  || layer.spatialReference.wkid

                const meaurementType = geojsonUtils.EsriGeomTypes[layer.geometryType]
                const typeToUse = meaurementType && meaurementType[0]

                if(typeToUse && this.config.allowEditing) {
                    this._selectedLayerID = layer.id;
                    this._get3DFeatures(layer, [mapFeature.attributes[idField]], wkid)
                        .then(this._create3DRequestToStartMeasurementHandler(mapFeature, idField, wkid, typeToUse))
                }
            },

            _handleMapMovement(e){
                const diff = e.delta.x + e.delta.y;
                if(!this._disableLinkToMap && this.config.linkMapMove === true && !this._panoramaViewer.props.activeMeasurement) {
                    if(diff) {
                        this._centerViewerToMap(e.extent.getCenter());
                    }
                }else if(this._disableLinkToMap) {
                    this._disableLinkToMap = false;
                }
            },

            _handleMeasurementChanged(e) {
                const {panoramaViewer, activeMeasurement} = e.detail;
                const newViewer = panoramaViewer;
                this._handleViewerChanged(newViewer);
                this._measurementHandler.draw(e);
                this.inMeasurement = !!activeMeasurement

                if (this.config.saveMeasurements) {
                    this._measurementDetails = activeMeasurement;
                    if(!activeMeasurement){
                        this._selectedFeatureID = null;
                    }
                }
                this._measurementHandler.draw(e);

                if(!activeMeasurement && this.config.allowEditing){
                    this.map.infoWindow.hide()
                }

                if(this.config.showStreetName) {
                    if (activeMeasurement) {
                        this.streetIndicatorContainer.classList.add('hidden');
                        this.streetIndicatorHiddenDuringMeasurement = true
                    } else {
                        if(this.streetIndicatorShouldBeVisible) {
                            this.streetIndicatorContainer.classList.remove('hidden');
                        }
                        this.streetIndicatorHiddenDuringMeasurement = false
                    }
                }
            },

            /**
             * Handles the viewer change and event handler rebinding,
             * starting measurement mode changes the viewer.
             */
            _handleViewerChanged(newViewer) {
                // Handle initial viewer creation
                if (!this._panoramaViewer && newViewer) {
                    this._panoramaViewer = newViewer;
                    this._layerManager.addLayers();
                    this._bindViewerDependantEventHandlers();
                    this._setButtonVisibilityInApi();
                    this._handleImageChange();
                    // this._drawDraggableMarker();

                    if(this.config.navigation === false){
                        this._hideNavigation();
                    }
                    return;
                }


                // Update the event handlers and everything else once the viewer changed
                // Always make sure newViewer is set as newViewer can be undefined
                // while this._panoramaViewer can be null
                if (newViewer && newViewer !== this._panoramaViewer) {
                    this.removeEventListener(this._viewChangeListener);
                    this.removeEventListener(this._imageChangeListener);
                    this.removeEventListener(this._featureClickListener);
                    this.removeEventListener(this._layerTogleListener);
                    this._panoramaViewer = newViewer;
                    this._bindViewerDependantEventHandlers({ viewerOnly: true});
                }
            },

            _create3DRequestToStartMeasurementHandler(mapFeature, idField, wkid, typeToUse) {
                return (res) => {
                    const feature  = (!!res && res.features && (wkid == this.config.srs.split(':')[1]))
                        ? geojsonUtils.arcgisToGeoJSON(res.features[0], idField)
                        : geojsonUtils.arcgisToGeoJSON(mapFeature, idField);
                    if(!feature) return
                    const newWkid = (wkid == this.config.srs.split(':')[1])
                        ? wkid
                        : (mapFeature.geometry.spatialReference.latestWkid || mapFeature.geometry.spatialReference.wkid);
                    if (newWkid != this.config.srs.split(':')[1]) return;

                    this._selectedFeatureID = feature.properties[idField];
                    if (feature && feature.geometry && feature.geometry.type === 'Point' && (wkid != this.config.srs.split(':')[1])) {
                        feature.geometry.coordinates = [feature.geometry.coordinates[0], feature.geometry.coordinates[1], res.features[0].geometry.z];
                    }

                    const measurementInfo = geojsonUtils.createFeatureCollection([feature], newWkid);
                    this.startMeasurement(typeToUse, measurementInfo)
                }
            },

            _get3DFeatures(layer, featureIds, wkid) {
                if(layer.type !== 'Feature Layer') return Promise.resolve();
                if(!layer.hasZ) return Promise.resolve();

                const token = layer.credential &&  layer.credential.token;
                const options = {
                    url: `${layer.url}/query?`,
                    content: {
                        f: 'json',
                        returnGeometry: true,
                        returnZ: true,
                        outFields: '*',
                        objectIds: [...featureIds],
                        outSpatialReference: wkid,
                    }
                };
                if(token) options.content.token = token;

                return esriRequest(options)
            },

            _setButtonVisibilityInApi() {
                const bv = this.config.buttonVisibility;
                const helperFunction = (key) => {
                    if(bv[key] !== undefined) {
                        const button = StreetSmartApi.PanoramaViewerUi.buttons[key];
                        this._panoramaViewer.toggleButtonEnabled(button, !!bv[key]);
                    } else {
                      console.warn('undefined key found, ' + key);
                    }
                };
                if(bv){
                    helperFunction( 'OVERLAYS');
                    helperFunction( 'ELEVATION');
                    helperFunction( 'REPORT_BLURRING');
                    helperFunction( 'OPEN_OBLIQUE');
                    helperFunction( 'MEASURE');
                    helperFunction( 'SAVE_IMAGE');
                    helperFunction( 'IMAGE_INFORMATION');
                    helperFunction( 'ZOOM_IN');
                    helperFunction( 'ZOOM_OUT');
                }
            },

            // Adds event listeners which are automatically
            // cleared onClose
            addEventListener(target, eventName, callback) {
                let listener = on(target, eventName, callback);

                // Using dojo on doesn't always return a listener.
                // For the panoramaViewer events it returns the panoramaViewer itself.
                if (!listener.remove) {
                    listener = {
                        remove: () => {
                            target.off(eventName, callback);
                        }
                    }
                }

                this._listeners.push(listener);
                return listener;
            },

            removeEventListener(listener) {
                listener.remove();

                const index = this._listeners.indexOf(listener);
                this._listeners.splice(index, 1);
            },

            _openApiWhenZoomedIn() {
                this.zoomWarning.classList.remove('hidden');
                const listener = this.addEventListener(this.map, 'zoom-end', (zoomEvent) => {
                    if (this.map.getScale() < this._zoomThreshold) {
                        this.zoomWarning.classList.add('hidden');
                        this._initApi();
                        this.removeEventListener(listener);
                    }
                });
            },

            _handleFeatureClick (event) {
                const { detail } = event;
                const mapLayers = _.values(this.map._layers);
                const featureLayers = _.filter(mapLayers, l => l.type === 'Feature Layer');
                const clickedLayer = featureLayers.find((l) => l.name === detail.layerName);

                if (clickedLayer) {
                    const field = clickedLayer.objectIdField
                    const clickedFeatureID = detail.featureProperties[field]
                    const feature = clickedLayer.graphics.find((g) => g.attributes[field] === clickedFeatureID)
                    const wkid = clickedLayer.spatialReference.latestWkid  || clickedLayer.spatialReference.wkid
                    this._attributeManager.showInfoById(clickedLayer, clickedFeatureID)

                    if(!feature) return

                    if(clickedLayer.type !== 'Feature Layer' || !clickedLayer.getEditCapabilities().canUpdate) return;

                    const meaurementType = geojsonUtils.EsriGeomTypes[clickedLayer.geometryType]
                    const typeToUse = meaurementType && meaurementType[0]

                    if(typeToUse && this.config.allowEditing) {
                        this._selectedLayerID = clickedLayer.id;
                        this._get3DFeatures(clickedLayer, [clickedFeatureID], wkid)
                            .then(this._create3DRequestToStartMeasurementHandler(feature, field, wkid, typeToUse))
                    }

                }
            },

            _handleLayerVisibilityChange(info) {
                const {layerId, visibility} = info.detail;

                if(layerId=== this.streetNameLayerID && this.config.showStreetName && !this.streetIndicatorHiddenDuringMeasurement ) {
                    this.streetIndicatorShouldBeVisible = visibility
                    if(visibility){
                        this.streetIndicatorContainer.classList.remove('hidden');
                    }else{
                        this.streetIndicatorContainer.classList.add('hidden');
                    }
                }
                else {
                    this._visibleLayers[layerId] = visibility;
                }
            },

            _bindViewerDependantEventHandlers(options) {
                const opts = Object.assign({}, options, { viewerOnly: false });
                const panoramaEvents = StreetSmartApi.Events.panoramaViewer;
                const viewerEvents = StreetSmartApi.Events.viewer;
                this._viewChangeListener = this.addEventListener(this._panoramaViewer, panoramaEvents.VIEW_CHANGE, this._handleConeChange.bind(this));
                this._imageChangeListener = this.addEventListener(this._panoramaViewer, panoramaEvents.IMAGE_CHANGE, this._handleImageChange.bind(this));
                this._featureClickListener = this.addEventListener(this._panoramaViewer, panoramaEvents.FEATURE_CLICK, this._handleFeatureClick.bind(this));
                this._layerTogleListener = this.addEventListener(this._panoramaViewer, viewerEvents.LAYER_VISIBILITY_CHANGE, this._handleLayerVisibilityChange.bind(this));
                this._panoramaViewer.showAttributePanelOnFeatureClick(false);
                if (!opts.viewerOnly) {
                    this.addEventListener(this.map, 'zoom-end', this._handleConeChange.bind(this));
                }

                // if we need to save measurements overwrite the default click behaviour.
                if(this.config.saveMeasurements && !this._measurementButtonOverwrideTimer) {
                    const clickHandler = this._handleMeasurementPanelToggle.bind(this);
                    // only supports one viewer, having multiple viewers will break this.
                    const replaceMeasurementButton = () => {
                        const measurementButton = document.getElementsByClassName('glyphicon novaicon-ruler-1')[0];
                        if (measurementButton && measurementButton.parentNode.onclick !== clickHandler) {
                            const button = measurementButton.parentNode;
                            const new_element = button.cloneNode(true);
                            new_element.onclick = clickHandler;
                            button.parentNode.replaceChild(new_element, button);
                        }
                    };

                    this._measurementButtonOverwrideTimer = setInterval(replaceMeasurementButton, 50);
                }
            },

            _handleMeasurementPanelToggle(e) {
                this._sidePanelManager.toggleMeasurementSidePanel(true);
            },

            // We do not use removeEventListener for this,
            // as removing stuff in an array is a bad idea.
            _removeEventListeners() {
                this._listeners.forEach((listener) => {
                    listener.remove();
                });
                this._listeners = [];
            },

            _handleConeChange() {
                this._layerManager.updateViewingCone(this._panoramaViewer);
            },

            _handleImageChange() {
                this._handleConeChange();
                this._overlayManager.addOverlaysToViewer();


                if(!this._disableLinkToMap && this.config.linkMapMove === true && !this._panoramaViewer.props.activeMeasurement){
                    const recording = this._panoramaViewer.getRecording();
                    if (!recording || !recording.xyz) {
                        return;
                    }

                    const x = recording.xyz[0];
                    const y = recording.xyz[1];

                    if (!x || !y) {
                        return;
                    }

                    const coord = new Point(x, y, this._layerManager.srs);
                    // Transform local SRS to Web Mercator:
                    const coordLocal = utils.transformProj4js(coord, this.map.spatialReference.wkid);
                    this.map.centerAt(coordLocal);
                    this._disableLinkToMap = true;
                }

                const rec = this._panoramaViewer.getRecording();
                const xyz = rec.xyz;
                const srs = rec.srs;
                const point = new Point(xyz[0], xyz[1], new SpatialReference(Number(srs.split(':')[1])));
                const location = utils.transformProj4js(point, 102100);
                this._locator.locationToAddress(location, 0, (result) => {
                    const el = this.streetIndicator;
                    if(el){
                        el.innerHTML = result.address.Address;
                    }
                });
            },

            _handleExtentChange() {
                this._loadRecordings();
            },

            _loadRecordings() {
                if (!this.config.navigation) {
                    return;
                }
                if (this.map.getScale() < this._zoomThreshold) {
                    this._recordingClient.load().then((response) => {
                        this._layerManager.updateRecordings(response);
                    });
                } else {
                    this._layerManager.updateRecordings([]);
                }
            },

            _applyWidgetStyle() {
                const panel = this.getPanel();

                // Set title color for Widget.
                if (panel.titleNode) {
                    panel.titleNode.style.backgroundColor = this._cmtTitleColor;
                    if (panel.titleLabelNode) panel.titleLabelNode.style.color = 'white';
                }

                // Remove padding (white 'border') around viewer.
                const container = panel.containerNode.children[0];
                if(container){
                    container.style.padding = '0px';
                }
            },

            _centerViewerToMap(center) {
                const mapCenter = center || this.map.extent.getCenter();
                const mapSRS = this.config.srs.split(':')[1];
                const localCenter = utils.transformProj4js(mapCenter, mapSRS);

                // Manually fire these events as they are fired too early by the API,
                // we can't listen to them yet.
                this.query(`${localCenter.x},${localCenter.y}`);
            },

            query(query) {
                const timeTravelVisible = this.config.timetravel !== undefined ? this.config.timetravel : false;

                return StreetSmartApi.open(query, {
                        viewerType: [this._viewerType],
                        srs: this.config.srs,
                        panoramaViewer: {
                            closable: false,
                            maximizable: true,
                            timeTravelVisible,
                            measureTypeButtonVisible: !this.config.saveMeasurements,
                            measureTypeButtonStart: !this.config.saveMeasurements,
                            measureTypeButtonToggle: !this.config.saveMeasurements,
                        },
                    }
                ).then(result => {
                    const viewer = result.length ? result[0] : null;
                    this._handleViewerChanged(viewer);
                    this._handleConeChange();
                });
            },

            setPanoramaViewerOrientation(orientation) {
                const currentOrientation = this._panoramaViewer.getOrientation();
                this._panoramaViewer.setOrientation(Object.assign({}, currentOrientation, orientation));
            },

            _determineZoomThreshold: function () {
                // Excplcit zoom level replaced for zoom scale values for consistency.
                let zoomThreshold = 1200;

                this._zoomThreshold = zoomThreshold;
                return zoomThreshold;
            },

            _hideNavigation() {
                setTimeout(() => {
                    this._panoramaViewer.toggleRecordingsVisible(false);
                });
            },

            onOpen() {
                const zoomLevel = this.map.getScale();

                // Only open when the current zoom scale is close enough to the ground.
                if (zoomLevel < this._zoomThreshold) {
                    this._initApi();
                } else {
                    this._openApiWhenZoomedIn();
                }
            },

            onClose() {
                StreetSmartApi.destroy({ targetElement: this.panoramaViewerDiv });
                this.loadingIndicator.classList.remove('hidden');
                this.streetIndicator.innerHTML = '';
                this._overlayManager.reset();
                this._removeEventListeners();
                this._layerManager.removeLayers();
                this._panoramaViewer = null;
                this._selectedFeatureID = null;
                this._measurementButtonOverwrideTimer = clearInterval(this._measurementButtonOverwrideTimer);
                this._saveButtonOverwrideTimer = clearInterval(this._saveButtonOverwrideTimer);

                this._mapIdLayerId = {};
                this._visibleLayers = {};

                if (this._sidePanelManager && this._sidePanelManager.removeEventListener) {
                    this._sidePanelManager.removeEventListener();
                }

                this._sidePanelManager.toggleMeasurementSidePanel(false);
            },

            _drawDraggableMarker() {
                const nav = this.panoramaViewerDiv.querySelector('.navbar .navbar-right .nav');
                if(!nav) return;

                const exampleButton = nav.querySelector('.btn');

                // Draw the actual button in the same style as the other buttons.
                const markerButton = dojo.create('button', {
                    id: 'addMapDropBtn',
                    class: exampleButton.className,
                    draggable: true,
                    ondragend: this._handleMarkerDrop.bind(this),
                });

                nav.appendChild(markerButton);
                const toolTipMsg = this.nls.tipDragDrop;

                new Tooltip({
                    connectId: markerButton,
                    label: toolTipMsg,
                    position: ['above']
                });
            },

            _handleMarkerDrop(e) {
                e.preventDefault();

                // Figure out on what pixels (relative to the map) the marker was dropped.
                const containerOffset = this.map.container.getBoundingClientRect();
                const mapRelativePixels = {
                    x: e.clientX - containerOffset.x,
                    y: e.clientY - containerOffset.y,
                };

                const sPoint = new ScreenPoint(mapRelativePixels.x, mapRelativePixels.y);
                const mPoint = this.map.toMap(sPoint);
                const vPoint = utils.transformProj4js(mPoint, this.wkid);

                this.query(`${vPoint.x},${vPoint.y}`);
            },

            startMeasurement(type, geojson){
                let geometry;
                switch (type) {
                    case 'POINT':
                        geometry = StreetSmartApi.MeasurementGeometryType.POINT;
                        StreetSmartApi.startMeasurementMode(this._panoramaViewer, { geometry });
                        break;
                    case 'LINE':
                        geometry = StreetSmartApi.MeasurementGeometryType.LINESTRING;
                        StreetSmartApi.startMeasurementMode(this._panoramaViewer, { geometry });
                        break;
                    case 'POLYGON':
                        geometry = StreetSmartApi.MeasurementGeometryType.POLYGON;
                        StreetSmartApi.startMeasurementMode(this._panoramaViewer, { geometry });
                        break;
                    default:
                        console.error('API ERROR: unknown measurement geometry type. Could be undefined');
                        break;
                }
                // collapse the sidebar after a 10 frame delay,
                // doing it directly throws an exception as the measurement mode hasn't started yet.
                window.setTimeout(() => {
                    this._panoramaViewer.toggleSidebarExpanded(false)
                    if(geojson){
                        StreetSmartApi.setActiveMeasurement(geojson)
                    }
                }, 160)

                // if we need to save measurements overwrite the default click behaviour.
                if(this.config.saveMeasurements && !this._saveButtonOverwrideTimer && this._selectedLayerID) {
                    const clickHandler = this._handleMeasurementPanelToggle.bind(this);
                    // only supports one viewer, having multiple viewers will break this.
                    const placeSaveButton = () => {
                        const panel = document.getElementsByClassName('floating-panel-controls')[0];
                        if (panel && panel.children.length !== 2) {
                            const button = panel.childNodes[0];
                            const clone = button.cloneNode(true);
                            clone.childNodes[0].classList.remove('novaicon-navigation-down-3');
                            clone.childNodes[0].classList.add('novaicon-data-download-2');
                            panel.insertBefore(clone, button);
                            clone.onclick = this._saveMeasurement.bind(this);
                        }
                    };

                    this._saveButtonOverwrideTimer = setInterval(placeSaveButton, 50);
                } else if(this._saveButtonOverwrideTimer && !this._selectedLayerID ) {
                    this._saveButtonOverwrideTimer = clearInterval(this._saveButtonOverwrideTimer);
                }
            },

            _rerender(){
                this._overlayManager.addOverlaysToViewer();
            },

            _saveMeasurement() {
                const layer = this.map.getLayer(this._selectedLayerID);
                if(layer) {
                    const editID = this._selectedFeatureID
                    this._featureLayerManager._saveMeasurementsToLayer(layer, this._measurementDetails, editID).then((r) => {

                        const changes = _.get(r, 'addResults[0]') || _.get(r, 'updateResults[0]')

                        if(changes) {
                            const featureId = changes.objectId
                            if (this._layerUpdateListener) this._layerUpdateListener.remove();
                            this._layerUpdateListener = this.addEventListener(layer, 'update-end', () => {
                                this._rerender.bind(this)()
                                this._attributeManager.showInfoById(layer, featureId)
                                if (this._layerUpdateListener) this._layerUpdateListener.remove();
                            });
                        }
                    });

                    StreetSmartApi.stopMeasurementMode();
                }
            },

            // communication method between widgets
            onReceiveData(name, widgetId, data) {
                if (name !== 'Search'){
                    return;
                }

                if (data.selectResult) {
                    const searchedPoint = data.selectResult.result.feature.geometry;
                    const searchedPtLocal = utils.transformProj4js(searchedPoint, this.wkid);
                    this.query((`${searchedPtLocal.x},${searchedPtLocal.y}`));
                }
            },
        });
    });
});
