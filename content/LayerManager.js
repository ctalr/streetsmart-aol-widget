define([
    'dojo/_base/Color',
    'dojo/on',
    'esri/geometry/Point',
    'esri/geometry/Polygon',
    'esri/geometry/ScreenPoint',
    'esri/graphic',
    'esri/symbols/SimpleMarkerSymbol',
    'esri/symbols/SimpleLineSymbol',
    'esri/symbols/SimpleFillSymbol',
    'esri/renderers/SimpleRenderer',
    'esri/layers/FeatureLayer',
    'esri/layers/GraphicsLayer',
    'esri/SpatialReference',
    './utils'
], function (
    Color,
    on,
    Point,
    Polygon,
    ScreenPoint,
    Graphic,
    SimpleMarkerSymbol,
    SimpleLineSymbol,
    SimpleFillSymbol,
    SimpleRenderer,
    FeatureLayer,
    GraphicsLayer,
    SpatialReference,
    utils
) {
    return class LayerManager {
        constructor({ map, wkid, onRecordingLayerClick, addEventListener, removeEventListener, setPanoramaViewerOrientation }) {
            this._recordingColor = new Color.fromString('#80B0FF');

            this.map = map;
            this.wkid = wkid;
            this.addEventListener = addEventListener;
            this.removeEventListener = removeEventListener;
            this.setPanoramaViewerOrientation = setPanoramaViewerOrientation;
            this.recordingLayer = this._createRecordingLayer({ onClick: onRecordingLayerClick });
            this.viewingConeLayer = this._createViewingConeLayer();
            this.measureLayer = this._createMeasureLayer();
            this.srs = new SpatialReference({ wkid });

        }

        addLayers() {
            this.map.addLayer(this.recordingLayer);
            this.map.addLayer(this.viewingConeLayer);
            this.addEventListener(this.viewingConeLayer, 'mouse-down', this.startConeInteraction.bind(this));
            this.map.addLayer(this.measureLayer);
        }

        removeLayers() {
            this.recordingLayer.clear();
            this.viewingConeLayer.clear();
            this.measureLayer.clear();
            this.map.removeLayer(this.recordingLayer);
            this.map.removeLayer(this.viewingConeLayer);
            this.map.removeLayer(this.measureLayer);
        }

        updateRecordings(recordingData) {
            this.recordingLayer.clear();

            recordingData.map((data) => {
                const coord = new Point(data.xyz[0], data.xyz[1], this.srs);

                const graphic = new Graphic(coord, null, {
                    recordingId: data.id,
                });
                this.recordingLayer.add(graphic);
            });
        };

        startConeInteraction(e) {
            this.map.disablePan();

            this._coneDragListener = this.addEventListener(this.map, 'mouse-drag', this._handleConeMoved.bind(this));
            this._coneDragEndListener = this.addEventListener(this.map, 'mouse-drag-end', this.stopConeInteraction.bind(this));
        };

        stopConeInteraction() {
            this.map.enablePan();
            this.removeEventListener(this._coneDragListener);
            this.removeEventListener(this._coneDragEndListener);
        };

        _handleConeMoved(e) {
            const yaw = this._calcYaw(this._currentPanoramaViewerPosition, e.mapPoint);
            const orientation = {
                yaw,
            };
            this.setPanoramaViewerOrientation(orientation);
        };

        _calcYaw(pt1, pt2) {
            const yDiff = pt2.y - pt1.y;
            const xDiff = pt2.x - pt1.x;
            const radians = Math.atan2(yDiff, xDiff);
            const angle = radians * 180 / Math.PI;
            return 90 - angle;
        };

        _createRecordingLayer({ onClick }) {
            const outline = new SimpleLineSymbol(
                SimpleLineSymbol.STYLE_SOLID,
                new Color([255, 255, 255]),
                1
            );

            const symbol = new SimpleMarkerSymbol({
                style: 'circle',
                color: this._recordingColor,
                size: 11,
                outline,
            });

            const renderer = new SimpleRenderer(symbol);
            const layer = new GraphicsLayer({ id: 'cmt_recordingLayer' });
            layer.setRenderer(renderer);

            on(layer, 'click', onClick);
            return layer;
        }

        _createViewingConeLayer() {
            const layer = new GraphicsLayer({ id: 'cmd_viewingConeLayer' });
            return layer;
        }

        _createMeasureLayer(){
            const measureCollection = {
                layerDefinition: {
                    geometryType: 'esriGeometryPoint',
                    fields: [{
                        name: 'id',
                        alias: 'ID',
                        type: 'esriFieldTypeOID'
                    }]
                },
                featureSet: null
            };

            const measureSymbol = new SimpleMarkerSymbol();
            measureSymbol.setStyle(SimpleMarkerSymbol.STYLE_CROSS);
            measureSymbol.setAngle(47);
            const renderer = new SimpleRenderer(measureSymbol);
            const layer = new FeatureLayer(measureCollection, {id: 'cmt_measure'});
            layer.setRenderer(renderer);
            return layer;
        }

        updateViewingCone(panoramaViewer) {
            const viewer = panoramaViewer._viewer;
            const recording = viewer._activeRecording;
            if (!recording || !recording.xyz) {
                return;
            }

            const x = recording.xyz[0];
            const y = recording.xyz[1];

            if (!x || !y) {
                return;
            }

            this.viewingConeLayer.clear();
            const viewerColor = new Color.fromArray(panoramaViewer.getViewerColor());
            const coord = new Point(x, y, this.srs);
            // Transform local SRS to Web Mercator:
            const coordLocal = utils.transformProj4js(coord, this.map.spatialReference.wkid);

            const yaw = viewer.getYaw();
            const hFov = viewer.getHFov();

            const factor = 70;
            const hhFov = hFov * 0.5;
            const leftFovX = Math.sin(yaw - hhFov) * factor;
            const leftFovY = -Math.cos(yaw - hhFov) * factor;
            const rightFovX = Math.sin(yaw + hhFov) * factor;
            const rightFovY = -Math.cos(yaw + hhFov) * factor;

            const mapPt = new Point(coordLocal.x, coordLocal.y, this.map.spatialReference);
            const cPt = this.map.toScreen(mapPt);
            this._currentPanoramaViewerPosition = mapPt;

            const a = this.map.toMap(new ScreenPoint(cPt.x, cPt.y));
            const b = this.map.toMap(new ScreenPoint(cPt.x + leftFovX, cPt.y + leftFovY));
            const c = this.map.toMap(new ScreenPoint(cPt.x + rightFovX, cPt.y + rightFovY));
            const d = this.map.toMap(new ScreenPoint(cPt.x, cPt.y));

            const activeRecordingSymbol = new SimpleMarkerSymbol({
                style: 'circle',
                color: viewerColor,
                size: 11,
            });

            const centerDot = new Graphic(mapPt, activeRecordingSymbol);
            this.viewingConeLayer.add(centerDot);

            const outline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_NULL, new Color(0, 0, 0, 1), 2);

            const symbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, outline, viewerColor);
            const polygon = new Polygon(this.map.spatialReference);
            polygon.addRing([[a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y], [a.x, a.y]]);
            const graphic = new Graphic(polygon, symbol);

            this.viewingConeLayer.add(graphic);
            this.viewingConeLayer.setVisibility(true);
        }
    }
});