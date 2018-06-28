define([
    'dojo/_base/Color',
    'dojo/on',
    'dojo/_base/array',
    'esri/geometry/Point',
    'esri/geometry/Multipoint',
    'esri/geometry/Polygon',
    'esri/geometry/ScreenPoint',
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
    Point,
    Multipoint,
    Polygon,
    ScreenPoint,
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
        constructor({ map, wkid, config, StreetSmartApi }) {
            this.map = map;
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
        }

        addOverlaysToViewer() {
            this.removeOverlays();

            const mapLayers = _.values(this.map._layers);
            const featureLayers = _.filter(mapLayers, l => l.type === 'Feature Layer');
            _.each(featureLayers, (mapLayer) => {
                const sld = new SLD(mapLayer);
                const geojson = this.createGeoJsonForFeature({ mapLayer, sld });

                const overlay = this.api.addOverlay({
                    // sourceSrs: 'EPSG:3857',  // Broken in API
                    name: mapLayer.name,
                    sldXMLtext: sld.xml,
                    geojson
                });

                this.overlays.push(overlay.id);
            });
        }

        removeOverlays() {
            _.each(this.overlays, overlayId => {
                this.api.removeOverlay(overlayId);
            });
            this.overlays = [];
        }

        // Doesn't need to remove the overlays from the viewer,
        // as this is used when we destroy the viewer.
        reset() {
            this.overlays = [];
        }

        doesFeatureMatchCase(feature, sldCase) {
            if (!sldCase.filter) {
                return true;
            }
            return feature.properties[sldCase.filter.attribute] === sldCase.filter.value;
        }

        // Adds the SLD_DEFAULT_CASE when a feature
        // matchs none if the special cases of the SLD
        applyDefaultCaseIfNeeded(feature, sld) {
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
        }

        createGeoJsonForFeature({ mapLayer, sld }) {
            const arcgisFeatureSet = mapLayer.toJson().featureSet;
            const geojson = geoJsonUtils.arcgisToGeoJSON(arcgisFeatureSet);

            // We can't just create geoJson from the features of the maplayer.
            // To correctly apply the default case in the Unique Value Renderer,
            // we make the defaultCase a filter, and make the "other" features in the geoJSON
            // match by adding a SLD_DEFAULT_CASE:1 property.
            if (geojson.type === 'FeatureCollection' && sld.containsDefaultCase) {
                const newFeatures = geojson.features.map((feature) => {
                    return this.applyDefaultCaseIfNeeded(feature, sld);
                });
                geojson.features = newFeatures;
            }

            // Make sure the panoramaviewer knows which srs this is in.
            let wkid = _.get(arcgisFeatureSet, 'features[0].geometry.spatialReference.wkid', null);
            if (wkid) {
                wkid = wkid === 102100 ? 3857 : wkid;
                const crs = {
                    type: 'EPSG',
                    properties: {
                        code: wkid,
                    }
                };
                geojson.crs = crs;
            }
            return geojson;
        }
    }
});