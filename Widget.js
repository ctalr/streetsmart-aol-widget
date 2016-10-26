

 window.ATLAS_HOST = 'https://atlas.cyclomedia.com';
// window.TILES_HOST = 'https://cyclotiles.blob.core.windows.net/streetsmarttiles';

var dojoConfig = {
    async: true,
    locale: 'en',
    paths: {
        'react': 'https://cdnjs.cloudflare.com/ajax/libs/react/15.3.0/react.min',
        'react-dom': 'https://cdnjs.cloudflare.com/ajax/libs/react/15.3.0/react-dom.min',
        'openlayers': 'https://cdnjs.cloudflare.com/ajax/libs/ol3/3.17.1/ol',
    }
};

require(dojoConfig, [], function() {
    return define([
        'dojo/_base/declare',
        'dojo/dom',
        'dojo/_base/lang',
        'dojo/on',
        'dojo/dom-style',
        'dojo/_base/Color',
        // 'esri/graphic',
        'esri/layers/FeatureLayer',
        // 'esri/layers/GraphicsLayer',
        // 'esri/geometry/Point',
        // 'esri/geometry/Polygon',
        // 'esri/geometry/ScreenPoint',
        'esri/SpatialReference',
        'esri/renderers/SimpleRenderer',
        //'esri/symbols/PictureMarkerSymbol',
        'esri/symbols/SimpleMarkerSymbol',
        'esri/symbols/SimpleLineSymbol',
        // 'esri/symbols/SimpleFillSymbol',
        // './FeatureManager',
        './utils',
        'jimu/BaseWidget',
        'https://streetsmart.cyclomedia.com/api/v16.1/Aperture.js',
        'https://streetsmart.cyclomedia.com/api/v16.1/StreetSmartApi.js'],
        function (declare, dom, lang, on, domStyle, Color, FeatureLayer, SpatialReference, SimpleRenderer, SimpleMarkerSymbol, SimpleLineSymbol, utils, BaseWidget, Aperture, StreetSmartApi) {
            //To create a widget, you need to derive from BaseWidget.
            return declare([BaseWidget], {
                // Custom widget code goes here

                baseClass: 'jimu-widget-streetsmartwidget',

                //this property is set by the framework when widget is loaded.
                name: 'CustomWidget',
                panoramaViewer: null,
                recordingClient: null,
                lyrRecordingPoints: null,
                lyrCameraIcon: null,
                featureManager: null,
                utils: null,
                _color: '#005293',



                //methods to communication with app container:

                postCreate: function() {
                    this.inherited(arguments);
                    var extent = this.map.extent;
                    console.log('postCreate');
                    var uName = this.config.uName;
                    var uPwd = this.config.uPwd;
                    var loc = this.config.locale;
                    var srs = 'EPSG:' + this.map.spatialReference.wkid;
                    if(extent) {
                        StreetSmartApi.init({
                            username: uName,
                            password: uPwd,
                            apiKey: 'C3oda7I1S_49-rgV63wtWbgtOXcVe3gJWPAVWnAZK3whi7UxCjMNWzIJyv4Fmrcp',
                            srs: srs,
                            locale: loc,
                            addressSettings: {
                                locale: loc,
                                database: 'CMDatabase'
                            }
                        }).then(function () {
                            console.log('Api init success');
                            this.panoramaViewer = StreetSmartApi.addPanoramaViewer(this.panoramaViewerDiv, {
                                recordingsVisible: true,
                                timeTravelVisible: true
                            });
                            this.panoramaViewer.openByImageId('5D42YLZN');
                        }.bind(this));
                    }else{
                        console.log("cannot open Cyclorama zoom into map");
                    }
                },

                startup: function() {
                    this.inherited(arguments);
                    console.log('startup');
                    this.utils = utils;
                    this.utils.setGeometryService("http://tasks.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer");
                    var credsCM =  { "user": this.config.uName, "password": this.config.uPwd},
                        base64userpwd = btoa(credsCM.user + ":" + credsCM.password);
                    this.recordingClient = new CM.aperture.WfsRecordingClient({
                        uriManager: new CM.aperture.WfsRecordingUriManager({
                            dataUri: ATLAS_HOST + "/Recordings/wfs",
                            withCredentials: true
                        }),
                        base64credentials: base64userpwd
                    });

                    CM.El.addEvent(this.recordingClient, "recordingloadsuccess", this._onRecordingLoadSuccess.bind(this));

                    var rgb = new Color.fromString(this._color).toRgb();
                    rgb.push(0.5);
                    this._color = Color.fromArray(rgb);

                    var ms = new SimpleMarkerSymbol(SimpleMarkerSymbol.STYLE_CIRCLE, 9, new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255, 255, 255]), 1), new Color.fromArray(rgb));
                    var ren = new SimpleRenderer(ms);

                    var emptyFeatureCollection = {
                        "layerDefinition": {
                            "geometryType": "esriGeometryPoint",
                            "fields": [{
                                "name": "id",
                                "alias": "ID",
                                "type": "esriFieldTypeOID"
                            }]
                        },
                        "featureSet": null
                    };
                    this.lyrRecordingPoints = new FeatureLayer(emptyFeatureCollection);
                    //this.lyrRecordingPoints.setVisibility(false);
                    this.lyrRecordingPoints.setRenderer(ren);
                    on(this.lyrRecordingPoints, "click", lang.hitch(this, this._clickRecordingPoint));
                    this.map.addLayer(this.lyrRecordingPoints);
                    this._loadRecordings(this.map.extent);

                    on(this.map, "extent-change", lang.hitch(this, function() {
                        this._loadRecordings(this.map.extent);
                    }));
                },

                _loadRecordings: function(extent) {
                    if (extent) {
                        this.recordingClient.requestWithinBBOX(extent.xmin, extent.ymin, extent.xmax, extent.ymax, this.map.spatialReference.wkid);
                    }
                },

                _onRecordingLoadSuccess: function(request) {
                    // TODO: remove custom symbol code (HD Cyclorama test stuff)
                    var makeSymbol = function(fillColor) {
                        return new SimpleMarkerSymbol(
                            SimpleMarkerSymbol.STYLE_CIRCLE, 9,
                            new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, [255, 255, 255], 1),
                            fillColor
                        );
                    };
                    var symbolMapping = {
                        Dcr9Tiling: makeSymbol([100, 100, 255, 0.8]),
                        Dcr10Tiling: makeSymbol([100, 255, 100, 0.8]),
                        NoTiling: makeSymbol([200, 100, 150, 0.8])
                    };

                    var recordings = this.recordingClient._recordings;
                    var graphics = [];
                    for (var i = 0; i < recordings.length; ++i) {
                        var attributes = { "recording_id": recordings[i].id };
                        var geom = new Point(recordings[i].xyz[0], recordings[i].xyz[1], new SpatialReference({ wkid: 102100 }));
                        var symbol = null;
                        var tileSchema = recordings[i].tileSchema;
                        //symbol = tileSchema in symbolMapping ? symbolMapping[tileSchema] : null;
                        var graphic = Graphic(geom, symbol, attributes, null);
                        graphics.push(graphic);
                    }

                    //Delete present points (if present), then add the new ones:
                    if (this.lyrRecordingPoints.graphics.length > 0) {
                        this.lyrRecordingPoints.applyEdits(null, null, this.lyrRecordingPoints.graphics);
                    }
                    this.lyrRecordingPoints.applyEdits(graphics, null, null);
                }//,

                // onOpen: function(){
                //   console.log('onOpen');
                // },

                // onClose: function(){
                //   console.log('onClose');
                // },

                // onMinimize: function(){
                //   console.log('onMinimize');
                // },

                // onMaximize: function(){
                //   console.log('onMaximize');
                // },

                // onSignIn: function(credential){
                //   /* jshint unused:false*/
                //   console.log('onSignIn');
                // },

                // onSignOut: function(){
                //   console.log('onSignOut');
                // }

                // onPositionChange: function(){
                //   console.log('onPositionChange');
                // },

                // resize: function(){
                //   console.log('resize');
                // }

                //methods to communication between widgets:

            });
        });
});