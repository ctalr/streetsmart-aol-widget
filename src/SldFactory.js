define([
    'esri/renderers/SimpleRenderer',
    'esri/renderers/ClassBreaksRenderer',
    'esri/renderers/UniqueValueRenderer'
], function (
    SimpleRenderer,
    ClassBreaksRenderer,
    UniqueValueRenderer
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
                return [{
                    filter: null, // Every symbol is the same, so no filtering needed
                    symbol: renderer.getSymbol(),
                    geometryType: mapLayer.geometryType,
                }];
            }
            if (renderer instanceof UniqueValueRenderer) {
                const attribute = renderer.attributeField;

                const specialCases = renderer.infos.map((uniqueValue) => ({
                    filter: {
                        value: uniqueValue.value,
                        attribute,
                    },
                    symbol: uniqueValue.symbol,
                    geometryType: mapLayer.geometryType,
                }));

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

        createPointSymbolizer(symbol) {
            let content = '';
            if (symbol.type === 'picturemarkersymbol') {
                content = `
                    <ExternalGraphic>
                       <OnlineResource xlink:type="simple" xlink:href="${symbol.url}" />
                       <Format>${symbol.contentType}</Format>
                    </ExternalGraphic>
                    <Size>100</Size>
                `;
            } else {
                const { stroke, fill } = this._createStrokeAndFill(symbol);
                content = `
                    <Mark>
                        <WellKnownName>circle</WellKnownName>
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

            return `<sld:StyledLayerDescriptor version="1.0.0"
              xsi:schemaLocation="http://www.opengis.net/sldStyledLayerDescriptor.xsd"
              xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            >
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


