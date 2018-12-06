const REQUIRE_CONFIG = {
    async: true,
    locale: 'en',
    paths: {
        'react': 'https://unpkg.com/react@16.4.1/umd/react.production.min',
        'react-dom': 'https://unpkg.com/react-dom@16.4.1/umd/react-dom.production.min',
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
        'esri/SpatialReference',
        'esri/geometry/Point',
        'esri/geometry/ScreenPoint',
        'esri/tasks/locator',
        "esri/geometry/webMercatorUtils",
        'https://streetsmart.cyclomedia.com/api/v18.14/StreetSmartApi.js',
        './utils',
        './RecordingClient',
        './LayerManager',
        './MeasurementHandler',
        './OverlayManager'
    ], function (
        declare,
        on,
        dom,
        Tooltip,
        BaseWidget,
        SpatialReference,
        Point,
        ScreenPoint,
        Locator,
        webMercatorUtils,
        StreetSmartApi,
        utils,
        RecordingClient,
        LayerManager,
        MeasurementHandler,
        OverlayManager
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

            // Initial construction, might not be added to DOM yet.
            postCreate() {
                this.inherited(arguments);

                this.wkid = parseInt(this.config.srs.split(':')[1]);

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
                    removeEventListener: this.removeEventListener.bind(this),
                });

                this._measurementHandler = new MeasurementHandler({
                    wkid: this.wkid,
                    map: this.map,
                    layer: this._layerManager.measureLayer,
                    StreetSmartApi: StreetSmartApi
                });

                this._overlayManager = new OverlayManager({
                    wkid: this.wkid,
                    map: this.map,
                    config: this.config,
                    StreetSmartApi: StreetSmartApi,
                });

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
                });
            },

            _bindInitialMapHandlers() {
                const measurementChanged = StreetSmartApi.Events.measurement.MEASUREMENT_CHANGED;
                this.addEventListener(StreetSmartApi, measurementChanged, this._handleMeasurementChanged.bind(this));
                this.addEventListener(this.map, 'extent-change', this._handleExtentChange.bind(this));
                this.addEventListener(this.map, 'pan-end', this._handleMapMovement.bind(this));
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
                const newViewer = e.detail.panoramaViewer;
                this._handleViewerChanged(newViewer);
                this._measurementHandler.draw(e);
                if(this.config.showStreetName) {
                    if (e.detail.activeMeasurement) {
                        this.streetIndicatorContainer.classList.add('hidden');
                    } else {
                        this.streetIndicatorContainer.classList.remove('hidden');
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
                    this._drawDraggableMarker();

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
                    this._panoramaViewer = newViewer;
                    this._bindViewerDependantEventHandlers({ viewerOnly: true});
                }
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
                    if (zoomEvent.level > this._zoomThreshold) {
                        this.zoomWarning.classList.add('hidden');
                        this._initApi();
                        this.removeEventListener(listener);
                    }
                });
            },

            _bindViewerDependantEventHandlers(options) {
                const opts = Object.assign({}, options, { viewerOnly: false });
                this._viewChangeListener = this.addEventListener(this._panoramaViewer, StreetSmartApi.Events.panoramaViewer.VIEW_CHANGE, this._handleConeChange.bind(this));
                this._imageChangeListener = this.addEventListener(this._panoramaViewer, StreetSmartApi.Events.panoramaViewer.IMAGE_CHANGE, this._handleImageChange.bind(this));
                if (!opts.viewerOnly) {
                    this.addEventListener(this.map, 'zoom-end', this._handleConeChange.bind(this));
                }
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
                if (this.config.overlay === true) {
                    this._overlayManager.addOverlaysToViewer();
                }

                const rec = this._panoramaViewer.getRecording();
                const xyz = rec.xyz;
                const srs = rec.srs;
                const point = new Point(xyz[0], xyz[1], new SpatialReference(Number(srs.split(':')[1])));
                const location = utils.transformProj4js(point, 102100);
                this._locator.locationToAddress(location, 0, (result) => {
                    const el = this.streetIndicator;
                    if(el){
                        el.innerHTML = result.address.ShortLabel;
                    }
                });

                if(!this._disableLinkToMap && this.config.linkMapMove === true && !this._panoramaViewer.props.activeMeasurement){
                    const viewer = this._panoramaViewer._panoramaViewer;
                    const recording = viewer._activeRecording;
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
            },

            _handleExtentChange() {
                this._loadRecordings();
            },

            _loadRecordings() {
                if (!this.config.navigation) {
                    return;
                }
                if (this.map.getZoom() > this._zoomThreshold) {
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
                panel.containerNode.children[0].style.padding = '0px';
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
                const timeTravelVisible = this.config.timetravel !== undefined && this.config.navigation === true ? this.config.timetravel : false;
                const navbarVisible = this.config.navigation !== undefined ? this.config.navigation : true;


                return StreetSmartApi.open(query, {
                        viewerType: [this._viewerType],
                        srs: this.config.srs,
                        panoramaViewer: {
                            closable: false,
                            maximizable: true,
                            timeTravelVisible,
                            navbarVisible,
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
                const maxMapZoom = this.map.getMaxZoom();
                let zoomThreshold = maxMapZoom - 3;

                if (maxMapZoom > 20) {
                    zoomThreshold = maxMapZoom - 5;
                }
                this._zoomThreshold = zoomThreshold;
                return zoomThreshold;
            },

            _hideNavigation() {
                this._panoramaViewer.toggleNavbarVisible(false);
                this._panoramaViewer.toggleTimeTravelVisible(false);
                setTimeout(() => {
                    this._panoramaViewer.toggleRecordingsVisible(false);
                });
            },

            onOpen() {
                const zoomLevel = this.map.getZoom();

                // Only open when the zoomThreshold is reached.
                if (zoomLevel > this._zoomThreshold) {
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
