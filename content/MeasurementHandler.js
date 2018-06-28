define([
    'dojo/_base/Color',
    'dojo/on',
    'dojo/_base/array',
    'esri/geometry/Point',
    'esri/geometry/Polygon',
    'esri/geometry/ScreenPoint',
    'esri/graphic',
    'esri/symbols/SimpleMarkerSymbol',
    'esri/symbols/SimpleLineSymbol',
    'esri/symbols/SimpleFillSymbol',
    'esri/symbols/Font',
    'esri/renderers/SimpleRenderer',
    'esri/layers/GraphicsLayer',
    'esri/SpatialReference',
    'esri/symbols/TextSymbol',
    'esri/geometry/Polyline',
    './utils',
], function (
    Color,
    on,
    dojoArray,
    Point,
    Polygon,
    ScreenPoint,
    Graphic,
    SimpleMarkerSymbol,
    SimpleLineSymbol,
    SimpleFillSymbol,
    Font,
    SimpleRenderer,
    GraphicsLayer,
    SpatialReference,
    TextSymbol,
    Polyline,
    utils,
) {
    return class MeasurementHandler {
        constructor({ map, wkid, measureChange, layer, StreetSmartApi }) {
            this.map = map;
            this.wkid = wkid;
            this.measureChange = measureChange;
            this.layer = layer;
            this.StreetSmartApi = StreetSmartApi;
        }

        draw(measurementEvent) {
            if (!measurementEvent || !measurementEvent.detail) {
                return;
            }
            // Just draw everything again
            this.layer.clear();

            const {activeMeasurement} = measurementEvent.detail;
            if (!activeMeasurement || activeMeasurement.features.length === 0) {
                return;
            }

            this.drawActiveMeasurement(activeMeasurement);
        }

        drawActiveMeasurement(activeMeasurement) {
            const geometryType = activeMeasurement.features[0].geometry.type;
            switch (geometryType) {
                case 'Point':
                    return this.drawPointMeasurement(activeMeasurement);
                case 'LineString':
                    return this.drawLineMeasurement(activeMeasurement);
                case 'Polygon':
                    return this.drawPolygonMeasurement(activeMeasurement);
            }
        }

        _createPointLabel(text) {
            const bold = new Font(12, Font.WEIGHT_BOLD);
            const pointLabel = new TextSymbol(text, bold);
            pointLabel.setVerticalAlignment('bottom');
            pointLabel.setHorizontalAlignment('left');
            pointLabel.setOffset(5, 5);
            pointLabel.setColor('white');
            pointLabel.setHaloSize(2);
            pointLabel.setHaloColor(Color.fromString('black'));
            return pointLabel;
        }

        _createLineLabel(text) {
            const bold = new Font(10, Font.WEIGHT_BOLD);
            const pointLabel = new TextSymbol(text, bold);
            pointLabel.setColor('white');
            pointLabel.setHaloSize(1);
            pointLabel.setHaloColor(Color.fromString('black'));
            return pointLabel;
        }

        _transformPoints(coords) {
            const mapWkid = this.map.spatialReference.wkid;

            return coords.map(coord => {
                // Ignore incomplete forward intersection:
                if (_.includes(coord, null)) {
                    return null;
                }
                const pointViewer = new Point(coord[0], coord[1], new SpatialReference({ wkid: this.wkid }));
                const coordMap = utils.transformProj4js(pointViewer, mapWkid);
                return [coordMap.x, coordMap.y];
            })
        }

        _drawPoint(coord, index) {
            if (coord === null) {
                return;
            }

            const mapWkid = this.map.spatialReference.wkid;

            const pointMap = new Point(coord[0], coord[1], new SpatialReference({ wkid: mapWkid }));

            this.layer.add(new Graphic(pointMap, null));
            this.layer.add(new Graphic(pointMap, this._createPointLabel(`${index}`)));
        }

        _drawLines(transformedCoords) {
            const mapWkid = this.map.spatialReference.wkid;
            const validCoords = transformedCoords.filter(coord => coord !== null);

            if (validCoords.length <= 1) {
                return;
            }

            const polyJson = {
                paths: [validCoords],
                spatialReference: { wkid: mapWkid },
            };

            const lineGeom = new Polyline(polyJson);
            const lineSymbol = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([236, 122, 8, 0.8]), 4);
            this.layer.add(new Graphic(lineGeom, lineSymbol));
        }

        _drawPolygon(transformedCoords) {
            const mapWkid = this.map.spatialReference.wkid;
            const validCoords = transformedCoords.filter(coord => coord !== null);

            if (validCoords.length <= 1) {
                return;
            }

            const polyJson = {
                rings: [validCoords],
                spatialReference: { wkid: mapWkid },
            };

            const polygonGeom = new Polygon(polyJson);
            const outline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([236, 122, 8, 0.8]), 4);
            const symbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, outline, new Color([236, 122, 8, 0.4]));
            this.layer.add(new Graphic(polygonGeom, symbol));
        }

        _drawLineLabels(transformedCoords, derivedData) {
            const mapWkid = this.map.spatialReference.wkid;

            if (transformedCoords.length <= 1) {
                return;
            }

            _.each(transformedCoords, (coord, i) => {
                const lineLength = derivedData.segmentLengths.value[i];
                const nextCoord = transformedCoords[i + 1];

                if (lineLength === undefined || nextCoord === undefined || nextCoord === null || coord === null) {
                    return;
                }

                const x1 = (coord[0] + nextCoord[0]) / 2;
                const y1 = (coord[1] + nextCoord[1]) / 2;
                const lineLabelPoint = new Point(x1, y1, new SpatialReference({ wkid: mapWkid }));

                const readableLength = lineLength.toFixed(2) + derivedData.unit;

                this.layer.add(new Graphic(lineLabelPoint, this._createLineLabel(readableLength)));
            });
        }

        drawPointMeasurement(activeMeasurement) {
            const coords = activeMeasurement.features[0].geometry.coordinates;
            if (coords === null) {
                return;
            }

            const transformedCoords = this._transformPoints([coords]);

            this._drawPoint(transformedCoords[0], 1);
        }

        drawLineMeasurement(activeMeasurement){
            const coords = activeMeasurement.features[0].geometry.coordinates;
            const derivedData = activeMeasurement.features[0].properties.derivedData;
            if (coords === null) {
                return;
            }

            const transformedCoords = this._transformPoints(coords);

            this._drawLines(transformedCoords);
            this._drawLineLabels(transformedCoords, derivedData);

            // Draw the individual points in the lineMeasurement;
            _.each(transformedCoords, (coord, i) => this._drawPoint(coord, i + 1));
        }

        drawPolygonMeasurement(activeMeasurement) {
            const coords = activeMeasurement.features[0].geometry.coordinates[0];
            const derivedData = activeMeasurement.features[0].properties.derivedData;

            if (coords === null || coords.length < 2) {
                return;
            }

            const transformedCoords = this._transformPoints(coords);
            // The first and last coords are the same
            const uniqueCoords = _.clone(transformedCoords);
            uniqueCoords.pop();

            // Draw the line between the valid points, together with the lineLength derivedData
            // This only works when we have >= 2 distinct points
            if (uniqueCoords.length >= 2) {
                this._drawPolygon(transformedCoords);
                this._drawLineLabels(transformedCoords, derivedData);
            }

            // Draw the individual points
            _.each(uniqueCoords, (coord, i) => this._drawPoint(coord, i + 1));
        }
    }
});