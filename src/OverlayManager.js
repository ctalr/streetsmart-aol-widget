define([
    'dojo/_base/Color',
    'dojo/on',
    'dojo/_base/array',
    'esri/request',
    'esri/geometry/Point',
    'esri/geometry/Multipoint',
    'esri/geometry/Polygon',
    'esri/geometry/ScreenPoint',
    'esri/geometry/Extent',
    'esri/graphic',
    'esri/symbols/SimpleMarkerSymbol',
    'esri/symbols/SimpleLineSymbol',
    'esri/symbols/SimpleFillSymbol',
    'esri/renderers/SimpleRenderer',
    'esri/layers/GraphicsLayer',
    'esri/SpatialReference',
    './arcgisToGeojson',
    './utils',
    './SldFactory',
], function (
    Color,
    on,
    dojoArray,
    esriRequest,
    Point,
    Multipoint,
    Polygon,
    ScreenPoint,
    Extent,
    Graphic,
    SimpleMarkerSymbol,
    SimpleLineSymbol,
    SimpleFillSymbol,
    SimpleRenderer,
    GraphicsLayer,
    SpatialReference,
    geoJsonUtils,
    utils,
    SLD,
) {
    return class LayerManager {
        constructor({ map, wkid, config, StreetSmartApi, widget }) {
            this.map = map;
            this.widget = widget;
            this.wkid = wkid;
            this.config = config;
            this.api = StreetSmartApi;
            this.defaultSymbol = {
                color: { r: 223, g: 115, b: 255, a: 1},
                size: 11,
                type: 'simplemarkersymbol',
                style: 'square',
                xoffset: 0,
                yoffset: 0,
                outline: {
                    color: { r: 26, g: 26, b: 26, a: 1 },
                    width: 2,
                    type: 'simplelinesymbol',
                    style: 'solid'
                },
            };
            this.overlays = [];
            this.overlaysByName = {};
            this.requestQueue = [];
            this.requestID = 0;
            this.isQueueLoading = false;
            this.reloadQueueOnFinish = false;
            //  Can be used to listen to visibility changes in the layer list.
            // this._bindLayerChangeListeners();
        }

        addStreetNameLayer() {
            const streetNameByLocale = {
                'fr': 'Noms de rue',
                'de': 'Straßennamen',
                'nl': 'Straatnamen',
                'en-US': 'Street names' ,
                'en-EN': 'Street names'
            }

            if(this.config.showStreetName){
                const overlay = this.api.addOverlay({
                    name: streetNameByLocale[this.config.locale],
                    geojson: {
                        type: "FeatureCollection",
                        features: [],
                        crs: {
                            type: 'EPSG',
                            properties: {code: 3857}
                        }
                    }
                });
               return overlay.id
            }
            return null
        }

        _bindLayerChangeListeners(){
            const onChange = () => this.addOverlaysToViewer();
            const nonLoadedLayers = []
            const mapLayers = _.values(this.map._layers);
            const featureLayers = _.filter(mapLayers, l => l.type === 'Feature Layer');
            for (const layer of featureLayers) {
                layer.on('visibility-change', (info) => {
                    if(layer.graphics.length === 0 && !layer.hasZ){
                        nonLoadedLayers.push(layer.id);
                    } else {
                        this.widget._panoramaViewer.toggleOverlay({
                            id: this.overlaysByName[layer.name],
                            visible: !info.visible,
                            name: layer.name
                        })
                    }
                })

                layer.on('update-end', () => {
                    if(nonLoadedLayers.includes(layer.id)){
                        onChange();
                        nonLoadedLayers.splice(nonLoadedLayers.indexOf(layer.id), 1)
                    }
                })
            }
        }

        addOverlaysToViewer() {

            if(this.widget.config.overlays === false) return;

            this.removeOverlays();

            const mapLayers = _.values(this.map._layers);
            const featureLayers = _.filter(mapLayers, l => l.type === 'Feature Layer');
            const ID = ++this.requestID;
            const extent = this._calcRecordingExtent();
            const requestBundle = {ID, extent, req: []};
            _.each(featureLayers, (mapLayer) => {
                if(mapLayer.hasZ && mapLayer.version > 10.8) {
                    const requestObj = {mapLayer, overlayID: null};
                    requestBundle.req.push(requestObj);
                } else if (!mapLayer.hasZ && mapLayer.graphics.length === 0 && mapLayer.visible === false){
                    const requestObj = {mapLayer, overlayID: null};
                    requestBundle.req.push(requestObj);
                } else {
                    let geojson = this.createGeoJsonForFeature({mapLayer});
                    const sld = new SLD(mapLayer, geojson);
                    geojson = this.applyDefaultCaseIfNeeded(geojson, sld);
                    if(sld.xml === undefined){
                        return;
                    }
                    const overlay = this.api.addOverlay({
                        // sourceSrs: 'EPSG:3857',  // Broken in API
                        name: mapLayer.name,
                        sldXMLtext: sld.xml,
                        geojson: geojson,
                        visible: false
                    });

                    const oldId = this.widget._mapIdLayerId.hasOwnProperty(mapLayer.id) ?
                        this.widget._mapIdLayerId[mapLayer.id] :
                        undefined;

                    this.widget._mapIdLayerId[mapLayer.id] = overlay.id;
                    const layerVisible = oldId && this.widget._visibleLayers.hasOwnProperty(oldId) ?
                        this.widget._visibleLayers[oldId] :
                        mapLayer.visible;

                    if (this.widget._visibleLayers.hasOwnProperty(oldId)) {
                        delete this.widget._visibleLayers[oldId];
                    }

                    this.widget._visibleLayers[overlay.id] = layerVisible;
                    this.widget._panoramaViewer.toggleOverlay({ id: overlay.id, visible: !layerVisible, name: mapLayer.name})
                    this.overlaysByName[mapLayer.name] = overlay.id;
                    this.overlays.push(overlay.id);
                }
            });
            this.requestQueue.push(requestBundle);
            this._loadQueue();
        }

        _loadQueue() {
            if(this.isQueueLoading){
                this.reloadQueueOnFinish = true;
            } else {
                this.isQueueLoading = true;
                const item = this.requestQueue.pop();

                // if no item is present it is probably already being loaded, its just that multiple requestBundles triggered the loading of the most recent.
                if (item) {
                    for (const request of item.req) {
                        const token = request.mapLayer.credential &&  request.mapLayer.credential.token;

                        let knownFeatureIds = [];
                        for (const reqFeature of request.mapLayer.toJson().featureSet.features) {
                            knownFeatureIds.push(reqFeature.attributes[request.mapLayer.objectIdField]);
                        }

                        const options = {
                            url: `${request.mapLayer.url}/query?`,
                            content: {
                                f: 'json',
                                returnGeometry: true,
                                returnZ: true,
                                outFields: '*',
                                objectIds: [...knownFeatureIds],
                                outSR: this.wkid
                            }
                        };
                        if(token) options.content.token = token;

                        esriRequest(options).then((r) => {
                            this._handleRequest(r, item, request)
                        });
                    }

                    this.requestQueue = [];
                }
            }
        }

        _handleRequest(result, requestBundle, request) {

            if(this.reloadQueueOnFinish && !requestBundle.isComplete) {
                this.isQueueLoading = false;
                requestBundle.isComplete = true;
                this._loadQueue();
            }else if (this.reloadQueueOnFinish === false){
                const {mapLayer} = request;
                try {
                    const wkid = result.spatialReference && result.spatialReference.wkid;

                    let info;
                    if (wkid && result.features.length) {
                        info = this.createGeoJsonForFeature({
                            mapLayer,
                            wkid: wkid,
                            featureSet: result
                        });
                    } else {
                        // Bad result bypass:
                        //request.overlayID = 'No wkid or features found.';
                        info = this.createGeoJsonForFeature({
                            mapLayer
                        });
                    }

                    const sld = new SLD(mapLayer, info);
                    info = this.applyDefaultCaseIfNeeded(info, sld);
                    if(sld.xml === undefined){
                        return;
                    }
                    const overlay = this.api.addOverlay({
                        // sourceSrs: 'EPSG:3857',  // Broken in API
                        name: mapLayer.name,
                        sldXMLtext: sld.xml,
                        geojson: info,
                        visible: false
                    });

                    const oldId = this.widget._mapIdLayerId.hasOwnProperty(mapLayer.id) ?
                        this.widget._mapIdLayerId[mapLayer.id] :
                        undefined;

                    this.widget._mapIdLayerId[mapLayer.id] = overlay.id;
                    const layerVisible = oldId && this.widget._visibleLayers.hasOwnProperty(oldId) ?
                        this.widget._visibleLayers[oldId] :
                        mapLayer.visible;

                    if (this.widget._visibleLayers.hasOwnProperty(oldId)) {
                        delete this.widget._visibleLayers[oldId];
                    }

                    this.widget._visibleLayers[overlay.id] = layerVisible;

                    request.overlayID = overlay;
                    this.widget._panoramaViewer.toggleOverlay({ id: overlay.id, visible: !layerVisible, name: mapLayer.name})
                    this.overlaysByName[mapLayer.name] = overlay.id;
                    this.overlays.push(overlay.id);

                    let isBundleComplete = true;
                    for (const reg of requestBundle.req) {
                        if (!reg.overlayID) {
                            isBundleComplete = false;
                            break
                        }
                    }
                    if (isBundleComplete) {
                        this.isQueueLoading = false;
                    }
                } catch (e) {
                    request.overlayID = 'An error occured';

                    let isBundleComplete = true;
                    for (const reg of requestBundle.req) {
                        if (!reg.overlayID) {
                            isBundleComplete = false;
                            break
                        }
                    }
                    if (isBundleComplete) {
                        this.isQueueLoading = false;
                    }

                    throw e;
                }
            }

        }

        _calcRecordingExtent() {
            const recording = this.widget._panoramaViewer.getRecording();
            const featureRadius = 30;
            const {xyz, srs} = recording;
            // needs support for feet.
            const ext = new Extent(xyz[0] - featureRadius, xyz[1] - featureRadius, xyz[0] + featureRadius, xyz[1] + featureRadius, new SpatialReference(srs.split(':')[1]) )
            return ext
        }

        removeOverlays() {
            _.each(this.overlays, overlayId => {
                this.api.removeOverlay(overlayId);
            });
            this.overlays = [];
            this.overlaysByName = {}
        }

        // Doesn't need to remove the overlays from the viewer,
        // as this is used when we destroy the viewer.
        reset() {
            this.overlays = [];
            this.overlaysByName = {}
        }

        doesFeatureMatchCase(feature, sldCase) {
            if (!sldCase.filter) {
                return true;
            }
            return feature.properties[sldCase.filter.attribute] === sldCase.filter.value;
        }

        // Adds the SLD_DEFAULT_CASE when a feature
        // matchs none if the special cases of the SLD
        applyDefaultCaseIfNeeded(geojson, sld) {
            if (geojson.type === 'FeatureCollection' && sld.containsDefaultCase) {
                    const newFeatures = geojson.features.map((feature) => {
                        const newFeature = _.cloneDeep(feature);
                        let needsDefaultCase = true;

                        for (let i=0; i < sld.cases.length ; i++) {
                            const sldCase = sld.cases[i];
                            const match = this.doesFeatureMatchCase(feature, sldCase);
                            if (match) {
                                needsDefaultCase = false;
                                break;
                            }
                        }

                        if (needsDefaultCase) {
                            newFeature.properties['SLD_DEFAULT_CASE'] = 1;
                        }

                        return newFeature;
                    });
                    geojson.features = newFeatures;
                }

            return geojson;
        }

        createGeoJsonForFeature({ mapLayer, sld, featureSet, wkid }) {
            let arcgisFeatureSet = mapLayer.toJson().featureSet;
            let dates = []
            if(mapLayer){
                dates = mapLayer.fields.reduce((acc, field) => {
                    if(field.type === "esriFieldTypeDate") {
                        acc.push(field.name)
                    }
                    return acc
                }, dates)
            }

            const features = [];
            let changedSpatialReference = false;

            for (const featureS in arcgisFeatureSet.features) {
                const updateFeature = arcgisFeatureSet.features[featureS];
                const objectId = updateFeature.attributes[mapLayer.objectIdField];

                if (featureSet && featureSet.features) {
                    for (const featureZ in featureSet.features) {
                        const fromFeature = featureSet.features[featureZ];

                        if (fromFeature && objectId === fromFeature.attributes[mapLayer.objectIdField]) {
                            if (arcgisFeatureSet.geometryType === 'esriGeometryPoint') {
                                const z = fromFeature.geometry && fromFeature.geometry.z;

                                if (z) {
                                    updateFeature.geometry.z = z;
                                }

                                if (!updateFeature.geometry.spatialReference || updateFeature.geometry.spatialReference.wkid != this.config.srs.split(':')[1]) {
                                    const x = fromFeature.geometry && fromFeature.geometry.x;
                                    const y = fromFeature.geometry && fromFeature.geometry.y;
                                    const spatialReference = featureSet.spatialReference;

                                    if (x) {
                                        updateFeature.geometry.x = x;
                                    }

                                    if (y) {
                                        updateFeature.geometry.y = y;
                                    }

                                    if (spatialReference) {
                                        updateFeature.geometry.spatialReference = spatialReference;
                                    }
                                }
                            } else if (arcgisFeatureSet.geometryType === 'esriGeometryPolyline') {
                                const paths = fromFeature.geometry && fromFeature.geometry.paths;

                                if (paths.length === 1) {
                                    const points = paths[0].slice(0);

                                    for (const point in points) {
                                        const thisPoint = points[point];

                                        const z = thisPoint && thisPoint.length === 3 && thisPoint[2];
                                        const updatePaths = updateFeature.geometry && updateFeature.geometry.paths;

                                        if (updatePaths.length === 1 && updatePaths[0][point]) {
                                            if (z) {
                                                updatePaths[0][point][2] = z;
                                            }

                                            if (updateFeature.geometry.spatialReference.wkid != this.config.srs.split(':')[1]) {
                                                const x = thisPoint && thisPoint.length >= 1 && thisPoint[0];
                                                const y = thisPoint && thisPoint.length >= 2 && thisPoint[1]
                                                changedSpatialReference = true;

                                                if (x) {
                                                    updatePaths[0][point][0] = x;
                                                }

                                                if (y) {
                                                    updatePaths[0][point][1] = y;
                                                }
                                            }
                                        }
                                    }
                                }

                                const spatialReference = featureSet.spatialReference;

                                if (spatialReference && changedSpatialReference) {
                                    updateFeature.geometry.spatialReference = spatialReference;
                                }
                            } else if (arcgisFeatureSet.geometryType === 'esriGeometryPolygon') {
                                const rings = fromFeature.geometry && fromFeature.geometry.rings;

                                for (const ring in rings) {
                                    const thisRing = rings[ring];

                                    for (const point in thisRing) {
                                        const thisPoint = thisRing[point];

                                        const z = thisPoint && thisPoint.length === 3 && thisPoint[2];
                                        const updateRings = updateFeature.geometry && updateFeature.geometry.rings;

                                        if (updateRings.length > ring && updateRings[ring][point]) {
                                            if (z) {
                                                updateRings[ring][point][2] = z;
                                            }

                                            if (updateFeature.geometry.spatialReference.wkid != this.config.srs.split(':')[1]) {
                                                const x = thisPoint && thisPoint.length >= 1 && thisPoint[0];
                                                const y = thisPoint && thisPoint.length >= 2 && thisPoint[1]
                                                changedSpatialReference = true;

                                                if (x) {
                                                    updateRings[ring][point][0] = x;
                                                }

                                                if (y) {
                                                    updateRings[ring][point][1] = y;
                                                }
                                            }
                                        }
                                    }
                                }

                                const spatialReference = featureSet.spatialReference;

                                if (spatialReference && changedSpatialReference) {
                                    updateFeature.geometry.spatialReference = spatialReference;
                                }
                            }
                        }
                    }
                }

                features.push(updateFeature);
            }

            arcgisFeatureSet.features = features;

            const geojson = geoJsonUtils.arcgisToGeoJSON(arcgisFeatureSet, undefined, dates);

            // Make sure the panoramaviewer knows which srs this is in.
            let wkidToUse = _.get(arcgisFeatureSet, 'features[0].geometry.spatialReference.wkid', null) || wkid;
            if (wkidToUse) {
                wkidToUse = wkidToUse === 102100 ? 3857 : wkidToUse;
                const crs = {
                    type: 'EPSG',
                    properties: {
                        code: wkidToUse,
                    }
                };
                geojson.crs = crs;
            }
            return geojson;
        }
    }
});
