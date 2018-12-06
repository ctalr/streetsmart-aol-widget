define([
    'esri/renderers/SimpleRenderer',
    'esri/renderers/ClassBreaksRenderer',
    'esri/renderers/UniqueValueRenderer',
    'esri/symbols/SimpleMarkerSymbol'
], function (
    SimpleRenderer,
    ClassBreaksRenderer,
    UniqueValueRenderer,
    SimpleMarkerSymbol
) {
    'use strict';

    return class SLD {
        constructor(mapLayer) {
            this.mapLayer = mapLayer;
            this.containsDefaultCase = false;
            this.cases = this.generateCases();
            this.rules = this.cases.map(this.createRuleForSymbolCase.bind(this));
            this.xml = this.createXml();
        }

        // A mapLayer can render multiple symbols.
        // Each symbol represents a Rule in an SLD.
        // Create a symbol and its correspondig filter per unique symbol.
        generateCases() {
            const mapLayer = this.mapLayer;
            const renderer = mapLayer.renderer;
            if (renderer instanceof SimpleRenderer) {
                const symbol = _.cloneDeep(renderer.getSymbol());
                if(symbol.color) symbol.color.a *= mapLayer.opacity;
                if(symbol.outline && symbol.outline.color) symbol.outline.color.a *= mapLayer.opacity;
                return [{
                    filter: null, // Every symbol is the same, so no filtering needed
                    symbol,
                    geometryType: mapLayer.geometryType,
                }];
            }
            if (renderer instanceof UniqueValueRenderer) {
                const attribute = renderer.attributeField;

                const specialCases = renderer.infos.map((uniqueValue) => {
                    const symbol = _.cloneDeep(uniqueValue.symbol);
                    if(symbol.color) symbol.color.a *= mapLayer.opacity;
                    if(symbol.outline && symbol.outline.color) symbol.outline.color.a *= mapLayer.opacity;
                    return {
                        filter: {
                            value: uniqueValue.value,
                            attribute,
                        },
                        symbol,
                        geometryType: mapLayer.geometryType,
                    }
                });

                // Add the "else" symbol (default case) to the list
                if (renderer.defaultSymbol) {
                    this.containsDefaultCase = true;
                    const defaultCase = {
                        filter: {
                            value: 1,
                            attribute: 'SLD_DEFAULT_CASE',
                        },
                        symbol: renderer.defaultSymbol,
                        geometryType: mapLayer.geometryType,
                    };

                    return [defaultCase, ...specialCases];
                }

                return specialCases;
            }
            console.warn('Unsupported renderer found', mapLayer.name);
            return [{
                filter: null,
                symbol: renderer.defaultSymbol,
            }];
        }

        createRuleForSymbolCase({ filter, symbol, geometryType }) {
            return `
                <Rule>
                    ${this.createSldFilter(filter)}
                    ${this.createSymbolizer(symbol, { geometryType })}
                </Rule>
            `;
        }

        // Transform `infos` to filter
        createSldFilter(filter) {
            if (!filter) {
                return '';
            }
            const content = `<PropertyName>${filter.attribute}</PropertyName><Literal>${filter.value}</Literal>`
            return `<Filter><PropertyIsEqualTo>${content}</PropertyIsEqualTo></Filter>`;
        }

        _createStrokeAndFill(symbol) {
            let stroke = '';
            if (symbol.outline) {
                stroke = `<Stroke>
                    <SvgParameter name="stroke">${symbol.outline.color.toHex()}</SvgParameter>
                    <SvgParameter name="stroke-opacity">${symbol.outline.color.a}</SvgParameter>
                    <SvgParameter name="stroke-width">${symbol.outline.width}</SvgParameter>
                  </Stroke>`
            }
            const fill = `<Fill>
                <SvgParameter name="fill">${symbol.color.toHex()}</SvgParameter>
                <SvgParameter name="fill-opacity">${symbol.color.a}</SvgParameter>
              </Fill>`;
            return { stroke, fill };
        }

        // Transform arcGis symbol to SLD
        createSymbolizer(symbol, { geometryType }) {
            switch (geometryType) {
                case 'esriGeometryPolygon':
                    return this.createPolygonSymbolizer(symbol);
                case 'esriGeometryPolyline':
                    return this.createLineSymbolizer(symbol);
                case 'esriGeometryPoint':
                default:
                    return this.createPointSymbolizer(symbol);
            }
        }

        createPolygonSymbolizer(symbol) {
            const { stroke, fill } = this._createStrokeAndFill(symbol);
            return `
                <PolygonSymbolizer>
                    ${fill}
                    ${stroke}
                </PolygonSymbolizer>
            `;
        }

        createLineSymbolizer(symbol) {
            return `
                <LineSymbolizer>
                    <Stroke>
                        <SvgParameter name="stroke">${symbol.color.toHex()}</SvgParameter>
                        <SvgParameter name="stroke-opacity">${symbol.color.a}</SvgParameter>
                        <SvgParameter name="stroke-width">${symbol.width}</SvgParameter>
                    </Stroke>
                </LineSymbolizer>
            `;
        }

        _createWellKnownName(symbol) {
            // asdfsdfdsfasdfsaf
            switch (symbol.style) {
                case SimpleMarkerSymbol.STYLE_PATH:
                case SimpleMarkerSymbol.STYLE_SQUARE:
                case SimpleMarkerSymbol.STYLE_DIAMOND:
                    return 'square';
                case SimpleMarkerSymbol.STYLE_X:
                    // return 'x'; // The StreetSmartAPI does not support 'x'
                case SimpleMarkerSymbol.STYLE_CROSS:
                    return 'cross';
                case SimpleMarkerSymbol.STYLE_CIRCLE:
                default:
                    return 'circle';
            }
        }

        createPointSymbolizer(symbol) {
            let content = '';
            if(symbol === undefined) {
                return;
            }
            if (symbol.type === 'picturemarkersymbol') {
                content = `
                    <ExternalGraphic>
                       <OnlineResource xlink:type="simple" xlink:href="${symbol.url}" />
                       <Format>${symbol.contentType}</Format>
                    </ExternalGraphic>
                    <Size>100</Size>
                `;
            } else {
                const wellKnownName = this._createWellKnownName(symbol);
                let { stroke, fill } = this._createStrokeAndFill(symbol);

                // According to the arcgis docs:
                // The color property does not apply to marker symbols defined with the cross or x style.
                // Since these styles are wholly comprised of outlines, you must set the color of symbols with those styles via the setOutline() method.
                if (symbol.style === SimpleMarkerSymbol.STYLE_X ||
                    symbol.style === SimpleMarkerSymbol.STYLE_CROSS) {
                    fill = stroke;
                    stroke = '';
                }

                content = `
                    <Mark>
                        <WellKnownName>${wellKnownName}</WellKnownName>
                        ${fill}
                        ${stroke}
                    </Mark>
                    <Size>12</Size>
                `;
            }
            return `
            <PointSymbolizer>
                <Graphic>
                    ${content}
                </Graphic>
            </PointSymbolizer>
            `;
        }

        createXml() {
            const { mapLayer, rules } = this;

            return `<?xml version="1.0" encoding="UTF-8"?>
                    <sld:StyledLayerDescriptor version="1.1.0" 
                     xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd" 
                     xmlns="http://www.opengis.net/se" 
                     xmlns:sld="http://www.opengis.net/sld" 
                     xmlns:ogc="http://www.opengis.net/ogc" 
                     xmlns:xlink="http://www.w3.org/1999/xlink" 
                     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                    <sld:NamedLayer>
                        <Name>${mapLayer.name}</Name>
                        <sld:UserStyle>
                            <Title>${mapLayer.id}</Title>
                            <FeatureTypeStyle>
                                 ${rules.join('')}
                            </FeatureTypeStyle>
                        </sld:UserStyle>
                    </sld:NamedLayer>
                </sld:StyledLayerDescriptor>`;
        }
    }
});


